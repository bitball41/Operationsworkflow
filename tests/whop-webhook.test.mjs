import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { handleWhopWebhook } from "../worker/whop.js";

const SECRET = "whsec_dGVzdC1zZWNyZXQ=";
const ENV = {
  WHOP_WEBHOOK_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
  WHOP_OWNER_USER_ID: "11111111-1111-4111-8111-111111111111",
};

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

async function signedRequest(payload, { id = "msg_123", timestamp = Math.floor(Date.now() / 1000), signature } = {}) {
  const rawBody = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)));
  return new Request("https://hooks.conno.fun/whop", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": signature || `v1,${toBase64(signed)}`,
    },
    body: rawBody,
  });
}

async function withFetch(handler, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

test("a valid signed Whop event is normalized and sent only to the server-side RPC", async () => {
  let request;
  const response = await withFetch(async (url, init) => {
    request = { url: String(url), init };
    return Response.json({ duplicate: false, payment_id: "pay-row" });
  }, async () => handleWhopWebhook(await signedRequest({
    type: "payment.succeeded",
    data: { id: "whop-payment-1", status: "succeeded", final_amount: 500, user: { name: "Taylor" } },
  }), ENV));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).payment_id, "pay-row");
  assert.match(request.url, /\/rpc\/ingest_whop_webhook$/);
  assert.equal(request.init.headers.apikey, ENV.SUPABASE_SERVICE_ROLE_KEY);
  const payload = JSON.parse(request.init.body);
  assert.equal(payload.p_user_id, ENV.WHOP_OWNER_USER_ID);
  assert.equal(payload.p_payment.external_transaction_id, "whop-payment-1");
  assert.equal(payload.p_payment.status, "paid");
});

test("forged signatures cannot create receipts or payments", async () => {
  let called = 0;
  const response = await withFetch(async () => {
    called += 1;
    return Response.json({});
  }, async () => handleWhopWebhook(await signedRequest({
    type: "payment.succeeded",
    data: { id: "whop-payment-2", status: "succeeded", final_amount: 100 },
  }, { signature: "v1,Zm9yZ2Vk" }), ENV));

  assert.equal(response.status, 401);
  assert.equal(called, 0);
});

test("a replay is accepted without a second payment write, and refunds use the existing status mapping", async () => {
  let body;
  const response = await withFetch(async (_url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ duplicate: true });
  }, async () => handleWhopWebhook(await signedRequest({
    type: "refund.updated",
    data: { id: "whop-payment-3", status: "paid", refunded_amount: 500, final_amount: 500 },
  }, { id: "msg_replayed" }), ENV));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).duplicate, true);
  assert.equal(body.p_payment.status, "refunded");
});

test("the public webhook hostname exposes only POST /whop", async () => {
  const env = { ...ENV, DEMO_DOMAIN: "demos.conno.fun", DEMO_SITES: { get: async () => null } };
  assert.equal((await worker.fetch(new Request("https://hooks.conno.fun/"), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://hooks.conno.fun/whop"), env)).status, 405);
});
