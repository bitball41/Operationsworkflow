import { toPaymentRecord } from "../js/services/payments/normalize.js";
import { SUPABASE } from "./upstreams.js";
import { operationsWorkspaceId } from "./workspace-identity.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const PAYMENT_EVENTS = new Set([
  "payment.pending",
  "payment.succeeded",
  "payment.failed",
  "refund.created",
  "refund.updated",
]);
const MAX_BODY_BYTES = 1_000_000;
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;
const encoder = new TextEncoder();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bytesFromBase64(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function signingKey(secret) {
  const encoded = String(secret || "").replace(/^whsec_/, "").trim();
  try {
    return bytesFromBase64(encoded);
  } catch {
    return encoder.encode(encoded);
  }
}

function signatures(header) {
  return String(header || "")
    .trim()
    .split(/\s+/)
    .map((entry) => entry.split(",", 2))
    .filter(([version, signature]) => version === "v1" && signature)
    .map(([, signature]) => signature);
}

export async function verifyWhopWebhook({ id, timestamp, signature, rawBody, secret, now = Date.now() }) {
  const timestampSeconds = Number(timestamp);
  if (!id || !Number.isFinite(timestampSeconds) || !signature || !secret) return false;
  if (Math.abs(Math.floor(now / 1000) - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  let candidates;
  try {
    candidates = signatures(signature).map(bytesFromBase64);
  } catch {
    return false;
  }
  if (!candidates.length) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    signingKey(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${rawBody}`)));
  return candidates.some((candidate) => sameBytes(candidate, signed));
}

function eventType(payload) {
  return String(payload?.type || payload?.event || payload?.event_type || "").trim();
}

function paymentFrom(payload) {
  const data = payload?.data || payload?.resource || payload?.payload || payload;
  const candidates = [data?.payment, data?.transaction, data?.invoice, data, payload?.payment, payload?.transaction];
  return candidates.find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || null;
}

async function payloadHash(rawBody) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(rawBody)));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function ingest(env, payload) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${SUPABASE.rest}/rpc/ingest_whop_webhook`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase rejected the Whop event (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`);
  }
  return response.json().catch(() => ({}));
}

function configured(env) {
  return Boolean(
    env?.WHOP_WEBHOOK_SECRET
    && (env?.SUPABASE_SECRET_KEY || env?.SUPABASE_SERVICE_ROLE_KEY)
    && operationsWorkspaceId(env),
  );
}

export async function handleWhopWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!configured(env)) return json({ error: "not_configured", message: "Whop webhook delivery is not configured." }, 503);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  const id = request.headers.get("webhook-id") || "";
  const timestamp = request.headers.get("webhook-timestamp") || "";
  const signature = request.headers.get("webhook-signature") || "";
  const verified = await verifyWhopWebhook({ id, timestamp, signature, rawBody, secret: env.WHOP_WEBHOOK_SECRET });
  if (!verified) return json({ error: "invalid_signature" }, 401);

  let envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const type = eventType(envelope);
  if (!PAYMENT_EVENTS.has(type)) return json({ received: true, ignored: true }, 202);

  const payment = toPaymentRecord(paymentFrom(envelope));
  if (!payment?.external_transaction_id) {
    return json({ received: true, ignored: true, reason: "payment_not_mappable" }, 202);
  }

  try {
    const result = await ingest(env, {
      p_event_id: id,
      p_event_type: type,
      p_user_id: operationsWorkspaceId(env),
      p_payload_hash: await payloadHash(rawBody),
      p_payment: payment,
    });
    return json({ received: true, duplicate: Boolean(result?.duplicate), payment_id: result?.payment_id || null });
  } catch (error) {
    console.error("Whop webhook ingestion failed", { id, type, message: error?.message || "unknown" });
    return json({ error: "ingestion_failed" }, 502);
  }
}

export function whopWebhookConfigured(env) {
  return configured(env);
}
