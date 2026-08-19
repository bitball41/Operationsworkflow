import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ELEVENLABS_API = "https://api.elevenlabs.io";
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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

function secretEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function authorized(req: Request): boolean {
  const provided = req.headers.get("apikey")?.trim() || "";
  const bridgeSecret = Deno.env.get("OPERATIONS_EDGE_SHARED_SECRET")?.trim() || "";
  return Boolean(provided && (
    secretEqual(provided, bridgeSecret)
    || secretKeys().some((key) => secretEqual(provided, key))
  ));
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const key = secretKeys()[0] || "";
  if (!url || !key) throw new Error("Supabase server credentials are unavailable.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function readJson(req: Request, limit = 128_000): Promise<JsonRecord> {
  const raw = await req.text();
  if (raw.length > limit) throw new Error("Request body is too large.");
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A JSON object is required.");
  }
  return parsed as JsonRecord;
}

function cleanString(value: unknown, max = 20_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanString(item, 80)).filter(Boolean))].slice(0, 20);
}

async function elevenlabs(path: string, init: RequestInit = {}): Promise<JsonRecord> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY")?.trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const response = await fetch(`${ELEVENLABS_API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload: JsonRecord = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const detail = cleanString((payload as JsonRecord)?.detail || (payload as JsonRecord)?.message, 500);
    throw new Error(detail || `ElevenLabs returned ${response.status}.`);
  }
  return payload;
}

async function requireWorkspace(client: SupabaseClient, workspaceId: string): Promise<void> {
  if (!UUID.test(workspaceId)) throw new Error("A valid workspace is required.");
  const { data, error } = await client
    .from("operations_workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That Operations workspace does not exist.");
}

async function requireClient(client: SupabaseClient, workspaceId: string, clientId: string): Promise<void> {
  if (!UUID.test(clientId)) throw new Error("Choose a valid client.");
  const { data, error } = await client
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That client was not found in this workspace.");
}

function conversationConfig(input: JsonRecord): JsonRecord {
  const firstMessage = cleanString(input.first_message, 2_000);
  const systemPrompt = cleanString(input.system_prompt, 30_000);
  const language = cleanString(input.language, 16) || "en";
  const llm = cleanString(input.llm, 120) || "gpt-5.6-luna";
  const voiceId = cleanString(input.voice_id, 180);

  return {
    agent: {
      first_message: firstMessage,
      language,
      prompt: {
        prompt: systemPrompt,
        llm,
        temperature: 0.3,
        max_tokens: -1,
      },
    },
    ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
  };
}

function providerPayload(input: JsonRecord): JsonRecord {
  const name = cleanString(input.name, 160);
  if (!name) throw new Error("Agent name is required.");
  const tags = cleanTags(input.tags);
  return {
    name,
    tags: [...new Set(["operationsworkflow", ...tags])],
    conversation_config: conversationConfig(input),
  };
}

async function syncAgents(client: SupabaseClient, workspaceId: string): Promise<JsonRecord[]> {
  const upstream = await elevenlabs("/v1/convai/agents?page_size=100&sort_by=created_at&sort_direction=desc");
  const agents = Array.isArray(upstream.agents) ? upstream.agents as JsonRecord[] : [];
  for (const agent of agents) {
    const providerAgentId = cleanString(agent.agent_id, 180);
    if (!providerAgentId) continue;
    const archived = agent.archived === true;
    const details = await elevenlabs(`/v1/convai/agents/${encodeURIComponent(providerAgentId)}`);
    const config = details.conversation_config && typeof details.conversation_config === "object"
      ? details.conversation_config as JsonRecord : {};
    const agentConfig = config.agent && typeof config.agent === "object" ? config.agent as JsonRecord : {};
    const prompt = agentConfig.prompt && typeof agentConfig.prompt === "object" ? agentConfig.prompt as JsonRecord : {};
    const tts = config.tts && typeof config.tts === "object" ? config.tts as JsonRecord : {};
    const { error } = await client.from("voice_agents").upsert({
      user_id: workspaceId,
      provider: "elevenlabs",
      provider_agent_id: providerAgentId,
      name: cleanString(agent.name, 160) || "Untitled ElevenLabs agent",
      status: archived ? "archived" : "active",
      tags: cleanTags(agent.tags),
      voice_id: cleanString(tts.voice_id, 180) || null,
      llm: cleanString(prompt.llm, 120) || null,
      language: cleanString(agentConfig.language, 16) || "en",
      first_message: cleanString(agentConfig.first_message, 2_000) || null,
      system_prompt: cleanString(prompt.prompt, 30_000) || null,
      configuration: { conversation_config: config },
      platform_settings: details.platform_settings && typeof details.platform_settings === "object"
        ? details.platform_settings : {},
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: "user_id,provider,provider_agent_id" });
    if (error) throw error;
  }
  return agents;
}

