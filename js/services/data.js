import { getState, setData } from "../core/state.js";
import { uid, slugify } from "../core/utils.js";
import { createSampleData } from "../data/sample-data.js";
import { CONFIG } from "../config.js";
import { duplicateKey, toDiscoveryResult } from "./openscout/adapter.js";
import { supabase } from "./supabase.js";

export const COLLECTIONS = Object.freeze({
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
  agentRuns: "agent_runs",
  agentEvents: "agent_events",
  notifications: "notifications",
  clients: "clients",
  clientSites: "client_sites",
  projects: "projects",
  projectTasks: "project_tasks",
  maintenanceSubscriptions: "maintenance_subscriptions",
  maintenanceRequests: "maintenance_requests",
  payments: "payments",
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

const ORDER_BY = Object.freeze({
  leads: ["updated_at", false],
  discoveryRuns: ["created_at", false],
  discoveryResults: ["created_at", false],
  templates: ["updated_at", false],
  demos: ["updated_at", false],
  demoVersions: ["created_at", false],
  drafts: ["updated_at", false],
  emailThreads: ["last_message_at", false],
  emails: ["created_at", false],
  followUps: ["due_at", true],
  approvals: ["created_at", false],
  agentRuns: ["created_at", false],
  agentEvents: ["created_at", false],
  notifications: ["created_at", false],
  clients: ["updated_at", false],
  clientSites: ["updated_at", false],
  projects: ["updated_at", false],
  projectTasks: ["sort_order", true],
  maintenanceSubscriptions: ["updated_at", false],
  maintenanceRequests: ["created_at", false],
  payments: ["created_at", false],
  expenses: ["occurred_on", false],
  aiUsage: ["occurred_at", false],
  pricingExperiments: ["created_at", false],
  activity: ["created_at", false],
  tasks: ["due_at", true],
  calendarEvents: ["starts_at", true],
  notes: ["updated_at", false],
  deployments: ["updated_at", false],
  settings: ["key", true],
  integrations: ["provider", true],
});

const SEED_ORDER = [
  "templates", "leads", "discoveryRuns", "discoveryResults", "demos",
  "demoVersions", "drafts", "emailThreads", "emails", "followUps",
  "clients", "clientSites", "projects", "projectTasks",
  "maintenanceSubscriptions", "maintenanceRequests", "payments", "expenses",
  "aiUsage", "pricingExperiments", "agentRuns", "agentEvents", "approvals",
  "notifications", "activity", "tasks", "calendarEvents", "notes",
  "deployments", "settings", "integrations",
];

function userId() {
  return getState().user?.id;
}

function isPreview() {
  return getState().mode === "preview";
}

export async function ensureProfile(user) {
  const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner";
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, full_name: fullName }, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function fetchCollection(key) {
  const [column, ascending] = ORDER_BY[key];
  const limit = ["agentEvents", "activity", "emails", "discoveryResults"].includes(key) ? 500 : 750;
  const { data, error } = await supabase
    .from(COLLECTIONS[key])
    .select("*")
    .order(column, { ascending, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function loadWorkspace(user) {
  const keys = Object.keys(COLLECTIONS);
  const results = await Promise.all([ensureProfile(user), ...keys.map(fetchCollection)]);
  const next = { profile: results[0] };
  keys.forEach((key, index) => { next[key] = results[index + 1]; });
  setData(next);
  return next;
}

export function loadPreviewWorkspace() {
  const sample = createSampleData();
  setData(sample);
  return sample;
}

export async function createRecord(collection, values) {
  const [record] = await createRecords(collection, [values]);
  return record;
}

export async function createRecords(collection, values) {
  if (!values.length) return [];
  const now = new Date().toISOString();
  if (isPreview()) {
    const records = values.map((value) => ({
      ...value,
      id: value.id || uid(),
      user_id: userId(),
      created_at: value.created_at || now,
      updated_at: value.updated_at || now,
    }));
    setData({ [collection]: [...records, ...getState().data[collection]] });
    return records;
  }

  const records = values.map((value) => ({ ...value, user_id: userId() }));
  const { data, error } = await supabase.from(COLLECTIONS[collection]).insert(records).select();
  if (error) throw error;
  setData({ [collection]: [...(data || []), ...getState().data[collection]] });
  return data || [];
}

export async function updateRecord(collection, id, patch) {
  if (isPreview()) {
    const updated = getState().data[collection].map((item) => (
      item.id === id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item
    ));
    setData({ [collection]: updated });
    return updated.find((item) => item.id === id);
  }

  const { data, error } = await supabase
    .from(COLLECTIONS[collection])
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  setData({
    [collection]: getState().data[collection].map((item) => item.id === id ? data : item),
  });
  return data;
}

export async function deleteRecord(collection, id) {
  if (!isPreview()) {
    const { error } = await supabase.from(COLLECTIONS[collection]).delete().eq("id", id);
    if (error) throw error;
  }
  setData({ [collection]: getState().data[collection].filter((item) => item.id !== id) });
}

export async function updateProfilePreferences(patch) {
  const profile = getState().data.profile;
  const preferences = { ...(profile?.preferences || {}), ...patch };
  if (isPreview()) {
    const next = { ...profile, preferences };
    setData({ profile: next });
    return next;
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({ preferences })
    .eq("id", userId())
    .select()
    .single();
  if (error) throw error;
  setData({ profile: data });
  return data;
}

export async function logActivity(type, title, detail = "", relations = {}, actorType = "user") {
  return createRecord("activity", {
    type,
    title,
    detail,
    actor_type: actorType,
    lead_id: relations.lead_id || null,
    client_id: relations.client_id || null,
    project_id: relations.project_id || null,
    metadata: relations.metadata || {},
  });
}

export async function createDiscoveryRun(query) {
  return createRecord("discoveryRuns", {
    source: "openscout",
    engine_version: "openscout-2026-07-25",
    query,
    status: "running",
    started_at: new Date().toISOString(),
  });
}

export async function completeDiscoveryRun(runId, result) {
  const rows = result.leads.map((lead) => toDiscoveryResult(lead, runId));
  const stored = await createRecords("discoveryResults", rows);
  await updateRecord("discoveryRuns", runId, {
    status: result.failedTiles ? "partial" : "completed",
    scanned_count: result.scanned || 0,
    result_count: result.leads.length,
    duplicate_count: result.mergedDuplicates || 0,
    summary: {
      query: result.query,
      tiles: result.tiles,
      failedTiles: result.failedTiles,
      excludedChains: result.excludedChains,
      hiddenLowConfidence: result.hiddenLowConfidence,
      estimatedAccuracy: result.estimatedAccuracy,
      estimatedMistakeRate: result.estimatedMistakeRate,
      verified: result.verified,
      radiusKm: result.radiusKm,
    },
    completed_at: new Date().toISOString(),
  });
  await logActivity(
    "lead_discovery",
    "OpenScout discovery completed",
    `${result.scanned || 0} businesses scanned; ${stored.length} candidates retained.`,
    { metadata: { run_id: runId } },
    "system",
  );
  return stored;
}

export async function failDiscoveryRun(runId, message) {
  if (!runId) return;
  await updateRecord("discoveryRuns", runId, {
    status: "failed",
    error_message: message,
    completed_at: new Date().toISOString(),
  });
}

export async function saveDiscoveryCandidates(resultIds) {
  const wanted = new Set(resultIds);
  const candidates = getState().data.discoveryResults.filter((item) => wanted.has(item.id));
  const known = new Map(getState().data.leads.map((lead) => [duplicateKey(lead), lead]));
  const saved = [];
  const duplicates = [];

  for (const result of candidates) {
    const normalized = result.normalized_data;
    const existing = known.get(duplicateKey(normalized));
    if (existing) {
      duplicates.push(existing);
      await updateRecord("discoveryResults", result.id, {
        decision: "duplicate",
        duplicate_of_lead_id: existing.id,
        decision_reason: "Matched an existing lead",
        decided_at: new Date().toISOString(),
      });
      continue;
    }

    const lead = await createRecord("leads", normalized);
    known.set(duplicateKey(lead), lead);
    saved.push(lead);
    await updateRecord("discoveryResults", result.id, {
      decision: "saved",
      lead_id: lead.id,
      decided_at: new Date().toISOString(),
    });
    await logActivity("lead_saved", "Lead saved", `${lead.business_name} entered the New pipeline stage.`, { lead_id: lead.id });
  }

  const runIds = [...new Set(candidates.map((item) => item.run_id))];
  for (const runId of runIds) {
    const runResults = getState().data.discoveryResults.filter((item) => item.run_id === runId);
    await updateRecord("discoveryRuns", runId, {
      saved_count: runResults.filter((item) => item.decision === "saved").length,
      duplicate_count: runResults.filter((item) => item.decision === "duplicate").length,
      rejected_count: runResults.filter((item) => item.decision === "rejected").length,
    });
  }
  return { saved, duplicates };
}

export async function rejectDiscoveryCandidates(resultIds, reason = "Rejected by operator") {
  const wanted = new Set(resultIds);
  const targets = getState().data.discoveryResults.filter((item) => wanted.has(item.id));
  for (const result of targets) {
    await updateRecord("discoveryResults", result.id, {
      decision: "rejected",
      decision_reason: reason,
      decided_at: new Date().toISOString(),
    });
  }
  return targets;
}

export async function resolveApproval(id, status) {
  const resolved = await updateRecord("approvals", id, {
    status,
    resolved_at: new Date().toISOString(),
  });

  if (status === "approved" && resolved.entity_id) {
    if (["email_send", "follow_up_send"].includes(resolved.approval_type)) {
      const draft = getState().data.drafts.find((item) => item.id === resolved.entity_id);
      if (draft) await updateRecord("drafts", resolved.entity_id, { status: "approved" });
    }
  }
  await logActivity(`approval_${status}`, `Approval ${status}`, resolved.title, {}, "system");
  return resolved;
}

export async function startManualRun(title = "Review priority pipeline") {
  const run = await createRecord("agentRuns", {
    agent_type: "orchestrator",
    title,
    objective: title,
    status: "queued",
    current_step: "Queued in manual mode",
    progress: 0,
    estimated_cost: 0,
    context: { manual_mode: true },
    completed_steps: [],
    upcoming_steps: ["Inspect records", "Prepare recommendation", "Await approval"],
    messages: [],
  });
  await createRecord("agentEvents", {
    run_id: run.id,
    agent_type: "orchestrator",
    event_type: "run_queued",
    title: "Manual workflow queued",
    detail: "No external model call was made.",
  });
  return run;
}

export async function markNotificationsRead() {
  const unread = getState().data.notifications.filter((item) => !item.is_read);
  if (!unread.length) return;
  if (!isPreview()) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId())
      .eq("is_read", false);
    if (error) throw error;
  }
  setData({
    notifications: getState().data.notifications.map((item) => ({ ...item, is_read: true })),
  });
}

export async function uploadDemoBundle(demoId, file) {
  if (isPreview()) {
    return createRecord("demoVersions", {
      demo_id: demoId,
      version_number: getState().data.demoVersions.filter((item) => item.demo_id === demoId).length + 1,
      storage_path: `preview/${file.name}`,
      change_summary: "Preview upload",
      is_current: true,
    });
  }

  const versionNumber = getState().data.demoVersions.filter((item) => item.demo_id === demoId).length + 1;
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${userId()}/demos/${demoId}/v${versionNumber}-${slugify(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(CONFIG.storageBucket)
    .upload(path, file, { upsert: false, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const current = getState().data.demoVersions.filter((item) => item.demo_id === demoId && item.is_current);
  await Promise.all(current.map((item) => updateRecord("demoVersions", item.id, { is_current: false })));
  return createRecord("demoVersions", {
    demo_id: demoId,
    version_number: versionNumber,
    storage_path: path,
    change_summary: `Uploaded ${file.name}`,
    is_current: true,
  });
}

export async function seedWorkspace() {
  if (isPreview()) return loadPreviewWorkspace();
  if (getState().data.leads.length) return false;

  const sample = createSampleData();
  const idMap = new Map();
  SEED_ORDER.forEach((collection) => {
    sample[collection].forEach((item) => {
      if (item.id) idMap.set(item.id, uid());
    });
  });

  for (const collection of SEED_ORDER) {
    const table = COLLECTIONS[collection];
    const rows = sample[collection].map((item) => {
      const record = structuredClone(item);
      if (collection === "agentEvents") {
        delete record.id;
      } else if (record.id) {
        record.id = idMap.get(record.id);
      }
      Object.entries(record).forEach(([key, value]) => {
        if ((key.endsWith("_id") || key === "entity_id") && typeof value === "string" && idMap.has(value)) {
          record[key] = idMap.get(value);
        }
      });
      record.user_id = userId();
      return record;
    });
    if (!rows.length) continue;
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw error;
  }

  await loadWorkspace(getState().user);
  return true;
}

let realtimeChannel;

export function subscribeToWorkspaceChanges(onChange) {
  if (isPreview() || !userId()) return () => {};
  realtimeChannel = supabase
    .channel(`operations-${userId()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId()}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "approvals", filter: `user_id=eq.${userId()}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs", filter: `user_id=eq.${userId()}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_log", filter: `user_id=eq.${userId()}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId()}` }, onChange)
    .subscribe();

  return () => {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  };
}
