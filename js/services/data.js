import { getState, setData } from "../core/state.js";
import { uid, slugify } from "../core/utils.js";
import { createSampleData } from "../data/sample-data.js";
import { CONFIG } from "../config.js";
import { supabase } from "./supabase.js";

const collections = {
  analyses: "lead_analyses",
  templates: "site_templates",
  demos: "demos",
  demoVersions: "demo_versions",
  drafts: "message_drafts",
  communications: "communications",
  followUps: "follow_ups",
  approvals: "approvals",
  agentRuns: "agent_runs",
  agentEvents: "agent_events",
  notifications: "notifications",
  clients: "clients",
  costEvents: "cost_events",
  pricingExperiments: "pricing_experiments",
  financeTransactions: "finance_transactions",
  financeGoals: "finance_goals",
  integrations: "integration_connections",
};

const orderBy = {
  leads: ["updated_at", false],
  analyses: ["updated_at", false],
  templates: ["updated_at", false],
  demos: ["updated_at", false],
  demoVersions: ["created_at", false],
  drafts: ["updated_at", false],
  communications: ["occurred_at", false],
  followUps: ["due_at", true],
  approvals: ["created_at", false],
  agentRuns: ["created_at", false],
  agentEvents: ["created_at", false],
  notifications: ["created_at", false],
  clients: ["updated_at", false],
  costEvents: ["occurred_at", false],
  pricingExperiments: ["created_at", false],
  financeTransactions: ["occurred_on", false],
  financeGoals: ["priority", true],
  integrations: ["provider", true],
};

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
  const table = key === "leads" ? "leads" : collections[key];
  const [column, ascending] = orderBy[key];
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order(column, { ascending })
    .limit(key === "agentEvents" ? 100 : 500);
  if (error) throw error;
  return data || [];
}

export async function loadWorkspace(user) {
  const profilePromise = ensureProfile(user);
  const keys = ["leads", ...Object.keys(collections)];
  const results = await Promise.all([profilePromise, ...keys.map(fetchCollection)]);
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
  if (isPreview()) {
    const record = { ...values, id: values.id || uid(), user_id: userId() };
    setData({ [collection]: [record, ...getState().data[collection]] });
    return record;
  }

  const table = collection === "leads" ? "leads" : collections[collection];
  const record = { ...values, user_id: userId() };
  const { data, error } = await supabase.from(table).insert(record).select().single();
  if (error) throw error;
  setData({ [collection]: [data, ...getState().data[collection]] });
  return data;
}

