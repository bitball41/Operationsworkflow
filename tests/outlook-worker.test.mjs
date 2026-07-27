import assert from "node:assert/strict";
import test from "node:test";

import {
  handleOutlookCallback,
  handleOutlookConnect,
  handleOutlookSend,
  outlookConnectionStatus,
} from "../worker/outlook.js";

class MemoryKV {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, String(value));
  }

  async delete(key) {
    this.values.delete(key);
  }
}

function env() {
  return {
    MICROSOFT_CLIENT_ID: "client-id",
    MICROSOFT_CLIENT_SECRET: "client-secret",
    MICROSOFT_TENANT: "common",
    OUTLOOK_TOKEN_ENCRYPTION_KEY: "test-only-encryption-key-that-is-long-enough",
    OUTLOOK_TOKENS: new MemoryKV(),
  };
}

function request(path, { method = "GET", auth = true } = {}) {
  return new Request(`https://operations.conno.fun${path}`, {
    method,
    headers: auth ? { authorization: "Bearer supabase-user-token" } : {},
  });
}

async function withFetch(handler, action) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await action();
  } finally {
    globalThis.fetch = original;
  }
}

function supabaseUserResponse() {
  return new Response(JSON.stringify({ id: "user-123", email: "owner@example.com" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("Outlook connect requires a verified Supabase session", async () => {
  const response = await handleOutlookConnect(request("/api/outlook/connect", { method: "POST", auth: false }), env());
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /Sign in to Supabase/i);
});

test("Outlook OAuth state is one-time and tokens are encrypted before KV storage", async () => {
  const bindings = env();
  let graphPayload = null;

  await withFetch(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) return supabaseUserResponse();
    if (target.includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: "Mail.Send",
        token_type: "Bearer",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target === "https://graph.microsoft.com/v1.0/me/sendMail") {
      graphPayload = JSON.parse(options.body);
      return new Response(null, { status: 202 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  }, async () => {
    const connect = await handleOutlookConnect(
      request("/api/outlook/connect", { method: "POST" }),
      bindings,
    );
    assert.equal(connect.status, 200);
    const { authorization_url: authorizationUrl } = await connect.json();
    const authorize = new URL(authorizationUrl);
    assert.equal(authorize.origin, "https://login.microsoftonline.com");
    assert.equal(authorize.searchParams.get("redirect_uri"), "https://operations.conno.fun/api/outlook/callback");
    assert.match(authorize.searchParams.get("scope"), /Mail\.Send/);
    assert.doesNotMatch(authorize.searchParams.get("scope"), /Mail\.Read/);
    assert.match(authorize.searchParams.get("scope"), /offline_access/);
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");

    const state = authorize.searchParams.get("state");
    assert.ok(await bindings.OUTLOOK_TOKENS.get(`outlook:state:${state}`));

    const callback = await handleOutlookCallback(
      request(`/api/outlook/callback?code=authorization-code&state=${encodeURIComponent(state)}`, { auth: false }),
      bindings,
    );
    assert.equal(callback.status, 302);
    assert.match(callback.headers.get("location"), /outlook=connected/);
    assert.equal(await bindings.OUTLOOK_TOKENS.get(`outlook:state:${state}`), null, "OAuth state is consumed once");

    const stored = await bindings.OUTLOOK_TOKENS.get("outlook:token:user-123");
    assert.ok(stored);
    assert.doesNotMatch(stored, /access-token|refresh-token/, "KV receives only ciphertext");

    const status = await outlookConnectionStatus(request("/api/status"), bindings);
    assert.equal(status.connected, true);

    const sent = await handleOutlookSend(
      request("/api/outlook/send", { method: "POST" }),
      bindings,
      { to: "lead@example.com", subject: "Website preview", body: "Here is the preview." },
    );
    assert.equal(sent.status, 200);
    assert.equal((await sent.json()).sent, true);
    assert.equal(graphPayload.message.toRecipients[0].emailAddress.address, "lead@example.com");
    assert.equal(graphPayload.saveToSentItems, true);
  });
});

test("Outlook callback rejects missing or replayed state", async () => {
  const response = await handleOutlookCallback(
    request("/api/outlook/callback?code=authorization-code&state=not-real", { auth: false }),
    env(),
  );
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /outlook=failed/);
});
