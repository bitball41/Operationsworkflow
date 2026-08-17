import { CONFIG } from "../config.js";
import { DEFAULT_EFFORT, DEFAULT_MODEL_ID } from "../data/models.js";
import { getState, resetData, setData, setState } from "../core/state.js";
import { duplicateKey, toDiscoveryResult } from "./openscout/adapter.js";
import {
  createWorkspaceRecords,
  deleteWorkspaceRecord,
  fetchWorkspace,
  updateWorkspaceProfile,
  updateWorkspaceRecord,
  uploadWorkspaceAsset,
} from "./api.js";


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
  voiceAgents: "voice_agents",
  voiceConversations: "voice_conversations",
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
  assistantConversations: ["last_message_at", false],
  agentRuns: ["created_at", false],
  agentEvents: ["created_at", false],
  notifications: ["created_at", false],
  teamMembers: ["full_name", true],
  clients: ["updated_at", false],
  clientSites: ["updated_at", false],
  salesCalls: ["called_at", false],
  meetings: ["starts_at", true],
  onboardingRecords: ["updated_at", false],
  projects: ["updated_at", false],
  projectTasks: ["sort_order", true],
  automations: ["updated_at", false],
  voiceAgents: ["updated_at", false],
  voiceConversations: ["started_at", false],
  knowledgeEntries: ["updated_at", false],
  maintenanceSubscriptions: ["updated_at", false],
  maintenanceRequests: ["created_at", false],
  payments: ["created_at", false],
  commissions: ["created_at", false],
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

const COLLECTION_KEYS = Object.keys(COLLECTIONS);

/* Node-only fixtures use transient memory records. This is never enabled by
   the dashboard and never writes browser storage. */
function usesTestMemory() {
  return globalThis.__OPERATIONS_TEST_MEMORY__ === true;
}

