import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const MAX_BODY_BYTES = 2_000_000;
const MAX_SIGNATURE_AGE_SECONDS = 30 * 60;

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function cleanString(value: unknown, max = 10_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function secretKeys(): string[] {
  const values: string[] = [];
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    for (const value of Object.values(parsed)) {
      if (typeof value === "string" && value.trim()) values.push(value.trim());
    }
  } catch {
    // Hosted projects that have not migrated keys still expose service_role.
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) values.push(legacy);
  return [...new Set(values)];
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const key = secretKeys()[0] || "";
  if (!url || !key) throw new Error("Supabase server credentials are unavailable.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function parseSignature(header: string): { timestamp: number; signatures: string[] } | null {
  const fields = header.split(",").map((part) => part.trim());
  const timestamp = Number(fields.find((part) => part.startsWith("t="))?.slice(2));
  const signatures = fields
    .filter((part) => part.startsWith("v0="))
    .map((part) => part.slice(3).trim().toLowerCase())
    .filter((value) => /^[0-9a-f]{64}$/.test(value));
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !signatures.length) return null;
  return { timestamp, signatures };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifySignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  const parsed = parseSignature(header);
  if (!parsed) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp);
  if (age > MAX_SIGNATURE_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parsed.timestamp}.${rawBody}`),
  );
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return parsed.signatures.some((signature) => constantTimeEqual(signature, expected));
}

function resultValue(source: JsonRecord, ...keys: string[]): string {
  for (const key of keys) {
    const candidate = source[key];
    if (typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean") {
      const value = cleanString(String(candidate), 2_000);
      if (value) return value;
    }
    const nested = record(candidate);
    for (const nestedKey of ["value", "result", "text"]) {
      const value = cleanString(nested[nestedKey], 2_000);
      if (value) return value;
    }
  }
  return "";
}

function eventDate(value: unknown): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeDirection(metadata: JsonRecord): "inbound" | "outbound" | "web" {
  const phoneCall = record(metadata.phone_call);
  const value = cleanString(phoneCall.direction || metadata.direction, 40).toLowerCase();
  if (value.includes("outbound")) return "outbound";
  if (value.includes("inbound")) return "inbound";
  return "web";
}

async function workspaceForEvent(client: SupabaseClient, providerAgentId: string) {
  const { data: agent, error } = await client
    .from("voice_agents")
    .select("id,user_id,client_id,is_example")
    .eq("provider", "elevenlabs")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (error) throw error;
  if (agent) return { agent, workspaceId: agent.user_id as string };

  const configured = cleanString(Deno.env.get("OPERATIONS_WORKSPACE_ID"), 60);
  if (configured) return { agent: null, workspaceId: configured };
  const { data: workspace, error: workspaceError } = await client
    .from("operations_workspaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  return { agent: null, workspaceId: cleanString(workspace?.id, 60) };
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET")?.trim() || "";
  if (!secret) return json({ error: "not_configured" }, 503);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413);
  }
  const signature = req.headers.get("elevenlabs-signature") || "";
  if (!await verifySignature(rawBody, signature, secret)) {
    return json({ error: "invalid_signature" }, 401);
  }

  let event: JsonRecord;
  try {
    event = record(JSON.parse(rawBody));
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const eventType = cleanString(event.type, 100);
  const data = record(event.data);
  const providerAgentId = cleanString(data.agent_id, 180);
  const conversationId = cleanString(data.conversation_id, 180);
  if (!eventType || !providerAgentId || !conversationId) {
    return json({ error: "invalid_event" }, 400);
  }

  const client = adminClient();
  const { agent, workspaceId } = await workspaceForEvent(client, providerAgentId);
  if (!workspaceId) return json({ error: "workspace_not_configured" }, 503);
  const timestamp = eventDate(event.event_timestamp);
  const eventKey = `${eventType}:${conversationId}:${cleanString(event.event_timestamp, 40) || "unknown"}`;
  const { data: receipt, error: receiptError } = await client.from("elevenlabs_webhook_events").upsert({
    user_id: workspaceId,
    event_key: eventKey,
    event_type: eventType,
    provider_agent_id: providerAgentId,
    provider_conversation_id: conversationId,
    event_timestamp: timestamp,
    payload: event,
    status: "received",
  }, { onConflict: "user_id,event_key", ignoreDuplicates: true }).select("id,status").maybeSingle();
  if (receiptError) throw receiptError;
  if (!receipt) return json({ received: true, duplicate: true });

  if (eventType !== "post_call_transcription") {
    await client.from("elevenlabs_webhook_events").update({
      status: "ignored",
      processed_at: new Date().toISOString(),
    }).eq("id", receipt.id);
    return json({ received: true, ignored: true });
  }

  const metadata = record(data.metadata);
  const phoneCall = record(metadata.phone_call);
  const analysis = record(data.analysis);
  const captured = record(analysis.data_collection_results);
  const duration = numberOrNull(metadata.call_duration_secs ?? metadata.duration_seconds);
  const startedAt = eventDate(metadata.start_time_unix_secs ?? metadata.start_time);
  const endedAt = startedAt && duration !== null
    ? new Date(new Date(startedAt).getTime() + duration * 1000).toISOString()
    : timestamp;
  const statusValue = cleanString(data.status, 40).toLowerCase();
  const normalizedStatus = statusValue === "done" ? "done" : statusValue.includes("fail") ? "failed" : "processing";

  const conversation = {
    user_id: workspaceId,
    client_id: agent?.client_id || null,
    voice_agent_id: agent?.id || null,
    provider: "elevenlabs",
    provider_conversation_id: conversationId,
    provider_agent_id: providerAgentId,
    status: normalizedStatus,
    direction: normalizeDirection(metadata),
    caller_name: resultValue(captured, "caller_name", "name") || null,
    caller_phone: resultValue(captured, "caller_phone", "phone")
      || cleanString(phoneCall.external_number || metadata.caller_phone, 100) || null,
    caller_address: resultValue(captured, "property_address", "address") || null,
    problem: resultValue(captured, "roofing_problem", "problem", "reason_for_call") || null,
    urgency: resultValue(captured, "urgency") || null,
    appointment_status: resultValue(captured, "appointment_status", "booking_status") || null,
    transcript: Array.isArray(data.transcript) ? data.transcript : [],
    summary: cleanString(analysis.transcript_summary || analysis.summary, 20_000) || null,
    call_successful: resultValue(analysis, "call_successful") || null,
    analysis,
    metadata,
    duration_seconds: duration,
    provider_cost: numberOrNull(metadata.cost ?? metadata.provider_cost),
    provider_cost_unit: cleanString(metadata.cost_unit, 40) || null,
    has_audio: data.has_audio === true,
    is_example: agent?.is_example === true,
    started_at: startedAt,
    ended_at: endedAt,
  };
  const { error: conversationError } = await client.from("voice_conversations").upsert(conversation, {
    onConflict: "user_id,provider,provider_conversation_id",
  });
  if (conversationError) {
    await client.from("elevenlabs_webhook_events").update({
      status: "failed",
      error_message: cleanString(conversationError.message, 1_000),
      processed_at: new Date().toISOString(),
    }).eq("id", receipt.id);
    throw conversationError;
  }

  await client.from("elevenlabs_webhook_events").update({
    status: "processed",
    processed_at: new Date().toISOString(),
  }).eq("id", receipt.id);
  if (agent?.id) {
    await client.from("voice_agents").update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", agent.id).eq("user_id", workspaceId);
  }
  return json({ received: true, conversation_id: conversationId });
}

export default {
  fetch: async (req: Request) => {
    try {
      return await handle(req);
    } catch (error) {
      console.error("elevenlabs_webhook_failed", error);
      return json({ error: "webhook_failed" }, 500);
    }
  },
};
