import { CONFIG } from "../config.js";

/* The Supabase SDK is imported on demand. Nothing loads it — and nothing hits
   the network — until the app actually tries to use cloud storage. */
let clientPromise = null;

export function isConfigured() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabasePublishableKey);
}

/**
 * True when this browser already holds a Supabase session. Checked before the
 * SDK is loaded so a workspace that has never signed in makes no network
 * request at all and starts instantly.
 */
export function hasStoredSession() {
  try {
    const store = globalThis.localStorage;
    if (!store) return false;
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function getSupabase() {
  if (!isConfigured()) throw new Error("Supabase is not configured.");
  clientPromise ||= import(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${CONFIG.supabaseJsVersion}/+esm`)
    .then(({ createClient }) => createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    }))
    .catch((error) => {
      clientPromise = null;
      throw error;
    });
  return clientPromise;
}

export async function getSession() {
  const client = await getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  const client = await getSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const client = await getSupabase();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: CONFIG.owner } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = await getSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
