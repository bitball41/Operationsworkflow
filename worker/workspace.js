import { createClient } from "@supabase/supabase-js";
import { SUPABASE } from "./upstreams.js";
import { operationsWorkspaceId } from "./workspace-identity.js";

const STORAGE_BUCKET = "demo-assets";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
]);

export const WORKSPACE_COLLECTIONS = Object.freeze({
  leads: "leads",
  discoveryRuns: "lead_discovery_runs",
  discoveryResults: "lead_discovery_results",
  templates: "site_templates",
  demos: "demos",
  demoVersions: "demo_versions",
  drafts: "message_drafts",
  emailThreads: "email_threads",
  emails: "emails",
  followUps: "follow_ups",
  approvals: "approvals",
  assistantConversations: "assistant_conversations",
  agentRuns: "agent_runs",
  agentEvents: "agent_events",
  notifications: "notifications",
  teamMembers: "team_members",
  clients: "clients",
  clientSites: "client_sites",
  salesCalls: "sales_calls",
  meetings: "meetings",
  onboardingRecords: "onboarding_records",
  projects: "projects",
  projectTasks: "project_tasks",
  automations: "automations",
  knowledgeEntries: "knowledge_entries",
  maintenanceSubscriptions: "maintenance_subscriptions",
  maintenanceRequests: "maintenance_requests",
  payments: "payments",
  commissions: "commissions",
  expenses: "expenses",
  aiUsage: "ai_usage",
  pricingExperiments: "pricing_experiments",
  activity: "activity_log",
  tasks: "tasks",
  calendarEvents: "calendar_events",
  notes: "notes",
  deployments: "deployments",
  settings: "settings",
  integrations: "integration_connections",
});

const SNAPSHOT_ORDER = Object.freeze({
  leads: ["updated_at", false, 750],
  discoveryRuns: ["created_at", false, 750],
  discoveryResults: ["created_at", false, 500],
  templates: ["updated_at", false, 750],
  demos: ["updated_at", false, 750],
  demoVersions: ["created_at", false, 750],
  drafts: ["updated_at", false, 750],
  emailThreads: ["last_message_at", false, 750],
  emails: ["created_at", false, 500],
  followUps: ["due_at", true, 750],
  approvals: ["created_at", false, 750],
  assistantConversations: ["last_message_at", false, 750],
  agentRuns: ["created_at", false, 750],
  agentEvents: ["created_at", false, 500],
  notifications: ["created_at", false, 750],
  teamMembers: ["full_name", true, 250],
  clients: ["updated_at", false, 750],
  clientSites: ["updated_at", false, 750],
  salesCalls: ["called_at", false, 750],
  meetings: ["starts_at", true, 750],
  onboardingRecords: ["updated_at", false, 750],
  projects: ["updated_at", false, 750],
  projectTasks: ["sort_order", true, 750],
  automations: ["updated_at", false, 750],
  knowledgeEntries: ["updated_at", false, 750],
  maintenanceSubscriptions: ["updated_at", false, 750],
  maintenanceRequests: ["created_at", false, 750],
  payments: ["created_at", false, 750],
  commissions: ["created_at", false, 750],
  expenses: ["occurred_on", false, 750],
  aiUsage: ["occurred_at", false, 750],
  pricingExperiments: ["created_at", false, 750],
  activity: ["created_at", false, 500],
  tasks: ["due_at", true, 750],
  calendarEvents: ["starts_at", true, 750],
  notes: ["updated_at", false, 750],
  deployments: ["updated_at", false, 750],
  settings: ["key", true, 750],
  integrations: ["provider", true, 750],
});

const adminClients = new WeakMap();

const OWNER_ONLY_WRITE_COLLECTIONS = new Set([
  "automations",
  "teamMembers",
  "maintenanceSubscriptions",
  "payments",
  "commissions",
  "expenses",
  "aiUsage",
  "pricingExperiments",
  "deployments",
  "settings",
  "integrations",
]);

