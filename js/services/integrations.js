/**
 * One place that answers "is this service actually connected?".
 *
 * Every external capability (sending mail, publishing, research, model calls)
 * asks here first and refuses to fake a result when the answer is no.
 */
import { INTEGRATIONS } from "../config.js";
import { getState } from "../core/state.js";

/**
 * Providers whose credential lives in the Cloudflare Worker. The key on the
 * left is the integration id; the value is the name the Worker reports.
 */
const WORKER_BACKED = Object.freeze({
  outlook: "outlook",
  anthropic: "anthropic",
  openai: "openai",
  whop: "whop",
  cloudflare: "cloudflare",
  research: "research",
  mcp: "mcp",
});

function workerHasKey(provider) {
  return getState().services?.providers?.[provider] === true;
}

/** The Outlook detail block from /api/status: configured and connected. */
export function outlookState() {
  return getState().services?.outlook || { configured: false, connected: false, missing: [] };
}

/**
 * Why Outlook cannot send, in the order the operator has to fix it. Returns an
 * empty string when it can.
 */
export function outlookBlocker() {
  const outlook = outlookState();
  if (!getState().services?.reachable) return "The API worker is not answering, so Outlook cannot be reached.";
  if (!outlook.configured) {
    const missing = outlook.missing?.length ? ` Missing: ${outlook.missing.join(", ")}.` : "";
    return `Outlook is not configured on the Cloudflare Worker.${missing}`;
  }
  if (!outlook.connected) return "No Outlook mailbox is connected yet. Connect one from Integrations.";
  return "";
}

/** True once the mailbox grant covers reading the inbox, not just sending. */
export function canReadOutlookMail() {
  return outlookState().can_read_mail === true;
}

export class NotConnectedError extends Error {
  constructor(provider, message) {
    super(message || `${providerName(provider)} is not connected yet.`);
    this.name = "NotConnectedError";
    this.provider = provider;
    this.blocked = true;
  }
}

export function providerName(provider) {
  return INTEGRATIONS.find((item) => item.provider === provider)?.name || provider;
}

export function integrationList() {
  const stored = new Map(getState().data.integrations.map((item) => [item.provider, item]));
  return INTEGRATIONS.map((definition) => {
    const record = stored.get(definition.provider);
    let status = record?.status || definition.status;
    if (definition.provider === "supabase") status = getState().storage === "cloud" ? "connected" : "not_connected";
    if (definition.provider === "openscout") status = "connected";
    /* A key held by the Worker is the only thing that makes these real. It
       overrides any stored record, in both directions — a key that was removed
       from the Worker must not leave a stale "connected" row behind. */
    const workerName = WORKER_BACKED[definition.provider];
    if (workerName) status = workerHasKey(workerName) ? "connected" : "not_connected";
    return { ...definition, ...record, name: definition.name, detail: definition.detail, status };
  });
}

export function integrationStatus(provider) {
  return integrationList().find((item) => item.provider === provider)?.status || "not_connected";
}

export function isConnected(provider) {
  return integrationStatus(provider) === "connected";
}

export function requireIntegration(provider) {
  if (!isConnected(provider)) throw new NotConnectedError(provider);
}

/** Providers that must be connected before automation can send real email. */
export function missingForFullAutomation() {
  return ["outlook", "cloudflare"].filter((provider) => !isConnected(provider));
}
