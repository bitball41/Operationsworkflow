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

async function mappedMember(member) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/rest/v1/team_members"));
    assert.equal(url.searchParams.get("user_id"), `eq.${WORKSPACE_ID}`);
    return Response.json(member);
  };
  try {
    return await authorizeWorkspaceMember({ email: "Employee@Example.com" }, {
      OPERATIONS_WORKSPACE_ID: WORKSPACE_ID,
      SUPABASE_SECRET_KEY: "sb_secret_test",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

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

test("a verified identity without an email claim is denied", async () => {
  const result = await authorizeWorkspaceMember({}, {
    OPERATIONS_WORKSPACE_ID: WORKSPACE_ID,
    SUPABASE_SECRET_KEY: "sb_secret_test",
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).error, "team_member_email_required");
});
