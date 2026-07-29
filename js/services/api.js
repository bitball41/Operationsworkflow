/**
 * Client for the Cloudflare Worker that holds the API keys.
 *
 * Nothing in the browser ever sees a secret. This module only knows which
 * providers the Worker reports as configured, and how to ask it to make a call.
 * When the app is served from anything other than the Worker — `python3 -m
 * http.server`, a file:// preview — `/api/status` simply 404s and every
 * provider stays "not connected", which the rest of the app already handles.
 */

export const API_BASE = "/api";

/** Providers the Worker can hold a key for, in the order Integrations shows them. */
export const WORKER_PROVIDERS = Object.freeze([
  "outlook",
  "anthropic",
  "openai",
  "whop",
  "google_maps",
  "cloudflare",
  "research",
  "mcp",
]);

const EMPTY_STATUS = Object.freeze({
  reachable: false,
  providers: Object.freeze({
    outlook: false,
    anthropic: false,
    openai: false,
    whop: false,
    google_maps: false,
    cloudflare: false,
    research: false,
    mcp: false,
  }),
  /* Why Outlook is unusable, when it is. See handleStatus in worker/index.js. */
  outlook: Object.freeze({ configured: false, connected: false, missing: [], account: "", can_read_mail: false }),
  hosting: Object.freeze({ configured: false, domain: "demos.conno.fun", missing: ["DEMO_SITES"] }),
});