function testId() {
  return globalThis.crypto?.randomUUID?.() || `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function compare(key) {
  const [column, ascending] = ORDER_BY[key] || ["created_at", false];
  return (a, b) => {
    const left = a?.[column];
    const right = b?.[column];
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    const result = typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right));
    return ascending ? result : -result;
  };
}

/* Legacy operational records are intentionally discarded, never imported. */
export function clearLocalWorkspace() {
  try {
    globalThis.localStorage?.removeItem("operations.data.v2");
    globalThis.localStorage?.removeItem("operations.data.v2.cloud-signature");
    globalThis.localStorage?.removeItem("operations.automation");
    globalThis.localStorage?.removeItem("openscout.googleMapsApiKey");
    globalThis.localStorage?.removeItem("openscout.lastLocationGuess");
    for (let index = globalThis.localStorage?.length - 1; index >= 0; index -= 1) {
      const key = globalThis.localStorage?.key(index);
      if (/^sb-.*-auth-token$/i.test(String(key || ""))) globalThis.localStorage?.removeItem(key);
    }
  } catch {
    /* Storage can be disabled. There is still no browser data fallback. */
  }
}

/* ---------- boot ---------- */

/**
 * Opens the one Operations workspace through the same-origin Worker. Cloudflare
 * Access has already authenticated the request before this code can load.
 */
export async function initWorkspace() {
  clearLocalWorkspace();
  try {
    const snapshot = await fetchWorkspace();
    await loadCloudWorkspace(snapshot);
    setState({
      storage: "cloud",
      user: snapshot.workspace || { name: "Operations" },
      workspace: { status: "ready", message: "" },
      connection: { ok: true, message: "" },
    }, { silent: true });
    return "cloud";
  } catch (error) {
    console.error(error);
    resetData();
    setState({
      user: null,
      workspace: { status: "error", message: "The Operations workspace could not be loaded. No browser copy was used." },
      connection: { ok: false, message: error?.message || "Could not reach the workspace service." },
    }, { silent: true });
    return "error";
  }
}

/**
 * Applies an atomic server snapshot. The Worker owns the database credential;
 * this browser only receives rows belonging to the configured workspace.
 */
export async function loadCloudWorkspace(snapshot = null) {
  const source = snapshot || await fetchWorkspace();
  const next = { profile: source.profile || null };
  const failed = [];
  COLLECTION_KEYS.forEach((key) => {
    if (!Array.isArray(source[key])) failed.push(COLLECTIONS[key]);
    next[key] = Array.isArray(source[key]) ? [...source[key]].sort(compare(key)) : [];
  });

  if (failed.length) {
    throw new Error(`${failed.length} required table${failed.length === 1 ? "" : "s"} could not be read: ${failed.slice(0, 4).join(", ")}.`);
  }

  setData(next);
  if (source.workspace) setState({ user: source.workspace }, { silent: true });
  setState({ connection: { ok: true, message: "" } }, { silent: true });
  return next;
}

export async function reloadWorkspace() {
  return loadCloudWorkspace();
}

/* ---------- CRUD ---------- */

export async function createRecord(collection, values) {
  const [record] = await createRecords(collection, [values]);
  return record;
}

export async function createRecords(collection, values) {
  if (!values.length) return [];
  if (usesTestMemory()) {
    const now = new Date().toISOString();
    const records = values.map((value) => ({
      ...value,
      id: value.id || testId(),
      user_id: value.user_id || "test-owner",
      created_at: value.created_at || now,
      updated_at: value.updated_at || now,
    }));
    setData({ [collection]: [...records, ...getState().data[collection]] });
    return records;
  }
  const data = await createWorkspaceRecords(collection, values);
  setData({ [collection]: [...data, ...getState().data[collection]].sort(compare(collection)) });
  return data;
}

export async function updateRecord(collection, id, patch) {
  if (usesTestMemory()) {
    let updated = null;
    const next = getState().data[collection].map((item) => {
      if (String(item.id) !== String(id)) return item;
      updated = { ...item, ...patch, updated_at: new Date().toISOString() };
      return updated;
    });
    setData({ [collection]: next });
    return updated;
  }
  const data = await updateWorkspaceRecord(collection, id, patch);
  setData({ [collection]: getState().data[collection].map((item) => (String(item.id) === String(id) ? data : item)) });
  return data;
}

export async function deleteRecord(collection, id) {
  if (usesTestMemory()) {
    setData({ [collection]: getState().data[collection].filter((item) => String(item.id) !== String(id)) });
    return;
  }
  await deleteWorkspaceRecord(collection, id);
  setData({ [collection]: getState().data[collection].filter((item) => String(item.id) !== String(id)) });
}

export function findRecord(collection, id) {
  return getState().data[collection]?.find((item) => String(item.id) === String(id)) || null;
}

/* ---------- preferences ---------- */

export function preferences() {
  const { data } = getState();
  return {
    owner_name: CONFIG.owner,
    default_site_price: CONFIG.defaultPrice,
    maintenance_price: 50,
    default_setup_fee: CONFIG.defaultSetupFee,
    default_monthly_fee: CONFIG.defaultMonthlyFee,
    preview_domain: CONFIG.previewDomain,
    follow_up_days: [3, 7, 14],
    model: DEFAULT_MODEL_ID,
    ai_provider: "anthropic",
    effort: DEFAULT_EFFORT,
    ai_permission_mode: "full",
    ...(data.settings.find((item) => item.key === "workspace")?.value || {}),
    ...(data.profile?.preferences || {}),
  };
}

export async function savePreferences(patch) {
  const merged = { ...(getState().data.profile?.preferences || {}), ...patch };

  if (usesTestMemory()) {
    setData({ profile: { ...(getState().data.profile || { id: "test-owner", full_name: CONFIG.owner }), preferences: merged } });
  } else {
    const data = await updateWorkspaceProfile({ preferences: merged });
    setData({ profile: data });
  }

  const existing = getState().data.settings.find((item) => item.key === "workspace");
  if (existing) await updateRecord("settings", existing.id, { value: merged });
  else await createRecord("settings", { key: "workspace", value: merged });
  return merged;
}

/* ---------- activity ---------- */

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

/* ---------- discovery ---------- */

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
      verified: result.verified,
      radiusKm: result.radiusKm,
      searchScope: result.searchScope || "local",
      requested: result.requested || 0,
      openscoutCandidates: result.totalLeads ?? result.leads.length,
      webPresenceChecked: result.webPresenceChecked || 0,
      excludedExistingWebsite: result.excludedExistingWebsite || 0,
      inconclusiveWebsiteChecks: result.inconclusiveWebsiteChecks || 0,
      emailsMatched: result.emailsMatched || 0,
      retainedWithEmail: result.leads.filter((lead) => Boolean(lead.email)).length,
      retainedWithPhone: result.leads.filter((lead) => Boolean(lead.phone)).length,
    },
    completed_at: new Date().toISOString(),
  });
  await logActivity(
    "lead_discovery",
    "Lead search finished",
    `${result.scanned || 0} businesses scanned, ${stored.length} kept.`,
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
  const wanted = new Set(resultIds.map(String));
  const candidates = getState().data.discoveryResults.filter((item) => wanted.has(String(item.id)));
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
        decision_reason: "Already in leads",
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
  }

  if (saved.length) {
    await logActivity("lead_saved", `${saved.length} lead${saved.length === 1 ? "" : "s"} saved`, saved.map((lead) => lead.business_name).join(", "));
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

export async function rejectDiscoveryCandidates(resultIds, reason = "Rejected") {
  const wanted = new Set(resultIds.map(String));
  const targets = getState().data.discoveryResults.filter((item) => wanted.has(String(item.id)));
  for (const result of targets) {
    await updateRecord("discoveryResults", result.id, {
      decision: "rejected",
      decision_reason: reason,
      decided_at: new Date().toISOString(),
    });
  }
  return targets;
}

/* ---------- storage uploads ---------- */

export async function uploadDemoAsset(demoId, file) {
  const versionNumber = getState().data.demoVersions.filter((item) => item.demo_id === demoId).length + 1;
  const asset = await uploadWorkspaceAsset({
    scope: "demo",
    entityId: demoId,
    version: versionNumber,
    file,
  });

  const current = getState().data.demoVersions.filter((item) => item.demo_id === demoId && item.is_current);
  await Promise.all(current.map((item) => updateRecord("demoVersions", item.id, { is_current: false })));
  return createRecord("demoVersions", {
    demo_id: demoId,
    version_number: versionNumber,
    storage_path: asset.storage_path,
    change_summary: `Uploaded ${file.name}`,
    is_current: true,
  });
}

/* ---------- refresh ---------- */

export function subscribeToWorkspaceChanges(onChange) {
  const refresh = () => {
    if (!globalThis.document || globalThis.document.visibilityState === "visible") onChange();
  };
  const timer = globalThis.setInterval?.(refresh, 30_000);
  globalThis.addEventListener?.("focus", refresh);
  globalThis.document?.addEventListener?.("visibilitychange", refresh);
  return () => {
    if (timer) globalThis.clearInterval?.(timer);
    globalThis.removeEventListener?.("focus", refresh);
    globalThis.document?.removeEventListener?.("visibilitychange", refresh);
  };
}
