import { SUPABASE } from "./upstreams.js";
import { operationsWorkspaceId } from "./workspace-identity.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bridgeKey(env) {
  return String(env?.OPERATIONS_EDGE_SHARED_SECRET || "").trim();
}

function edgeBase(env) {
  const supabaseUrl = String(env?.SUPABASE_URL || SUPABASE.url).replace(/\/+$/, "");
  return `${supabaseUrl}/functions/v1/elevenlabs-agents`;
}

async function bodyObject(request) {
  const raw = await request.text();
  if (raw.length > 128_000) throw new Error("Request body is too large.");
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A JSON object is required.");
  }
  return parsed;
}

const SAFE_AGENT_FIELDS = new Set([
  "name", "client_id", "automation_id", "environment", "voice_id", "language",
  "llm", "first_message", "system_prompt", "description", "tags", "is_example", "status",
]);

function safeAgentBody(path, value) {
  if (!path.startsWith("/agents")) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => SAFE_AGENT_FIELDS.has(key)));
}

async function relayEdge(request, env, edgePath, member) {
  const key = bridgeKey(env);
  const workspaceId = operationsWorkspaceId(env);
  if (!key || !workspaceId) {
    return json({
      error: "not_connected",
      provider: "elevenlabs",
      message: "The ElevenLabs server bridge is not configured.",
    }, 503);
  }

  const method = request.method;
  const hasBody = ["POST", "PATCH", "DELETE"].includes(method);
  const incoming = hasBody ? safeAgentBody(edgePath, await bodyObject(request)) : {};
  const url = new URL(`${edgeBase(env)}${edgePath}`);
  if (!hasBody) url.searchParams.set("workspace_id", workspaceId);
  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      ...(hasBody ? { "content-type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify({
      ...incoming,
      workspace_id: workspaceId,
      member_id: member?.id || null,
    }) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || JSON_HEADERS["content-type"],
      "cache-control": "no-store",
    },
  });
}

export async function elevenLabsConnectionStatus(env) {
  try {
    const request = new Request(`${edgeBase(env)}/health`, { method: "GET" });
    const response = await relayEdge(request, env, "/health", null);
    if (!response.ok) return { connected: false, configured: response.status !== 503 };
    const payload = await response.json();
    return {
      connected: payload?.connected === true,
      configured: payload?.configured === true,
      webhook_configured: payload?.webhook_configured === true,
    };
  } catch {
    return { connected: false, configured: Boolean(bridgeKey(env) && operationsWorkspaceId(env)) };
  }
}

export async function handleElevenLabs(request, env, path, member) {
  const allowed = new Map([
    ["GET /health", "/health"],
    ["GET /voices", "/voices"],
    ["POST /sync", "/sync"],
    ["POST /agents", "/agents"],
  ]);
  const localAgent = path.match(/^\/agents\/([0-9a-f-]{36})$/i);
  if (localAgent && ["PATCH", "DELETE"].includes(request.method)) {
    return relayEdge(request, env, `/agents/${encodeURIComponent(localAgent[1])}`, member);
  }
  const target = allowed.get(`${request.method} ${path}`);
  if (!target) return json({ error: "not_found", message: "That ElevenLabs action is not available." }, 404);
  return relayEdge(request, env, target, member);
}
