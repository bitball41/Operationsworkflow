import { CONFIG } from "../config.js";
import { DEFAULT_EFFORT, DEFAULT_MODEL_ID } from "../data/models.js";
import { getState, setData, setState } from "../core/state.js";
import { debounce, slugify, uid } from "../core/utils.js";
import { duplicateKey, toDiscoveryResult } from "./openscout/adapter.js";
import { getSession, getSupabase, hasStoredSession, isConfigured } from "./supabase.js";

const LOCAL_KEY = "operations.data.v2";

/* Records written by the old starter workspace all carry this id prefix. The
   sample workspace no longer exists, so any of them still sitting in a browser
   are swept out on load — otherwise invented emails, revenue and statistics
   would keep showing up as if they were real. */
const SAMPLE_ID_PREFIX = "10000000-0000-4000-8000-";

function isSampleRecord(record) {
  return typeof record?.id === "string" && record.id.startsWith(SAMPLE_ID_PREFIX);
}

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

const COLLECTION_KEYS = Object.keys(COLLECTIONS);

function isCloud() {
  return getState().storage === "cloud";
}

function userId() {
  return getState().user?.id || "local";
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

/* ---------- local persistence ---------- */

const persist = debounce(() => {
  try {
    const snapshot = { profile: getState().data.profile };
    COLLECTION_KEYS.forEach((key) => { snapshot[key] = getState().data[key]; });
    globalThis.localStorage?.setItem(LOCAL_KEY, JSON.stringify(snapshot));
  } catch (error) {
    setState({ connection: { ok: false, message: "Local storage is full — recent changes may not survive a reload." } });
    console.error(error);
  }
}, 350);

function afterLocalWrite() {
  if (!isCloud()) persist();
}

function readLocal() {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasLocalWorkspace() {
  return Boolean(readLocal());
}

export function clearLocalWorkspace() {
  globalThis.localStorage?.removeItem(LOCAL_KEY);
}

/* ---------- boot ---------- */

/**
 * Opens the workspace. Supabase is used when a session already exists; there is
 * never a sign-in wall. Any failure falls back to local storage and records a
 * non-blocking warning.
 */
export async function initWorkspace() {
  let session = null;
  if (isConfigured() && hasStoredSession()) {
    try {
      session = await getSession();
    } catch (error) {
      console.warn("Supabase session unavailable", error);
      setState({ connection: { ok: false, message: "Could not reach Supabase. Working from local data." } }, { silent: true });
    }
  }

  if (session?.user) {
    setState({ storage: "cloud", user: session.user }, { silent: true });
    try {
      /* loadCloudWorkspace sets `connection` itself: it can succeed with some
         tables unreadable, and that partial state must survive to the UI. */
      await loadCloudWorkspace(session.user);
      return "cloud";
    } catch (error) {
      console.error(error);
      setState({
        storage: "local",
        connection: { ok: false, message: "Signed in, but the database could not be read. Working from local data." },
      }, { silent: true });
    }
  }

  loadLocalWorkspace();
  return "local";
}

/**
 * Opens the local workspace. Every number on screen is one you put there: a new
 * workspace is empty, and nothing in the application can seed it.
 */
export function loadLocalWorkspace() {
  const data = readLocal() || { profile: null };
  const next = { profile: data.profile || null };
  let swept = 0;

  COLLECTION_KEYS.forEach((key) => {
    const records = Array.isArray(data[key]) ? data[key] : [];
    const kept = records.filter((record) => !isSampleRecord(record));
    swept += records.length - kept.length;
    next[key] = kept.sort(compare(key));
  });

  setState({ storage: "local" }, { silent: true });
  setData(next, { silent: true });
  if (swept) persist();
  return next;
}

async function fetchCollection(client, key) {
  const [column, ascending] = ORDER_BY[key];
  const limit = ["agentEvents", "activity", "emails", "discoveryResults"].includes(key) ? 500 : 750;
  const { data, error } = await client
    .from(COLLECTIONS[key])
    .select("*")
    .order(column, { ascending, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function ensureProfile(client, user) {
  const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || CONFIG.owner;
  const { data, error } = await client
    .from("profiles")
    .upsert({ id: user.id, full_name: fullName }, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Reads the whole workspace from Supabase.
 *
 * Collections are settled independently. One table erroring — a migration that
 * has not been applied, a policy that changed — used to reject the whole load
 * and drop the session back to local storage, so a single broken table looked
 * exactly like "Supabase is down". Now the rest of the workspace still opens
 * and the failures are named.
 */
export async function loadCloudWorkspace(user = getState().user) {
  const client = await getSupabase();
  const [profile, ...collections] = await Promise.allSettled([
    ensureProfile(client, user),
    ...COLLECTION_KEYS.map((key) => fetchCollection(client, key)),
  ]);

  if (profile.status === "rejected") throw profile.reason;

  const next = { profile: profile.value };
  const failed = [];
  COLLECTION_KEYS.forEach((key, index) => {
    const result = collections[index];
    if (result.status === "fulfilled") {
      next[key] = result.value;
      return;
    }
    failed.push(COLLECTIONS[key]);
    next[key] = [];
    console.error(`Could not read ${COLLECTIONS[key]}`, result.reason);
  });

  setData(next);
  setState({
    connection: failed.length
      ? { ok: false, message: `Signed in, but ${failed.length} table${failed.length === 1 ? "" : "s"} could not be read: ${failed.slice(0, 4).join(", ")}.` }
      : { ok: true, message: "" },
  }, { silent: true });
  return next;
}

/* Records that exist only to describe other records, and are rebuilt from them
   rather than copied. Uploading them would duplicate history, not preserve it. */
const DERIVED_COLLECTIONS = new Set(["settings", "integrations", "aiUsage"]);

/**
 * Copies this browser's workspace into Supabase.
 *
 * Signing in used to silently swap the local workspace for an empty cloud one,
 * which reads exactly like losing every lead you had. This is the missing
 * bridge: it uploads local records, rewrites the ids the database assigns so
 * relations survive, and leaves local storage untouched so nothing is at risk
 * if the upload fails halfway.
 */
export async function pushLocalWorkspaceToCloud() {
  if (!isCloud()) throw new Error("Sign in to Supabase before uploading this workspace.");

  const local = readLocal();
  if (!local) return { uploaded: 0, collections: [], skipped: [] };

  const client = await getSupabase();
  const idMap = new Map();
  const uploadedPer = [];
  const skipped = [];
  let uploaded = 0;

  /* Parents first: a child's foreign key is remapped through ids already
     assigned to its parent, so order is the whole correctness argument here. */
  const ORDER = [
    "leads", "templates", "clients", "projects", "demos", "discoveryRuns", "discoveryResults",
    "demoVersions", "drafts", "emailThreads", "emails", "followUps", "approvals", "agentRuns",
    "agentEvents", "notifications", "clientSites", "projectTasks", "maintenanceSubscriptions",
    "maintenanceRequests", "payments", "expenses", "pricingExperiments", "activity", "tasks",
    "calendarEvents", "notes", "deployments",
  ];

  const RELATION_KEYS = [
    "lead_id", "client_id", "project_id", "demo_id", "template_id", "draft_id", "thread_id",
    "run_id", "site_id", "duplicate_of_lead_id", "maintenance_subscription_id",
  ];

  const existingKeys = new Set(getState().data.leads.map((lead) => String(lead.source_key || "")).filter(Boolean));

  for (const key of ORDER) {
    if (DERIVED_COLLECTIONS.has(key)) continue;
    const records = Array.isArray(local[key]) ? local[key] : [];
    if (!records.length) continue;

    const payload = records.map((record) => {
      const { id, user_id: _ignoredUser, created_at: createdAt, updated_at: updatedAt, ...rest } = record;
      const mapped = { ...rest };
      RELATION_KEYS.forEach((relation) => {
        if (mapped[relation]) mapped[relation] = idMap.get(String(mapped[relation])) ?? null;
      });
      return {
        local_id: String(id),
        row: { ...mapped, user_id: userId(), ...(createdAt ? { created_at: createdAt } : {}), ...(updatedAt ? { updated_at: updatedAt } : {}) },
      };
    }).filter((entry) => !(key === "leads" && entry.row.source_key && existingKeys.has(String(entry.row.source_key))));

    if (!payload.length) continue;

    const { data, error } = await client
      .from(COLLECTIONS[key])
      .insert(payload.map((entry) => entry.row))
      .select();

    if (error) {
      skipped.push(`${COLLECTIONS[key]} (${error.message})`);
      continue;
    }

    /* The returned rows line up with the values that were sent, which is what
       makes the id remapping work. If they ever did not, mapping by position
       would attach a child to the wrong parent — so a length mismatch stops
       the mapping for this collection instead of guessing. */
    const rows = data || [];
    if (rows.length === payload.length) {
      rows.forEach((row, index) => idMap.set(payload[index].local_id, row.id));
    } else {
      skipped.push(`${COLLECTIONS[key]} relations (inserted ${rows.length} of ${payload.length})`);
    }
    uploaded += rows.length;
    uploadedPer.push(`${rows.length} ${COLLECTIONS[key]}`);
  }

  await loadCloudWorkspace();
  return { uploaded, collections: uploadedPer, skipped };
}

export async function reloadWorkspace() {
  return isCloud() ? loadCloudWorkspace() : loadLocalWorkspace();
}

/* ---------- CRUD ---------- */

export async function createRecord(collection, values) {
  const [record] = await createRecords(collection, [values]);
  return record;
}

export async function createRecords(collection, values) {
  if (!values.length) return [];
  const now = new Date().toISOString();

  if (!isCloud()) {
    const records = values.map((value) => ({
      ...value,
      id: value.id || uid(),
      user_id: userId(),
      created_at: value.created_at || now,
      updated_at: value.updated_at || now,
    }));
    setData({ [collection]: [...records, ...getState().data[collection]] });
    afterLocalWrite();
    return records;
  }

  const client = await getSupabase();
  const payload = values.map((value) => ({ ...value, user_id: userId() }));
  const { data, error } = await client.from(COLLECTIONS[collection]).insert(payload).select();
  if (error) throw error;
  setData({ [collection]: [...(data || []), ...getState().data[collection]] });
  return data || [];
}

export async function updateRecord(collection, id, patch) {
  if (!isCloud()) {
    let updated = null;
    const next = getState().data[collection].map((item) => {
      if (String(item.id) !== String(id)) return item;
      updated = { ...item, ...patch, updated_at: new Date().toISOString() };
      return updated;
    });
    setData({ [collection]: next });
    afterLocalWrite();
    return updated;
  }

  const client = await getSupabase();
  const { data, error } = await client
    .from(COLLECTIONS[collection])
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  setData({ [collection]: getState().data[collection].map((item) => (String(item.id) === String(id) ? data : item)) });
  return data;
}

export async function deleteRecord(collection, id) {
  if (isCloud()) {
    const client = await getSupabase();
    const { error } = await client.from(COLLECTIONS[collection]).delete().eq("id", id);
    if (error) throw error;
  }
  setData({ [collection]: getState().data[collection].filter((item) => String(item.id) !== String(id)) });
  afterLocalWrite();
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
    preview_domain: CONFIG.previewDomain,
    follow_up_days: [3, 7, 14],
    model: DEFAULT_MODEL_ID,
    effort: DEFAULT_EFFORT,
    ...(data.settings.find((item) => item.key === "workspace")?.value || {}),
    ...(data.profile?.preferences || {}),
  };
}

export async function savePreferences(patch) {
  const merged = { ...(getState().data.profile?.preferences || {}), ...patch };

  if (isCloud()) {
    const client = await getSupabase();
    const { data, error } = await client
      .from("profiles")
      .update({ preferences: merged })
      .eq("id", userId())
      .select()
      .single();
    if (error) throw error;
    setData({ profile: data });
  } else {
    setData({ profile: { ...(getState().data.profile || { id: "local", full_name: CONFIG.owner }), preferences: merged } });
    afterLocalWrite();
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

  if (!isCloud()) {
    return createRecord("demoVersions", {
      demo_id: demoId,
      version_number: versionNumber,
      storage_path: `local/${file.name}`,
      change_summary: `Recorded ${file.name} locally (sign in to upload to storage)`,
      is_current: true,
    });
  }

  const client = await getSupabase();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${userId()}/demos/${demoId}/v${versionNumber}-${slugify(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;
  const { error } = await client.storage.from(CONFIG.storageBucket).upload(path, file, { upsert: false, cacheControl: "3600" });
  if (error) throw error;

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

/* ---------- realtime ---------- */

let channel = null;

export function subscribeToWorkspaceChanges(onChange) {
  if (!isCloud()) return () => {};
  const id = userId();
  getSupabase().then((client) => {
    channel = client
      .channel(`operations-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads", filter: `user_id=eq.${id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_log", filter: `user_id=eq.${id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${id}` }, onChange)
      .subscribe();
  }).catch((error) => console.warn("Realtime unavailable", error));

  return () => {
    if (!channel) return;
    getSupabase().then((client) => client.removeChannel(channel)).catch(() => {});
    channel = null;
  };
}
