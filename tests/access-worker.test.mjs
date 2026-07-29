import assert from "node:assert/strict";
import test from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { clearAccessKeyCacheForTests, verifyCloudflareAccess } from "../worker/access.js";

const ISSUER = "https://operations-test.cloudflareaccess.com";
const AUDIENCE = "operations-audience";

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