export class ApiError extends Error {
  constructor(message, { status = 0, provider = "", blocked = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.provider = provider;
    this.blocked = blocked;
  }
}

async function request(path, { method = "GET", body, form, signal } = {}) {
  let response;
  try {
    const headers = {};
    if (body) headers["content-type"] = "application/json";
    response = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: Object.keys(headers).length ? headers : undefined,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(`Could not reach the API worker: ${error.message}`, { status: 0 });
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (response.ok) return payload ?? {};

  /* 503 with an `error: "not_connected"` body is the Worker saying the secret
     is missing — a blocked action, not a failure to report as a bug. */
  const blocked = response.status === 503 && payload?.error === "not_connected";
  throw new ApiError(
    payload?.message || `The API worker returned ${response.status}.`,
    { status: response.status, provider: payload?.provider || "", blocked },
  );
}

/**
 * Asks the Worker which providers have a key. Returns a shape that is safe to
 * put straight into application state; it never throws.
 */
export async function fetchServiceStatus() {
  try {
    const data = await request("/status");
    const providers = {};
    for (const name of WORKER_PROVIDERS) providers[name] = data?.providers?.[name] === true;
    return {
      reachable: true,
      providers,
      outlook: { ...EMPTY_STATUS.outlook, ...(data?.outlook || {}) },
      hosting: { ...EMPTY_STATUS.hosting, ...(data?.hosting || {}) },
      at: data?.at || new Date().toISOString(),
    };
  } catch {
    return emptyServiceStatus();
  }
}

export function emptyServiceStatus() {
  return {
    ...EMPTY_STATUS,
    providers: { ...EMPTY_STATUS.providers },
    outlook: { ...EMPTY_STATUS.outlook },
    hosting: { ...EMPTY_STATUS.hosting },
  };
}

/* ---------- Cloudflare Access workspace ---------- */

export async function fetchWorkspace() {
  return request("/workspace");
}

export async function createWorkspaceRecords(collection, records) {
  const data = await request(`/workspace/records/${encodeURIComponent(collection)}`, {
    method: "POST",
    body: { records },
  });
  return Array.isArray(data?.records) ? data.records : [];
}

export async function updateWorkspaceRecord(collection, id, patch) {
  const data = await request(`/workspace/records/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
  return data?.record || null;
}

export async function deleteWorkspaceRecord(collection, id) {
  return request(`/workspace/records/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function updateWorkspaceProfile(patch) {
  const data = await request("/workspace/profile", { method: "PATCH", body: patch });
  return data?.profile || null;
}

export async function uploadWorkspaceAsset({ scope, entityId, version = 1, file }) {
  const form = new FormData();
  form.set("scope", scope);
  form.set("entity_id", entityId);
  form.set("version", String(version));
  form.set("file", file, file.name);
  const data = await request("/workspace/assets", { method: "POST", form });
  return data?.asset || null;
}

export async function deleteWorkspaceAssets(paths) {
  return request("/workspace/assets", { method: "DELETE", body: { paths } });
}

export async function signWorkspaceAssetUrls(paths) {
  const data = await request("/workspace/assets/signed-urls", { method: "POST", body: { paths } });
  return Array.isArray(data?.urls) ? data.urls : [];
}

export async function downloadWorkspaceAsset(path) {
  const response = await fetch(`${API_BASE}/workspace/assets/download?${new URLSearchParams({ path })}`)
    .catch((error) => {
      throw new ApiError(`Could not reach the workspace asset service: ${error.message}`, { status: 0 });
    });
  if (response.ok) return response.blob();
  const payload = await response.json().catch(() => ({}));
  throw new ApiError(payload?.message || `The workspace asset service returned ${response.status}.`, {
    status: response.status,
  });
}

/**
 * The Google Maps browser key. It is public by nature — the Maps JavaScript SDK
 * runs in the page — so serving it from the Worker buys central management and
 * a key that is not in git, not secrecy. Restrict it by HTTP referrer.
 */
export async function fetchMapsKey() {
  const data = await request("/maps/key");
  return String(data?.key || "");
}

export async function searchPlaces(payload, { signal } = {}) {
  return request("/maps/places/search-text", { method: "POST", body: payload, signal });
}

export async function browserResearch(url, { signal } = {}) {
  return request("/browser/research", { method: "POST", body: { url }, signal });
}

export async function lookupBusinessEmail(payload, { signal } = {}) {
  return request("/browser/contact-email", { method: "POST", body: payload, signal });
}

export async function callAnthropic(payload, { signal } = {}) {
  return request("/ai/anthropic/messages", { method: "POST", body: payload, signal });
}

export async function callOpenAI(payload, { signal } = {}) {
  return request("/ai/openai/responses", { method: "POST", body: payload, signal });
}

export async function whopGet(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/whop/${String(path).replace(/^\/+/, "")}${query ? `?${query}` : ""}`);
}

export async function connectOutlook() {
  const data = await request("/outlook/connect", { method: "POST" });
  if (!data?.authorization_url) throw new ApiError("The Worker did not return an Outlook sign-in URL.");
  location.assign(data.authorization_url);
}

export async function disconnectOutlook() {
  return request("/outlook/disconnect", { method: "POST" });
}

export async function sendOutlookEmail(payload) {
  return request("/outlook/send", { method: "POST", body: payload });
}

export async function replyToOutlookMessage(payload) {
  return request("/outlook/reply", { method: "POST", body: payload });
}

export async function fetchOutlookMessages({ since = "", limit = 25 } = {}) {
  const query = new URLSearchParams({ limit: String(limit), ...(since ? { since } : {}) });
  const data = await request(`/outlook/messages?${query}`);
  return Array.isArray(data?.messages) ? data.messages : [];
}

export async function publishDemoBundle({ demoId, publicNumber, files, assets = [] }) {
  const form = new FormData();
  form.set("demo_id", String(demoId));
  form.set("public_number", String(publicNumber));
  for (const [path, source] of Object.entries(files || {})) {
    const type = path.endsWith(".html") ? "text/html"
      : path.endsWith(".css") ? "text/css"
        : "text/javascript";
    form.append(`file:${path}`, new Blob([String(source)], { type }), path);
  }
  for (const asset of assets) {
    form.append(`file:${asset.path}`, asset.blob, asset.path.split("/").pop());
  }

  const response = await fetch(`${API_BASE}/demos/publish`, {
    method: "POST",
    body: form,
  }).catch((error) => {
    throw new ApiError(`Could not reach the demo publisher: ${error.message}`, { status: 0, provider: "cloudflare" });
  });

  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  throw new ApiError(payload?.message || `The demo publisher returned ${response.status}.`, {
    status: response.status,
    provider: "cloudflare",
    blocked: response.status === 503,
  });
}
