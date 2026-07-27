import assert from "node:assert/strict";
import test from "node:test";

import {
  handleOutlookCallback,
  handleOutlookConnect,
  handleOutlookMessages,
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
    /* Mail.Read is what lets the Inbox exist at all; without it the mailbox is
       write-only and no reply ever reaches the dashboard. */
    assert.match(authorize.searchParams.get("scope"), /Mail\.Read/);
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

/* ---------- status, inbox and multiple recipients ---------- */

async function connectedBindings({ scope = "Mail.Send Mail.Read" } = {}) {
  const bindings = env();
  await withFetch(async (url) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) return supabaseUserResponse();
    if (target.includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope,
        token_type: "Bearer",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  }, async () => {
    const connect = await handleOutlookConnect(request("/api/outlook/connect", { method: "POST" }), bindings);
    const state = new URL((await connect.json()).authorization_url).searchParams.get("state");
    await handleOutlookCallback(
      request(`/api/outlook/callback?code=authorization-code&state=${encodeURIComponent(state)}`, { auth: false }),
      bindings,
    );
  });
  return bindings;
}

test("status tells the three Outlook failure states apart", async () => {
  /* Missing secrets is not the same as "you have not connected a mailbox", and
     reporting both as `false` is what made a working Worker look unconfigured. */
  const unconfigured = await outlookConnectionStatus(request("/api/status"), { OUTLOOK_TOKENS: new MemoryKV() });
  assert.equal(unconfigured.configured, false);
  assert.ok(unconfigured.missing.includes("MICROSOFT_CLIENT_ID"));

  await withFetch(async () => new Response("no", { status: 401 }), async () => {
    const anonymous = await outlookConnectionStatus(request("/api/status", { auth: false }), env());
    assert.equal(anonymous.configured, true, "the Worker is configured");
    assert.equal(anonymous.signed_in, false, "but nobody is signed in");
    assert.equal(anonymous.connected, false);
  });

  const bindings = await connectedBindings();
  await withFetch(async () => supabaseUserResponse(), async () => {
    const connected = await outlookConnectionStatus(request("/api/status"), bindings);
    assert.equal(connected.configured, true);
    assert.equal(connected.signed_in, true);
    assert.equal(connected.connected, true);
    assert.equal(connected.can_read_mail, true);
  });
});

test("sending accepts several recipients and rejects a bad address", async () => {
  const bindings = await connectedBindings();
  let payload = null;

  await withFetch(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) return supabaseUserResponse();
    if (target === "https://graph.microsoft.com/v1.0/me/sendMail") {
      payload = JSON.parse(options.body);
      return new Response(null, { status: 202 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  }, async () => {
    const sent = await handleOutlookSend(request("/api/outlook/send", { method: "POST" }), bindings, {
      to: "one@example.com, two@example.com",
      cc: ["copy@example.com"],
      subject: "Preview",
      body: "Here it is.",
    });
    assert.equal(sent.status, 200);
    assert.deepEqual(
      payload.message.toRecipients.map((entry) => entry.emailAddress.address),
      ["one@example.com", "two@example.com"],
    );
    assert.equal(payload.message.ccRecipients[0].emailAddress.address, "copy@example.com");

    const rejected = await handleOutlookSend(request("/api/outlook/send", { method: "POST" }), bindings, {
      to: "not-an-address",
      subject: "Preview",
      body: "Here it is.",
    });
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).message, /not a valid email address/i);
  });
});

test("the inbox is readable once, and only once, Mail.Read was granted", async () => {
  const sendOnly = await connectedBindings({ scope: "Mail.Send" });
  await withFetch(async () => supabaseUserResponse(), async () => {
    const refused = await handleOutlookMessages(
      request("/api/outlook/messages"),
      sendOnly,
      new URL("https://operations.conno.fun/api/outlook/messages"),
    );
    assert.equal(refused.status, 503);
    assert.match((await refused.json()).message, /reconnect/i);
  });

  const bindings = await connectedBindings();
  let requested = "";
  await withFetch(async (url) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) return supabaseUserResponse();
    if (target.startsWith("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages")) {
      requested = target;
      return new Response(JSON.stringify({
        value: [{
          id: "message-1",
          conversationId: "thread-1",
          subject: "Re: your website",
          from: { emailAddress: { name: "Dana", address: "Dana@Example.com" } },
          toRecipients: [{ emailAddress: { address: "owner@example.com" } }],
          receivedDateTime: "2026-07-26T18:00:00Z",
          bodyPreview: "Looks great, what next?",
          isRead: false,
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  }, async () => {
    const url = new URL("https://operations.conno.fun/api/outlook/messages?since=2026-07-20T00:00:00Z&limit=5");
    const response = await handleOutlookMessages(request("/api/outlook/messages"), bindings, url);
    assert.equal(response.status, 200);

    const { messages } = await response.json();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].thread_id, "thread-1");
    assert.equal(messages[0].from_email, "dana@example.com", "addresses are normalised for lead matching");
    assert.equal(messages[0].unread, true);
    assert.match(requested, /\$filter=receivedDateTime%20gt%202026-07-20/, "OData options keep their literal $ and use %20");
    assert.match(requested, /\$top=5/);
  });
});
