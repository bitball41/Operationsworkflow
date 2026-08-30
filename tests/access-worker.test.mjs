import assert from "node:assert/strict";
import test from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { clearAccessKeyCacheForTests, verifyCloudflareAccess } from "../worker/access.js";
import { authorizeWorkspaceMember } from "../worker/authorization.js";

const ISSUER = "https://operations-test.cloudflareaccess.com";
const AUDIENCE = "operations-audience";
const WORKSPACE_ID = "2847b8e2-8a34-4a72-8e44-2cfc1be4255b";

function request(host = "operations.conno.fun", token = "") {
  return new Request(`https://${host}/`, {
    headers: token ? { "cf-access-jwt-assertion": token } : {},
  });
}

test("Cloudflare Access verification fails closed when it is not configured", async () => {
  const result = await verifyCloudflareAccess(request(), {});
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
});

test("Cloudflare Access verification requires an assertion on production hosts", async () => {
  const result = await verifyCloudflareAccess(request(), {
    CF_ACCESS_TEAM_DOMAIN: ISSUER,
    CF_ACCESS_AUD: AUDIENCE,
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
});

test("Access client id headers are not treated as a verified identity", async () => {
  const result = await verifyCloudflareAccess(new Request("https://operations.conno.fun/", {
    headers: {
      "CF-Access-Client-Id": "spoofed.access",
      "CF-Access-Client-Secret": "spoofed-secret",
    },
  }), {
    CF_ACCESS_TEAM_DOMAIN: ISSUER,
    CF_ACCESS_AUD: AUDIENCE,
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
});

test("Cloudflare Access signatures, issuer, and audience are verified", async () => {
  clearAccessKeyCacheForTests();
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const token = await new SignJWT({ email: "operator@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), `${ISSUER}/cdn-cgi/access/certs`);
    return Response.json({ keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }] });
  };
  try {
    const valid = await verifyCloudflareAccess(request("operations.conno.fun", token), {
      CF_ACCESS_TEAM_DOMAIN: ISSUER,
      CF_ACCESS_AUD: AUDIENCE,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.claims.email, "operator@example.com");

    const expiredToken = await new SignJWT({ email: "operator@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    const expired = await verifyCloudflareAccess(request("operations.conno.fun", expiredToken), {
      CF_ACCESS_TEAM_DOMAIN: ISSUER,
      CF_ACCESS_AUD: AUDIENCE,
    });
    assert.equal(expired.ok, false);

    const { privateKey: forgedPrivateKey } = await generateKeyPair("RS256");
    const forgedToken = await new SignJWT({ email: "attacker@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(forgedPrivateKey);
    const forged = await verifyCloudflareAccess(request("operations.conno.fun", forgedToken), {
      CF_ACCESS_TEAM_DOMAIN: ISSUER,
      CF_ACCESS_AUD: AUDIENCE,
    });
    assert.equal(forged.ok, false);

    const wrongAudience = await verifyCloudflareAccess(request("operations.conno.fun", token), {
      CF_ACCESS_TEAM_DOMAIN: ISSUER,
      CF_ACCESS_AUD: "another-application",
    });
    assert.equal(wrongAudience.ok, false);
    assert.equal(wrongAudience.response.status, 403);

    const serviceToken = await new SignJWT({ type: "app", common_name: "Buisness Manager", sub: "" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const serviceAuth = await verifyCloudflareAccess(request("operations.conno.fun", serviceToken), {
      CF_ACCESS_TEAM_DOMAIN: ISSUER,
      CF_ACCESS_AUD: AUDIENCE,
    });
    assert.equal(serviceAuth.ok, true);
    assert.equal(serviceAuth.claims.common_name, "Buisness Manager");
    assert.equal(serviceAuth.claims.email, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    clearAccessKeyCacheForTests();
  }
});

test("the development bypass is restricted to localhost", async () => {
  const env = { ALLOW_LOCAL_DEVELOPMENT: "true" };
  const local = await verifyCloudflareAccess(request("localhost"), env);
  assert.equal(local.ok, true);

  const production = await verifyCloudflareAccess(request("operations.conno.fun"), env);
  assert.equal(production.ok, false);
  assert.equal(production.response.status, 503);
});

async function mappedMember(member, claims = { email: "Employee@Example.com" }, extraEnv = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/rest/v1/team_members"));
    assert.equal(url.searchParams.get("user_id"), `eq.${WORKSPACE_ID}`);
    return Response.json(member);
  };
  try {
    return await authorizeWorkspaceMember(claims, {
      OPERATIONS_WORKSPACE_ID: WORKSPACE_ID,
      SUPABASE_SECRET_KEY: "sb_secret_test",
      ...extraEnv,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const OWNER_MEMBER = {
  id: "10000000-0000-4000-8000-000000000001",
  full_name: "Connor",
  access_email: "cj.nissim@icloud.com",
  role: "owner",
  status: "active",
  permissions: {},
};

test("verified Access email claims map to active owner and salesperson records", async () => {
  for (const role of ["owner", "salesperson"]) {
    const result = await mappedMember({
      id: `10000000-0000-4000-8000-00000000000${role === "owner" ? 1 : 2}`,
      full_name: role === "owner" ? "Owner" : "Sales Person",
      access_email: "employee@example.com",
      role,
      status: "active",
      permissions: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.member.role, role);
    assert.equal(result.member.access_email, "employee@example.com");
  }
});

test("unknown and inactive Access identities fail closed", async () => {
  const unknown = await mappedMember(null);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.response.status, 403);
  assert.equal((await unknown.response.json()).error, "team_member_unknown");

  const inactive = await mappedMember({
    id: "10000000-0000-4000-8000-000000000003",
    full_name: "Inactive Person",
    access_email: "employee@example.com",
    role: "salesperson",
    status: "inactive",
    permissions: {},
  });
  assert.equal(inactive.ok, false);
  assert.equal(inactive.response.status, 403);
  assert.equal((await inactive.response.json()).error, "team_member_inactive");
});

test("the Buisness Manager Access service token maps to the active owner", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/rest/v1/team_members"));
    assert.equal(url.searchParams.get("access_email"), "ilike.cj.nissim@icloud.com");
    return Response.json(OWNER_MEMBER);
  };
  try {
    const result = await authorizeWorkspaceMember({
      type: "app",
      common_name: "Buisness Manager",
      sub: "",
    }, {
      OPERATIONS_WORKSPACE_ID: WORKSPACE_ID,
      SUPABASE_SECRET_KEY: "sb_secret_test",
    });
    assert.equal(result.ok, true);
    assert.equal(result.member.role, "owner");
    assert.equal(result.member.full_name, "Connor");
    assert.equal(result.member.access_email, "cj.nissim@icloud.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a configured Access service-token client id maps to the active owner", async () => {
  const result = await mappedMember(OWNER_MEMBER, {
    type: "app",
    common_name: "e367826f93b8d71185e03fe518aff3b4.access",
    sub: "",
  }, {
    CF_ACCESS_OWNER_SERVICE_TOKEN: "e367826f93b8d71185e03fe518aff3b4.access",
  });
  assert.equal(result.ok, true);
  assert.equal(result.member.role, "owner");
  assert.equal(result.member.access_email, "cj.nissim@icloud.com");
});

test("a JWT missing both email and service-token identity fails closed", async () => {
  let fetched = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetched = true;
    return Response.json(OWNER_MEMBER);
  };
  try {
    const missing = await authorizeWorkspaceMember({}, {
      OPERATIONS_WORKSPACE_ID: WORKSPACE_ID,
      SUPABASE_SECRET_KEY: "sb_secret_test",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.response.status, 403);
    assert.equal((await missing.response.json()).error, "team_member_email_required");
    assert.equal(fetched, false);

    const unknownToken = await authorizeWorkspaceMember({
      type: "app",
      common_name: "Some Other Automation",
      sub: "",
    }, {
      OPERATIONS_WORKSPACE_ID: WORKSPACE_ID,
      SUPABASE_SECRET_KEY: "sb_secret_test",
    });
    assert.equal(unknownToken.ok, false);
    assert.equal(unknownToken.response.status, 403);
    assert.equal((await unknownToken.response.json()).error, "team_member_email_required");
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
