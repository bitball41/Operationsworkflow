/**
 * Client for the Cloudflare Worker that holds the API keys.
 *
 * Nothing in the browser ever sees a secret. This module only knows which
 * providers the Worker reports as configured, and how to ask it to make a call.
 * When the app is served from anything other than the Worker — `python3 -m
 * http.server`, a file:// preview — `/api/status` simply 404s and every
 * provider stays "not connected", which the rest of the app already handles.
 */
import { getSession, hasStoredSession } from "./supabase.js";

export const API_BASE = "/api";

/** Providers the Worker can hold a key for, in the order Integrations shows them. */
export const WORKER_PROVIDERS = Object.freeze(["outlook", "anthropic", "openai", "whop", "google_maps"]);

const EMPTY_STATUS = Object.freeze({
  reachable: false,
  providers: Object.freeze({ outlook: false, anthropic: false, openai: false, whop: false, google_maps: false }),
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

async function sessionAuthorization(required) {
  if (!hasStoredSession()) {
    if (required) throw new ApiError("Sign in to Supabase before using Outlook.", { status: 401 });
    return "";
  }
  const session = await getSession().catch(() => null);
  if (!session?.access_token && required) {
    throw new ApiError("Your Supabase session expired. Sign in again before using Outlook.", { status: 401 });
  }
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

async function request(path, { method = "GET", body, signal, auth = false, optionalAuth = false } = {}) {
  let response;
  try {
    const authorization = auth || optionalAuth ? await sessionAuthorization(auth) : "";
    const headers = {};
    if (body) headers["content-type"] = "application/json";
    if (authorization) headers.authorization = authorization;
    response = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
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
    const data = await request("/status", { optionalAuth: true });
    const providers = {};
    for (const name of WORKER_PROVIDERS) providers[name] = data?.providers?.[name] === true;
    return { reachable: true, providers, at: data?.at || new Date().toISOString() };
  } catch {
    return { ...EMPTY_STATUS, providers: { ...EMPTY_STATUS.providers } };
  }
}

export function emptyServiceStatus() {
  return { ...EMPTY_STATUS, providers: { ...EMPTY_STATUS.providers } };
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
  const data = await request("/outlook/connect", { method: "POST", auth: true });
  if (!data?.authorization_url) throw new ApiError("The Worker did not return an Outlook sign-in URL.");
  location.assign(data.authorization_url);
}

export async function disconnectOutlook() {
  return request("/outlook/disconnect", { method: "POST", auth: true });
}

export async function sendOutlookEmail(payload) {
  return request("/outlook/send", { method: "POST", body: payload, auth: true });
}
