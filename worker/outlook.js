/**
 * Outlook OAuth and Microsoft Graph mail transport.
 *
 * Every mailbox connection belongs to a verified Supabase user. OAuth state
 * and encrypted refresh tokens live in the OUTLOOK_TOKENS KV binding; Microsoft
 * credentials and the encryption key remain Worker secrets.
 */
import { OUTLOOK, SUPABASE } from "./upstreams.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const TOKEN_PREFIX = "outlook:token:";
const STATE_PREFIX = "outlook:state:";
const STATE_TTL_SECONDS = 10 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function missingConfiguration(env) {
  const required = [
    ["MICROSOFT_CLIENT_ID", env?.MICROSOFT_CLIENT_ID],
    ["MICROSOFT_CLIENT_SECRET", env?.MICROSOFT_CLIENT_SECRET],
    ["OUTLOOK_TOKEN_ENCRYPTION_KEY", env?.OUTLOOK_TOKEN_ENCRYPTION_KEY],
    ["OUTLOOK_TOKENS", env?.OUTLOOK_TOKENS],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}

function tenant(env) {
  return String(env?.MICROSOFT_TENANT || "common").trim() || "common";
}

function bearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function authenticatedSupabaseUser(request) {
  const token = bearerToken(request);
  if (!token) return null;

  const response = await fetch(SUPABASE.user, {
    headers: {
      apikey: SUPABASE.publishableKey,
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  if (!response.ok) return null;

  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

function base64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function bytesFromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64url(bytes) {
  return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomValue(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64url(new Uint8Array(digest));
}

async function encryptionKey(env) {
  const material = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(String(env.OUTLOOK_TOKEN_ENCRYPTION_KEY)),
  );
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptRecord(env, value) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    encoder.encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    version: 1,
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  });
}

async function decryptRecord(env, raw) {
  const envelope = JSON.parse(raw);
  if (envelope?.version !== 1 || !envelope.iv || !envelope.ciphertext) {
    throw new Error("The stored Outlook connection is not readable.");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesFromBase64(envelope.iv) },
    await encryptionKey(env),
    bytesFromBase64(envelope.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}

async function loadToken(env, userId) {
  const raw = await env.OUTLOOK_TOKENS.get(`${TOKEN_PREFIX}${userId}`);
  return raw ? decryptRecord(env, raw) : null;
}

async function saveToken(env, userId, token) {
  await env.OUTLOOK_TOKENS.put(`${TOKEN_PREFIX}${userId}`, await encryptRecord(env, token));
}

function callbackUri(request) {
  return new URL("/api/outlook/callback", request.url).toString();
}

function appRedirect(request, result, detail = "") {
  const target = new URL("/", request.url);
  target.hash = `#/integrations?outlook=${encodeURIComponent(result)}${detail ? `&detail=${encodeURIComponent(detail)}` : ""}`;
  return Response.redirect(target.toString(), 302);
}

function decodeIdTokenAccount(idToken) {
  try {
    const payload = String(idToken || "").split(".")[1] || "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(decoder.decode(bytesFromBase64(normalized)));
    return claims.preferred_username || claims.email || "";
  } catch {
    return "";
  }
}

async function exchangeCode(env, state, code) {
  const form = new URLSearchParams({
    client_id: String(env.MICROSOFT_CLIENT_ID),
    client_secret: String(env.MICROSOFT_CLIENT_SECRET),
    grant_type: "authorization_code",
    code,
    redirect_uri: state.redirect_uri,
    code_verifier: state.code_verifier,
    scope: OUTLOOK.scopes.join(" "),
  });
  const response = await fetch(OUTLOOK.token(tenant(env)), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error("Microsoft did not return a reusable Outlook connection.");
  }
  return payload;
}

async function refreshAccessToken(env, userId, current) {
  const form = new URLSearchParams({
    client_id: String(env.MICROSOFT_CLIENT_ID),
    client_secret: String(env.MICROSOFT_CLIENT_SECRET),
    grant_type: "refresh_token",
    refresh_token: current.refresh_token,
    scope: OUTLOOK.scopes.join(" "),
  });
  const response = await fetch(OUTLOOK.token(tenant(env)), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error("The Outlook connection expired. Reconnect it from Integrations.");
  }

  const next = {
    ...current,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || current.refresh_token,
    expires_at: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
    scope: payload.scope || current.scope,
    updated_at: new Date().toISOString(),
  };
  await saveToken(env, userId, next);
  return next;
}

async function usableToken(env, userId, { forceRefresh = false } = {}) {
  const token = await loadToken(env, userId);
  if (!token?.refresh_token) return null;
  if (forceRefresh || !token.access_token || Number(token.expires_at) <= Date.now() + 60_000) {
    return refreshAccessToken(env, userId, token);
  }
  return token;
}

export async function outlookConnectionStatus(request, env) {
  const configured = missingConfiguration(env).length === 0;
  if (!configured) return { configured: false, connected: false };

  const user = await authenticatedSupabaseUser(request).catch(() => null);
  if (!user) return { configured: true, connected: false };

  const token = await loadToken(env, user.id).catch(() => null);
  return {
    configured: true,
    connected: Boolean(token?.refresh_token),
    account: token?.account || "",
  };
}

export async function handleOutlookConnect(request, env) {
  const missing = missingConfiguration(env);
  if (missing.length) {
    return json({
      error: "not_connected",
      provider: "outlook",
      message: `Outlook is not configured on this Worker. Missing: ${missing.join(", ")}.`,
    }, 503);
  }

  const user = await authenticatedSupabaseUser(request);
  if (!user) {
    return json({
      error: "unauthorized",
      message: "Sign in to Supabase before connecting Outlook.",
    }, 401);
  }

  const state = randomValue(32);
  const codeVerifier = randomValue(64);
  const redirectUri = callbackUri(request);
  await env.OUTLOOK_TOKENS.put(`${STATE_PREFIX}${state}`, JSON.stringify({
    user_id: user.id,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    created_at: new Date().toISOString(),
  }), { expirationTtl: STATE_TTL_SECONDS });

  const authorize = new URL(OUTLOOK.authorize(tenant(env)));
  authorize.search = new URLSearchParams({
    client_id: String(env.MICROSOFT_CLIENT_ID),
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: OUTLOOK.scopes.join(" "),
    state,
    code_challenge: await pkceChallenge(codeVerifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  return json({ authorization_url: authorize.toString() });
}

export async function handleOutlookCallback(request, env) {
  const url = new URL(request.url);
  const stateValue = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (url.searchParams.get("error")) return appRedirect(request, "cancelled");
  if (!stateValue || !code || missingConfiguration(env).length) {
    return appRedirect(request, "failed", "The Outlook callback was incomplete.");
  }

  const stateKey = `${STATE_PREFIX}${stateValue}`;
  const rawState = await env.OUTLOOK_TOKENS.get(stateKey);
  await env.OUTLOOK_TOKENS.delete(stateKey);
  if (!rawState) return appRedirect(request, "failed", "The Outlook connection request expired.");

  try {
    const state = JSON.parse(rawState);
    if (!state.user_id || state.redirect_uri !== callbackUri(request)) {
      return appRedirect(request, "failed", "The Outlook connection request was invalid.");
    }

    const payload = await exchangeCode(env, state, code);
    await saveToken(env, state.user_id, {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
      scope: payload.scope || OUTLOOK.scopes.join(" "),
      token_type: payload.token_type || "Bearer",
      account: decodeIdTokenAccount(payload.id_token),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return appRedirect(request, "connected");
  } catch {
    return appRedirect(request, "failed", "Microsoft could not complete the Outlook connection.");
  }
}

export async function handleOutlookDisconnect(request, env) {
  if (missingConfiguration(env).length) {
    return json({ error: "not_connected", provider: "outlook", message: "Outlook is not configured." }, 503);
  }
  const user = await authenticatedSupabaseUser(request);
  if (!user) return json({ error: "unauthorized", message: "Sign in before disconnecting Outlook." }, 401);
  await env.OUTLOOK_TOKENS.delete(`${TOKEN_PREFIX}${user.id}`);
  return json({ disconnected: true });
}

function validRecipient(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

async function sendWithAccessToken(accessToken, payload) {
  return fetch(OUTLOOK.sendMail, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: payload.subject,
        body: { contentType: "Text", content: payload.body },
        toRecipients: [{ emailAddress: { address: payload.to } }],
      },
      saveToSentItems: true,
    }),
  });
}

export async function handleOutlookSend(request, env, payload) {
  const missing = missingConfiguration(env);
  if (missing.length) {
    return json({
      error: "not_connected",
      provider: "outlook",
      message: `Outlook is not configured on this Worker. Missing: ${missing.join(", ")}.`,
    }, 503);
  }

  const user = await authenticatedSupabaseUser(request);
  if (!user) return json({ error: "unauthorized", message: "Sign in before sending email." }, 401);

  const to = String(payload?.to || "").trim();
  const subject = String(payload?.subject || "").trim();
  const body = String(payload?.body || "");
  if (!validRecipient(to) || !subject || subject.length > 300 || !body || body.length > 100_000) {
    return json({
      error: "invalid_request",
      message: "A valid recipient, a subject under 300 characters, and a non-empty email body are required.",
    }, 400);
  }

  let token;
  try {
    token = await usableToken(env, user.id);
  } catch (error) {
    return json({ error: "not_connected", provider: "outlook", message: error.message }, 503);
  }
  if (!token) {
    return json({
      error: "not_connected",
      provider: "outlook",
      message: "Outlook is not connected. Connect it from Integrations before sending.",
    }, 503);
  }

  let response = await sendWithAccessToken(token.access_token, { to, subject, body });
  if (response.status === 401) {
    try {
      token = await usableToken(env, user.id, { forceRefresh: true });
      response = await sendWithAccessToken(token.access_token, { to, subject, body });
    } catch (error) {
      return json({ error: "not_connected", provider: "outlook", message: error.message }, 503);
    }
  }

  if (response.status === 202) return json({ sent: true, provider: "outlook" });
  if (response.status === 429) {
    return json(
      { error: "rate_limited", provider: "outlook", message: "Outlook is temporarily rate-limiting sends. Try again later." },
      429,
      response.headers.get("retry-after") ? { "retry-after": response.headers.get("retry-after") } : {},
    );
  }
  return json({
    error: "send_failed",
    provider: "outlook",
    message: "Microsoft Graph did not accept the email. Nothing was marked as sent.",
  }, 502);
}