async function integrationStatus(client: SupabaseClient, workspaceId: string, status: string, error = "") {
  await client.from("integration_connections").upsert({
    user_id: workspaceId,
    provider: "elevenlabs",
    status,
    display_name: "ElevenLabs",
    config: {
      managed_by: "Supabase Edge Functions",
      secret_location: "Edge Function secrets",
      ...(error ? { last_error: error.slice(0, 500) } : {}),
    },
    last_synced_at: status === "connected" ? new Date().toISOString() : null,
  }, { onConflict: "user_id,provider" });
}

async function completeAgentProjectTask(client: SupabaseClient, workspaceId: string, clientId: string) {
  if (!UUID.test(clientId)) return;
  const { data: projects, error: projectsError } = await client
    .from("projects")
    .select("id")
    .eq("user_id", workspaceId)
    .eq("client_id", clientId);
  if (projectsError) throw projectsError;
  const projectIds = (projects || []).map((project) => project.id).filter(Boolean);
  if (!projectIds.length) return;
  const { error } = await client.from("project_tasks").update({ status: "completed" })
    .in("project_id", projectIds).eq("title", "Create and link the ElevenLabs agent");
  if (error) throw error;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return json({ error: "unauthorized", message: "A server secret key is required." }, 401);

  const client = adminClient();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const functionIndex = parts.lastIndexOf("elevenlabs-agents");
  const path = parts.slice(functionIndex + 1);
  const body = ["POST", "PATCH", "DELETE"].includes(req.method) ? await readJson(req) : {};
  const workspaceId = cleanString(body.workspace_id || url.searchParams.get("workspace_id"), 60);
  await requireWorkspace(client, workspaceId);

  if (req.method === "GET" && (path[0] === "health" || path.length === 0)) {
    try {
      const upstream = await elevenlabs("/v1/convai/agents?page_size=1");
      await integrationStatus(client, workspaceId, "connected");
      return json({
        connected: true,
        configured: true,
        webhook_configured: Boolean(Deno.env.get("ELEVENLABS_WEBHOOK_SECRET")?.trim()),
        provider: "elevenlabs",
        agent_count_hint: Array.isArray(upstream.agents) ? upstream.agents.length : 0,
        at: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ElevenLabs is unavailable.";
      await integrationStatus(client, workspaceId, "error", message);
      return json({ connected: false, configured: Boolean(Deno.env.get("ELEVENLABS_API_KEY")), provider: "elevenlabs", message }, 503);
    }
  }

  if (req.method === "GET" && path[0] === "voices") {
    const upstream = await elevenlabs("/v1/voices");
    const voices = Array.isArray(upstream.voices) ? upstream.voices as JsonRecord[] : [];
    return json({ voices: voices.map((voice) => ({
      voice_id: cleanString(voice.voice_id, 180),
      name: cleanString(voice.name, 160),
      category: cleanString(voice.category, 80),
      labels: voice.labels && typeof voice.labels === "object" ? voice.labels : {},
      preview_url: cleanString(voice.preview_url, 500),
    })) });
  }

  if (req.method === "POST" && path[0] === "sync") {
    const agents = await syncAgents(client, workspaceId);
    await integrationStatus(client, workspaceId, "connected");
    return json({ synced: agents.length, at: new Date().toISOString() });
  }

  if (req.method === "POST" && path[0] === "agents" && path.length === 1) {
    const clientId = cleanString(body.client_id, 60);
    await requireClient(client, workspaceId, clientId);
    const payload = providerPayload(body);
    const created = await elevenlabs("/v1/convai/agents/create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const providerAgentId = cleanString(created.agent_id, 180);
    if (!providerAgentId) throw new Error("ElevenLabs did not return an agent id.");

    const record = {
      user_id: workspaceId,
      client_id: clientId,
      automation_id: UUID.test(cleanString(body.automation_id, 60)) ? cleanString(body.automation_id, 60) : null,
      provider: "elevenlabs",
      provider_agent_id: providerAgentId,
      name: cleanString(body.name, 160),
      description: cleanString(body.description, 2_000) || null,
      status: "active",
      environment: ["development", "staging", "production"].includes(cleanString(body.environment, 20))
        ? cleanString(body.environment, 20) : "development",
      is_example: body.is_example === true,
      voice_id: cleanString(body.voice_id, 180) || null,
      llm: cleanString(body.llm, 120) || "gpt-5.6-luna",
      language: cleanString(body.language, 16) || "en",
      first_message: cleanString(body.first_message, 2_000) || null,
      system_prompt: cleanString(body.system_prompt, 30_000) || null,
      configuration: { conversation_config: payload.conversation_config },
      platform_settings: {},
      tags: cleanTags(payload.tags),
      last_synced_at: new Date().toISOString(),
      last_error: null,
      created_by_member_id: UUID.test(cleanString(body.member_id, 60)) ? cleanString(body.member_id, 60) : null,
    };
    const { data, error } = await client.from("voice_agents").insert(record).select("*").single();
    if (error) throw error;

    if (record.automation_id) {
      await client.from("automations").update({
        provider: "ElevenLabs",
        status: "testing",
        configuration: {
          provider_agent_id: providerAgentId,
          managed_by: "elevenlabs-agents Edge Function",
          example: record.is_example,
        },
        development_version: "elevenlabs-draft",
        last_error: "Calendar, telephony, forwarding, consent, and end-to-end call verification are still required.",
        last_activity_at: new Date().toISOString(),
      }).eq("id", record.automation_id).eq("user_id", workspaceId);
    }

    await completeAgentProjectTask(client, workspaceId, clientId);

    await integrationStatus(client, workspaceId, "connected");
    return json({ agent: data }, 201);
  }

  const localAgentId = cleanString(path[1], 60);
  if (path[0] === "agents" && UUID.test(localAgentId)) {
    const { data: existing, error: lookupError } = await client
      .from("voice_agents")
      .select("*")
      .eq("id", localAgentId)
      .eq("user_id", workspaceId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return json({ error: "not_found", message: "That voice agent was not found." }, 404);

    if (req.method === "PATCH") {
      const clientId = cleanString(body.client_id, 60);
      if (clientId) await requireClient(client, workspaceId, clientId);
      const payload = providerPayload({ ...existing, ...body });
      await elevenlabs(`/v1/convai/agents/${encodeURIComponent(existing.provider_agent_id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const patch = {
        client_id: clientId || existing.client_id,
        automation_id: UUID.test(cleanString(body.automation_id, 60)) ? cleanString(body.automation_id, 60) : existing.automation_id,
        name: cleanString(body.name, 160) || existing.name,
        description: cleanString(body.description, 2_000) || null,
        status: ["active", "paused", "archived"].includes(cleanString(body.status, 20)) ? cleanString(body.status, 20) : existing.status,
        environment: ["development", "staging", "production"].includes(cleanString(body.environment, 20)) ? cleanString(body.environment, 20) : existing.environment,
        voice_id: cleanString(body.voice_id, 180) || null,
        llm: cleanString(body.llm, 120) || existing.llm || "gpt-5.6-luna",
        language: cleanString(body.language, 16) || existing.language || "en",
        first_message: cleanString(body.first_message, 2_000) || null,
        system_prompt: cleanString(body.system_prompt, 30_000) || null,
        configuration: { conversation_config: payload.conversation_config },
        tags: cleanTags(payload.tags),
        last_synced_at: new Date().toISOString(),
        last_error: null,
      };
      const { data, error } = await client.from("voice_agents")
        .update(patch).eq("id", localAgentId).eq("user_id", workspaceId).select("*").single();
      if (error) throw error;
      await completeAgentProjectTask(client, workspaceId, patch.client_id);
      return json({ agent: data });
    }

    if (req.method === "DELETE") {
      const providerAgentId = cleanString(existing.provider_agent_id, 180);
      if (providerAgentId) {
        try {
          await elevenlabs(`/v1/convai/agents/${encodeURIComponent(providerAgentId)}`, { method: "DELETE" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!/\b404\b|not found/i.test(message)) throw error;
        }
      }
      const { data, error } = await client.from("voice_agents").update({
        status: "archived",
        provider_deleted_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      }).eq("id", localAgentId).eq("user_id", workspaceId).select("*").single();
      if (error) throw error;
      return json({ deleted: true, agent: data });
    }
  }

  return json({ error: "not_found", message: `No route for ${req.method} ${path.join("/")}.` }, 404);
}

export default {
  fetch: async (req: Request) => {
    try {
      return await handle(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The ElevenLabs request failed.";
      return json({ error: "request_failed", message }, 502);
    }
  },
};