export async function updateRecord(collection, id, patch) {
  if (isPreview()) {
    const updated = getState().data[collection].map((item) => (
      item.id === id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item
    ));
    setData({ [collection]: updated });
    return updated.find((item) => item.id === id);
  }

  const table = collection === "leads" ? "leads" : collections[collection];
  const { data, error } = await supabase
    .from(table)
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
    const table = collection === "leads" ? "leads" : collections[collection];
    const { error } = await supabase.from(table).delete().eq("id", id);
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

export async function resolveApproval(id, status) {
  const resolved = await updateRecord("approvals", id, {
    status,
    resolved_at: new Date().toISOString(),
  });

  if (status === "approved") {
    if (resolved.approval_type === "email_send" && resolved.entity_id) {
      await updateRecord("drafts", resolved.entity_id, { status: "approved" });
    }
  }

  await createRecord("agentEvents", {
    agent_type: "system",
    event_type: `approval_${status}`,
    title: `Approval ${status.replace("_", " ")}`,
    detail: resolved.title,
  });

  return resolved;
}

export async function startManualRun(title = "Review priority pipeline") {
  const run = await createRecord("agentRuns", {
    agent_type: "orchestrator",
    title,
    status: "queued",
    current_step: "Queued in manual mode",
    progress: 0,
    estimated_cost: 0,
    context: { manual_mode: true },
  });
  await createRecord("agentEvents", {
    run_id: run.id,
    agent_type: "orchestrator",
    event_type: "run_queued",
    title: "Manual run queued",
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
  const path = `${userId()}/demos/${demoId}/v${versionNumber}-${slugify(file.name.replace(/\.[^.]+$/, ""))}.${file.name.split(".").pop()}`;
  const { error: uploadError } = await supabase.storage
    .from(CONFIG.storageBucket)
    .upload(path, file, { upsert: false, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const existing = getState().data.demoVersions.filter((item) => item.demo_id === demoId && item.is_current);
  await Promise.all(existing.map((item) => updateRecord("demoVersions", item.id, { is_current: false })));
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
  const remap = (oldId) => {
    if (!oldId) return null;
    if (!idMap.has(oldId)) idMap.set(oldId, uid());
    return idMap.get(oldId);
  };

  const templates = sample.templates.map((item) => ({
    ...item,
    id: remap(item.id),
    user_id: userId(),
  }));
  const leads = sample.leads.map((item) => ({
    ...item,
    id: remap(item.id),
    user_id: userId(),
    is_sample: true,
  }));

  const { error: templateError } = await supabase.from("site_templates").insert(templates);
  if (templateError) throw templateError;
  const { error: leadError } = await supabase.from("leads").insert(leads);
  if (leadError) throw leadError;

  const related = [
    ["lead_analyses", sample.analyses.map((item) => ({ ...item, id: uid(), user_id: userId(), lead_id: remap(item.lead_id) }))],
    ["demos", sample.demos.map((item) => ({ ...item, id: remap(item.id), user_id: userId(), lead_id: remap(item.lead_id), template_id: remap(item.template_id) }))],
    ["message_drafts", sample.drafts.map((item) => ({ ...item, id: remap(item.id), user_id: userId(), lead_id: remap(item.lead_id) }))],
    ["communications", sample.communications.map((item) => ({ ...item, id: uid(), user_id: userId(), lead_id: remap(item.lead_id), draft_id: item.draft_id ? remap(item.draft_id) : null }))],
    ["follow_ups", sample.followUps.map((item) => ({ ...item, id: uid(), user_id: userId(), lead_id: remap(item.lead_id), draft_id: item.draft_id ? remap(item.draft_id) : null }))],
    ["agent_runs", sample.agentRuns.map((item) => ({ ...item, id: remap(item.id), user_id: userId() }))],
    ["notifications", sample.notifications.map((item) => ({ ...item, id: uid(), user_id: userId() }))],
    ["clients", sample.clients.map((item) => ({ ...item, id: uid(), user_id: userId(), lead_id: remap(item.lead_id) }))],
    ["pricing_experiments", sample.pricingExperiments.map((item) => ({ ...item, id: uid(), user_id: userId() }))],
    ["finance_transactions", sample.financeTransactions.map((item) => ({ ...item, id: uid(), user_id: userId() }))],
    ["finance_goals", sample.financeGoals.map((item) => ({ ...item, id: uid(), user_id: userId() }))],
  ];

  for (const [table, rows] of related) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw error;
  }

  const approvals = sample.approvals.map((item) => ({
    ...item,
    id: uid(),
    user_id: userId(),
    entity_id: remap(item.entity_id),
  }));
  const events = sample.agentEvents.map((item) => ({
    user_id: userId(),
    run_id: item.run_id ? remap(item.run_id) : null,
    agent_type: item.agent_type,
    event_type: item.event_type,
    title: item.title,
    detail: item.detail,
    created_at: item.created_at,
  }));
  const costs = sample.costEvents.map((item) => ({
    ...item,
    id: uid(),
    user_id: userId(),
    lead_id: item.lead_id ? remap(item.lead_id) : null,
    run_id: item.run_id ? remap(item.run_id) : null,
  }));

  for (const [table, rows] of [["approvals", approvals], ["agent_events", events], ["cost_events", costs]]) {
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
    .on("postgres_changes", { event: "*", schema: "public", table: "agent_events", filter: `user_id=eq.${userId()}` }, onChange)
    .subscribe();

  return () => {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  };
}
