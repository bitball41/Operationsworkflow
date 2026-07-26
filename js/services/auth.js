import { supabase } from "./supabase.js";

/**
 * Authentication is a single owner password held as a Cloudflare Worker secret.
 * The Worker verifies it, sets a signed HttpOnly cookie, and hands back a real
 * Supabase session so row level security keeps working exactly as before.
 */

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Could not reach the sign-in service. Is the Worker deployed?");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Sign-in failed (${response.status}).`);
  return payload;
}

/** What the Worker thinks of this browser: unlocked? Supabase wired up? */
export function getGateStatus() {
  return api("/session");
}

/** Verify a password against the Worker secret. Resolves with Supabase tokens when available. */
export function unlock(password) {
  return api("/login", { method: "POST", body: JSON.stringify({ password }) });
}

/** Re-issue Supabase tokens for a browser that still holds a valid gate cookie. */
export function requestSupabaseSession() {
  return api("/supabase-session", { method: "POST" });
}

export async function getSupabaseSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function applySupabaseSession(tokens) {
  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await api("/logout", { method: "POST" }).catch(() => {});
  await supabase.auth.signOut().catch(() => {});
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}