const SALESPERSON_WRITE_COLLECTIONS = new Set([
  "leads",
  "discoveryRuns",
  "discoveryResults",
  "demos",
  "demoVersions",
  "drafts",
  "emailThreads",
  "emails",
  "followUps",
  "approvals",
  "assistantConversations",
  "agentRuns",
  "agentEvents",
  "notifications",
  "salesCalls",
  "meetings",
  "activity",
  "tasks",
  "calendarEvents",
  "notes",
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function forbidden(message = "This employee is not allowed to change that workspace data.") {
  return json({ error: "forbidden", message }, 403);
}

export function collectionWriteAllowed(member, collection) {
  if (member?.status !== "active") return false;
  if (member.role === "owner") return true;
  if (OWNER_ONLY_WRITE_COLLECTIONS.has(collection)) return false;
  if (member.role === "salesperson") return SALESPERSON_WRITE_COLLECTIONS.has(collection);
  return !["teamMembers", "integrations", "deployments", "payments", "commissions", "settings"].includes(collection);
}

function secretKey(env) {
  return String(env?.SUPABASE_SECRET_KEY || env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function configuration(env) {
  const workspaceId = operationsWorkspaceId(env);
  const key = secretKey(env);
  const missing = [];
  if (!workspaceId) missing.push("OPERATIONS_WORKSPACE_ID");
  if (!key) missing.push("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
  return { workspaceId, key, missing };
}

function adminClient(env) {
  const config = configuration(env);
  if (config.missing.length) return null;
  if (!adminClients.has(env)) {
    adminClients.set(env, createClient(String(env.SUPABASE_URL || SUPABASE.url), config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }));
  }
  return adminClients.get(env);
}

function configured(env) {
  const config = configuration(env);
  if (!config.missing.length) return null;
  return json({
    error: "workspace_not_configured",
    message: `The server-side workspace is missing: ${config.missing.join(", ")}.`,
  }, 503);
}

function collectionTable(value) {
  return WORKSPACE_COLLECTIONS[value] || "";
}

function cleanInsert(record, workspaceId) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  return { ...record, user_id: workspaceId };
}

function cleanPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const clean = { ...patch };
  delete clean.id;
  delete clean.user_id;
  return clean;
}

function storagePathAllowed(path, workspaceId) {
  return String(path || "").startsWith(`${workspaceId}/`);
}

function safeAssetName(name) {
  const raw = String(name || "asset").replace(/\\/g, "/").split("/").pop();
  const dot = raw.lastIndexOf(".");
  const base = (dot > 0 ? raw.slice(0, dot) : raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  const extension = dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return `${base}${extension ? `.${extension}` : ""}`;
}

async function ensureWorkspace(client, workspaceId) {
  const { error: workspaceError } = await client
    .from("operations_workspaces")
    .upsert({ id: workspaceId, name: "Operations" }, { onConflict: "id", ignoreDuplicates: true });
  /* This table is introduced by the account-removal migration. Ignoring only
     "not found" keeps the new Worker deployable before that migration, which
     avoids an outage while the security boundary changes over. */
  if (
    workspaceError
    && !["42P01", "PGRST205"].includes(String(workspaceError.code || ""))
    && !/operations_workspaces.*schema cache/i.test(String(workspaceError.message || ""))
  ) throw workspaceError;

  const { error: profileError } = await client
    .from("profiles")
    .upsert({ id: workspaceId, full_name: "Connor" }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) throw profileError;
}

async function fallbackSnapshot(client, workspaceId) {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();
  if (profileError) throw profileError;

  const entries = await Promise.all(Object.entries(WORKSPACE_COLLECTIONS).map(async ([key, table]) => {
    const [column, ascending, limit] = SNAPSHOT_ORDER[key];
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("user_id", workspaceId)
      .order(column, { ascending, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return [key, data || []];
  }));
  return { profile, ...Object.fromEntries(entries) };
}

export async function handleWorkspaceSnapshot(env, member) {
  const errorResponse = configured(env);
  if (errorResponse) return errorResponse;
  const workspaceId = operationsWorkspaceId(env);
  const client = adminClient(env);

  await ensureWorkspace(client, workspaceId);
  const { data, error } = await client.rpc("operations_workspace_snapshot", {
    p_workspace_id: workspaceId,
  });
  if (
    error
    && !["42883", "PGRST202"].includes(String(error.code || ""))
    && !/operations_workspace_snapshot.*schema cache/i.test(String(error.message || ""))
  ) throw error;
  const snapshot = error ? await fallbackSnapshot(client, workspaceId) : data;
  return json({
    ...(snapshot || {}),
    workspace: {
      id: workspaceId,
      name: "Operations",
      member: member ? {
        id: member.id,
        full_name: member.full_name,
        access_email: member.access_email,
        role: member.role,
        permissions: member.permissions || {},
      } : null,
    },
  });
}

async function rowForMemberScope(client, workspaceId, collection, table, id) {
  const columns = collection === "leads"
    ? "id,assigned_team_member_id"
    : ["salesCalls", "meetings"].includes(collection)
      ? "id,salesperson_id"
      : collection === "followUps"
        ? "id,lead_id"
        : "id";
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq("id", id)
    .eq("user_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function leadBelongsToMember(client, workspaceId, leadId, memberId) {
  if (!UUID.test(String(leadId || ""))) return false;
  const { data, error } = await client
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("user_id", workspaceId)
    .eq("assigned_team_member_id", memberId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function salespersonOwnsRecord(client, workspaceId, collection, table, id, memberId) {
  const row = await rowForMemberScope(client, workspaceId, collection, table, id);
  if (!row) return null;
  if (collection === "leads") return row.assigned_team_member_id === memberId ? row : false;
  if (["salesCalls", "meetings"].includes(collection)) return row.salesperson_id === memberId ? row : false;
  if (collection === "followUps") {
    return await leadBelongsToMember(client, workspaceId, row.lead_id, memberId) ? row : false;
  }
  return row;
}

async function scopeSalespersonInserts(client, workspaceId, collection, records, member) {
  if (collection === "leads") {
    return records.map((record) => ({ ...record, assigned_team_member_id: member.id }));
  }
  if (["salesCalls", "meetings"].includes(collection)) {
    for (const record of records) {
      if (!await leadBelongsToMember(client, workspaceId, record.lead_id, member.id)) return null;
    }
    return records.map((record) => ({ ...record, salesperson_id: member.id }));
  }
  if (collection === "followUps") {
    for (const record of records) {
      if (!await leadBelongsToMember(client, workspaceId, record.lead_id, member.id)) return null;
    }
  }
  return records;
}

export async function handleWorkspaceRecords(request, env, collection, id = "", member) {
  const errorResponse = configured(env);
  if (errorResponse) return errorResponse;
  const table = collectionTable(collection);
  if (!table) return json({ error: "unknown_collection", message: "That workspace collection is not available." }, 404);
  if (!collectionWriteAllowed(member, collection)) return forbidden();

  const workspaceId = operationsWorkspaceId(env);
  const client = adminClient(env);
  if (request.method === "POST" && !id) {
    const body = await request.json().catch(() => null);
    const values = Array.isArray(body?.records) ? body.records : [];
    if (!values.length || values.length > 500) {
      return json({ error: "invalid_request", message: "records must contain between 1 and 500 items." }, 400);
    }
    let payload = values.map((record) => cleanInsert(record, workspaceId));
    if (payload.some((record) => !record)) {
      return json({ error: "invalid_request", message: "Every record must be an object." }, 400);
    }
    if (member.role === "salesperson") {
      payload = await scopeSalespersonInserts(client, workspaceId, collection, payload, member);
      if (!payload) return forbidden("Salespeople can only add calls, meetings, and follow-ups for their assigned leads.");
    }
    const { data, error } = await client.from(table).insert(payload).select();
    if (error) throw error;
    return json({ records: data || [] }, 201);
  }

  if (!UUID.test(id)) return json({ error: "invalid_id", message: "A valid record id is required." }, 400);
  if (member.role === "salesperson") {
    const owned = await salespersonOwnsRecord(client, workspaceId, collection, table, id, member.id);
    if (owned === null) return json({ error: "not_found", message: "That record was not found in this workspace." }, 404);
    if (owned === false) return forbidden("Salespeople can only change records assigned to them.");
  }
  if (request.method === "PATCH") {
    const patch = cleanPatch(await request.json().catch(() => null));
    if (!patch || !Object.keys(patch).length) {
      return json({ error: "invalid_request", message: "A non-empty patch object is required." }, 400);
    }
    if (member.role === "salesperson") {
      if (collection === "leads") patch.assigned_team_member_id = member.id;
      if (["salesCalls", "meetings"].includes(collection)) patch.salesperson_id = member.id;
      if (collection === "followUps" && patch.lead_id && !await leadBelongsToMember(client, workspaceId, patch.lead_id, member.id)) {
        return forbidden("Salespeople can only move follow-ups to their assigned leads.");
      }
    }
    const { data, error } = await client
      .from(table)
      .update(patch)
      .eq("id", id)
      .eq("user_id", workspaceId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "not_found", message: "That record was not found in this workspace." }, 404);
    return json({ record: data });
  }

  if (request.method === "DELETE") {
    const { data, error } = await client
      .from(table)
      .delete()
      .eq("id", id)
      .eq("user_id", workspaceId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "not_found", message: "That record was not found in this workspace." }, 404);
    return json({ deleted: true });
  }

  return json({ error: "method_not_allowed", message: "That workspace operation is not allowed." }, 405);
}

export async function handleWorkspaceProfile(request, env, member) {
  const errorResponse = configured(env);
  if (errorResponse) return errorResponse;
  if (member?.role !== "owner") return forbidden("Only the owner can change workspace settings.");
  const patch = cleanPatch(await request.json().catch(() => null));
  if (!patch || !Object.keys(patch).length) {
    return json({ error: "invalid_request", message: "A non-empty profile patch is required." }, 400);
  }
  const workspaceId = operationsWorkspaceId(env);
  const { data, error } = await adminClient(env)
    .from("profiles")
    .update(patch)
    .eq("id", workspaceId)
    .select()
    .single();
  if (error) throw error;
  return json({ profile: data });
}

export async function handleWorkspaceAssetUpload(request, env) {
  const errorResponse = configured(env);
  if (errorResponse) return errorResponse;
  const form = await request.formData();
  const scope = String(form.get("scope") || "");
  const entityId = String(form.get("entity_id") || "");
  const version = Number(form.get("version") || 1);
  const file = form.get("file");
  if (!["demo", "template"].includes(scope) || !UUID.test(entityId)) {
    return json({ error: "invalid_request", message: "A valid asset scope and entity id are required." }, 400);
  }
  if (!file || typeof file.arrayBuffer !== "function" || !IMAGE_TYPES.has(file.type)) {
    return json({ error: "invalid_file", message: "Only PNG, JPEG, WebP, GIF, AVIF and SVG images are accepted." }, 400);
  }
  if (file.size > 15 * 1024 * 1024) {
    return json({ error: "file_too_large", message: "An asset cannot exceed 15 MB." }, 413);
  }

  const workspaceId = operationsWorkspaceId(env);
  const name = safeAssetName(file.name);
  const path = scope === "template"
    ? `${workspaceId}/templates/${entityId}/assets/${name}`
    : `${workspaceId}/demos/${entityId}/v${Math.max(1, Math.trunc(version))}-${name}`;
  const { error } = await adminClient(env).storage.from(STORAGE_BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: scope === "template" ? "31536000" : "3600",
    contentType: file.type,
  });
  if (error) throw error;
  return json({
    asset: {
      name,
      path: `assets/${name}`,
      storage_path: path,
      content_type: file.type,
      size: file.size,
    },
  }, 201);
}

export async function handleWorkspaceAssetDelete(request, env) {
  const errorResponse = configured(env);
  if (errorResponse) return errorResponse;
  const body = await request.json().catch(() => null);
  const paths = Array.isArray(body?.paths) ? [...new Set(body.paths.map(String))] : [];
  const workspaceId = operationsWorkspaceId(env);
  if (!paths.length || paths.length > 1000 || paths.some((path) => !storagePathAllowed(path, workspaceId))) {
    return json({ error: "invalid_request", message: "Only assets inside this workspace can be deleted." }, 400);
  }
  const { error } = await adminClient(env).storage.from(STORAGE_BUCKET).remove(paths);
  if (error) throw error;
  return json({ deleted: paths.length });
}

export async function handleWorkspaceSignedUrls(request, env) {
  const errorResponse = configured(env);
  if (errorResponse) return errorResponse;
  const body = await request.json().catch(() => null);
  const paths = Array.isArray(body?.paths) ? [...new Set(body.paths.map(String))] : [];
  const workspaceId = operationsWorkspaceId(env);
  if (!paths.length || paths.length > 100 || paths.some((path) => !storagePathAllowed(path, workspaceId))) {
    return json({ error: "invalid_request", message: "Only assets inside this workspace can be signed." }, 400);
  }
  const { data, error } = await adminClient(env).storage.from(STORAGE_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  return json({ urls: data || [] });
}

export async function handleWorkspaceAssetDownload(url, env) {
  const errorResponse = configured(env);
  if (errorResponse) return errorResponse;
  const path = String(url.searchParams.get("path") || "");
  const workspaceId = operationsWorkspaceId(env);
  if (!storagePathAllowed(path, workspaceId)) {
    return json({ error: "invalid_request", message: "Only assets inside this workspace can be downloaded." }, 400);
  }
  const { data, error } = await adminClient(env).storage.from(STORAGE_BUCKET).download(path);
  if (error) throw error;
  return new Response(data, {
    headers: {
      "content-type": data.type || "application/octet-stream",
      "cache-control": "private, no-store",
    },
  });
}

export function workspaceAdmin(env) {
  return {
    client: adminClient(env),
    id: operationsWorkspaceId(env),
    error: configured(env),
  };
}
