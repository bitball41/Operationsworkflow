/**
 * Cloudflare Worker: the one place API keys live.
 *
 * Every key is a Worker secret (`wrangler secret put NAME`). The browser never
 * receives one — it calls `/api/...` on the same origin and this Worker adds the
 * credential on the way out. The only exception is the Google Maps *browser*
 * key, which is public by design because the Maps JavaScript SDK loads in the
 * page; see `/api/maps/key` below.
 *
 * Secrets read here:
 *   ANTHROPIC_API_KEY     - Anthropic Messages API
 *   OPENAI_API_KEY        - OpenAI Responses API
 *   WHOP_WEBHOOK_SECRET   - verifies signed Whop webhook deliveries
 *   SUPABASE_SECRET_KEY   - server-only workspace and webhook database access
 *   OPERATIONS_WORKSPACE_ID - the single Operations workspace
 *   GOOGLE_MAPS_API_KEY   - Google Maps / Places (browser key, referrer-locked)
 *   MICROSOFT_CLIENT_ID   - Microsoft Entra application id
 *   MICROSOFT_CLIENT_SECRET - Microsoft Entra confidential-client secret
 *   MICROSOFT_TENANT      - OAuth tenant selector (`common` by default)
 *   OUTLOOK_TOKEN_ENCRYPTION_KEY - encrypts OAuth tokens before KV storage
 *
 * Bindings:
 *   OUTLOOK_TOKENS        - workspace OAuth state and encrypted tokens
 *
 * Nothing here fakes a result. A missing secret returns 503 with the exact name
 * to set, which is what the rest of the application already knows how to show.
 */

import { ANTHROPIC, OPENAI, PLACES } from "./upstreams.js";
import { verifyCloudflareAccess } from "./access.js";
import { getModel, resolveModel } from "../js/data/models.js";
import {
  handleBrowserResearch,
  handleBusinessEmailLookup,
  handleBusinessPresenceLookup,
} from "./browser.js";
import { demoHostingStatus, handleDemoPublish, servePublicDemo } from "./demos.js";
import { handleMcp } from "./mcp.js";
import { handleWhopWebhook, whopWebhookConfigured } from "./whop.js";
import {
  handleWorkspaceAssetDelete,
  handleWorkspaceAssetDownload,
  handleWorkspaceAssetUpload,
  handleWorkspaceProfile,
  handleWorkspaceRecords,
  handleWorkspaceSignedUrls,
  handleWorkspaceSnapshot,
} from "./workspace.js";
import {
  handleOutlookCallback,
  handleOutlookConnect,
  handleOutlookDisconnect,
  handleOutlookMessages,
  handleOutlookReply,
  handleOutlookSend,
  outlookConnectionStatus,
} from "./outlook.js";

/** Secret name per provider, and whether the browser may read its value. */
const PROVIDERS = Object.freeze({
  anthropic: { secret: "ANTHROPIC_API_KEY", exposed: false },
  openai: { secret: "OPENAI_API_KEY", exposed: false },
  whop: { secret: "WHOP_WEBHOOK_SECRET", exposed: false },
  google_maps: { secret: "GOOGLE_MAPS_API_KEY", exposed: true },
});

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function notConnected(provider) {
  const secret = PROVIDERS[provider]?.secret || provider;
  return json({
    error: "not_connected",
    provider,
    secret,
    message: `${secret} is not set on this Worker. Run: wrangler secret put ${secret}`,
  }, 503);
}

function secretFor(env, provider) {
  const value = env?.[PROVIDERS[provider].secret];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * Same-origin guard. A browser always sends Origin on cross-origin requests and
 * on every POST, so an Origin from somewhere else means another site is trying
 * to spend these keys. Requests with no Origin (curl, same-origin GET) pass.
 */
function sameOrigin(request, url) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

/**
 * The public demo hostname is intentionally a different security boundary from
 * the private operations dashboard. It must never fall through to dashboard
 * assets or any credential-backed API route when Cloudflare Access is not in
 * front of that hostname.
 */
function isPublicDemoHost(url, env) {
  const demoDomain = String(env?.DEMO_DOMAIN || "demos.conno.fun")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return url.host.toLowerCase() === demoDomain;
}

function isWhopWebhookHost(url, env) {
  const webhookDomain = String(env?.WHOP_WEBHOOK_DOMAIN || "hooks.conno.fun")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return url.host.toLowerCase() === webhookDomain;
}

async function readJson(request, limitBytes = 2_000_000) {
  const raw = await request.text();
  if (raw.length > limitBytes) throw new Error("Request body is too large.");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body is not valid JSON.");
  }
}

/** Passes an upstream response through, minus anything that could leak credentials. */
async function relay(response) {
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/* ---------- routes ---------- */

/**
 * What the browser is allowed to know: which providers are usable, never the
 * keys.
 *
 * Outlook reports twice on purpose. `providers.outlook` answers "can Operations
 * send mail right now", which is what every send path checks. The `outlook`
 * object answers "why not" — missing Worker configuration or simply no mailbox
 * connected yet.
 */
async function handleStatus(request, env) {
  const providers = {};
  for (const name of Object.keys(PROVIDERS)) providers[name] = Boolean(secretFor(env, name));
  providers.whop = whopWebhookConfigured(env);
  const outlook = await outlookConnectionStatus(request, env);
  providers.outlook = outlook.connected;
  const hosting = demoHostingStatus(env);
  providers.cloudflare = hosting.configured;
  providers.research = Boolean(env?.BROWSER);
  providers.mcp = Boolean(env?.MCP_API_TOKEN);
  return json({ providers, outlook, hosting, at: new Date().toISOString() });
}

/**
 * The Google Maps browser key.
 *
 * A Maps JavaScript API key cannot be hidden — the SDK runs in the page, so the
 * key is visible in network traffic no matter where it is stored. Serving it
 * from here keeps it out of git and out of every user's localStorage, but it
 * MUST also be restricted by HTTP referrer in the Google Cloud console.
 */
function handleMapsKey(env) {
  const key = secretFor(env, "google_maps");
  if (!key) return notConnected("google_maps");
  return json({ key, note: "Browser key. Restrict it by HTTP referrer in Google Cloud." });
}

/** Places API (New) text search, with the key applied server-side. */
async function handlePlacesSearch(request, env) {
  const key = secretFor(env, "google_maps");
  if (!key) return notConnected("google_maps");

  const payload = await readJson(request);
  if (!payload.textQuery) return json({ error: "invalid_request", message: "textQuery is required." }, 400);

  const response = await fetch(PLACES.searchText, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": String(payload.fieldMask || PLACES.defaultFieldMask),
    },
    body: JSON.stringify({
      textQuery: payload.textQuery,
      maxResultCount: Math.min(Number(payload.maxResultCount) || 20, 20),
      ...(payload.locationBias ? { locationBias: payload.locationBias } : {}),
      ...(payload.languageCode ? { languageCode: payload.languageCode } : {}),
      ...(payload.regionCode ? { regionCode: payload.regionCode } : {}),
    }),
  });
  return relay(response);
}

/**
 * Anthropic Messages API.
 *
 * The caller picks the model and the effort, but only from the shared catalogue
 * — an unknown model id is rejected here rather than forwarded, so a typo can
 * never quietly bill against something expensive. Adaptive thinking is on by
 * default on the current models, so no thinking configuration is sent;
 * `budget_tokens` and the sampling parameters are rejected by this family.
 */
async function handleAnthropic(request, env) {
  const key = secretFor(env, "anthropic");
  if (!key) return notConnected("anthropic");

  const payload = await readJson(request);
  if (!Array.isArray(payload.messages) || !payload.messages.length) {
    return json({ error: "invalid_request", message: "messages must be a non-empty array." }, 400);
  }

  const model = payload.model ? getModel(payload.model) : resolveModel(ANTHROPIC.defaultModel, "anthropic");
  if (!model || model.provider !== "anthropic") {
    return json({ error: "unknown_model", message: `"${payload.model}" is not an Anthropic model in this project's catalogue.` }, 400);
  }

  const response = await fetch(ANTHROPIC.messages, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC.version,
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: Math.min(Number(payload.max_tokens) || 8000, 16000),
      messages: payload.messages,
      ...(payload.system ? { system: payload.system } : {}),
      ...(Array.isArray(payload.tools) && payload.tools.length ? { tools: payload.tools } : {}),
      ...(payload.tool_choice ? { tool_choice: payload.tool_choice } : {}),
      /* Only the current models take an effort level; sending one to a model
         that has no effort control is a 400 from the provider. */
      ...(model.supportsEffort ? { output_config: { effort: effortOrDefault(payload.effort) } } : {}),
    }),
  });
  return relay(response);
}

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

function effortOrDefault(value) {
  return EFFORTS.has(value) ? value : ANTHROPIC.defaultEffort;
}

/** OpenAI Responses API, used only when Anthropic is not the selected provider. */
async function handleOpenAI(request, env) {
  const key = secretFor(env, "openai");
  if (!key) return notConnected("openai");

  const payload = await readJson(request);
  if (!payload.input && !payload.messages) {
    return json({ error: "invalid_request", message: "input or messages is required." }, 400);
  }

  const model = payload.model ? getModel(payload.model) : resolveModel(OPENAI.defaultModel, "openai");
  if (!model || model.provider !== "openai") {
    return json({ error: "unknown_model", message: `"${payload.model}" is not an OpenAI model in this project's catalogue.` }, 400);
  }

  const response = await fetch(OPENAI.responses, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model.id,
      input: payload.input || payload.messages,
      ...(payload.instructions ? { instructions: payload.instructions } : {}),
      ...(Array.isArray(payload.tools) && payload.tools.length ? { tools: payload.tools } : {}),
      max_output_tokens: Math.min(Number(payload.max_output_tokens) || 8000, 16000),
    }),
  });
  return relay(response);
}

/* ---------- router ---------- */

async function handleApi(request, env, url) {
  if (!sameOrigin(request, url)) {
    return json({ error: "forbidden", message: "Cross-origin requests are not accepted." }, 403);
  }

  const path = url.pathname;
  const isPost = request.method === "POST";

  try {
    if (path === "/api/workspace" && request.method === "GET") {
      return await handleWorkspaceSnapshot(env);
    }
    if (path === "/api/workspace/profile" && request.method === "PATCH") {
      return await handleWorkspaceProfile(request, env);
    }
    if (path === "/api/workspace/assets" && isPost) {
      return await handleWorkspaceAssetUpload(request, env);
    }
    if (path === "/api/workspace/assets" && request.method === "DELETE") {
      return await handleWorkspaceAssetDelete(request, env);
    }
    if (path === "/api/workspace/assets/signed-urls" && isPost) {
      return await handleWorkspaceSignedUrls(request, env);
    }
    if (path === "/api/workspace/assets/download" && request.method === "GET") {
      return await handleWorkspaceAssetDownload(url, env);
    }
    const recordRoute = path.match(/^\/api\/workspace\/records\/([A-Za-z]+)(?:\/([0-9a-f-]{36}))?$/i);
    if (recordRoute) {
      return await handleWorkspaceRecords(request, env, recordRoute[1], recordRoute[2] || "");
    }
    if (path === "/api/status" && request.method === "GET") return await handleStatus(request, env);
    if (path === "/api/outlook/connect" && isPost) return await handleOutlookConnect(request, env);
    if (path === "/api/outlook/callback" && request.method === "GET") return await handleOutlookCallback(request, env);
    if (path === "/api/outlook/disconnect" && isPost) return await handleOutlookDisconnect(request, env);
    if (path === "/api/outlook/send" && isPost) {
      return await handleOutlookSend(request, env, await readJson(request, 120_000));
    }
    if (path === "/api/outlook/reply" && isPost) {
      return await handleOutlookReply(request, env, await readJson(request, 120_000));
    }
    if (path === "/api/outlook/messages" && request.method === "GET") {
      return await handleOutlookMessages(request, env, url);
    }
    if (path === "/api/maps/key" && request.method === "GET") return handleMapsKey(env);
    if (path === "/api/maps/places/search-text" && isPost) return await handlePlacesSearch(request, env);
    if (path === "/api/browser/research" && isPost) {
      return await handleBrowserResearch(request, env, await readJson(request, 40_000));
    }
    if (path === "/api/browser/contact-email" && isPost) {
      return await handleBusinessEmailLookup(request, env, await readJson(request, 40_000));
    }
    if (path === "/api/browser/business-presence" && isPost) {
      return await handleBusinessPresenceLookup(request, env, await readJson(request, 40_000));
    }
    if (path === "/api/demos/publish" && isPost) return await handleDemoPublish(request, env);
    if (path === "/api/ai/anthropic/messages" && isPost) return await handleAnthropic(request, env);
    if (path === "/api/ai/openai/responses" && isPost) return await handleOpenAI(request, env);
    if (path === "/api/whop" || path.startsWith("/api/whop/")) {
      return json({ error: "gone", message: "Whop payments are webhook-only and cannot be manually synced." }, 410);
    }
    return json({ error: "not_found", message: `No API route for ${request.method} ${path}.` }, 404);
  } catch (error) {
    return json({ error: "request_failed", message: error?.message || "The request could not be completed." }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (isWhopWebhookHost(url, env)) {
      if (url.pathname !== "/whop") {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      return handleWhopWebhook(request, env);
    }

    /* Demos are public. Restrict this hostname to numbered R2-backed sites so
       a public Access exemption can never expose the dashboard or its APIs. */
    if (isPublicDemoHost(url, env)) {
      const demo = await servePublicDemo(request, env);
      return demo || new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const access = await verifyCloudflareAccess(request, env);
    if (!access.ok) return access.response;

    if (url.pathname === "/mcp") return handleMcp(request, env);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    const demo = await servePublicDemo(request, env);
    if (demo) return demo;

    /* Everything else is the static dashboard. Asset routing runs before this
       Worker, so a request only lands here when no file matched. */
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;

    /* Only a browser navigating to a page gets the app shell, and it gets it in
       place so the URL survives. A fetch for a path that is not a real file —
       a probe for worker source, a migration, a dotfile — gets a plain 404
       rather than an HTML page pretending the path exists. */
    const wantsPage = request.method === "GET" && (request.headers.get("accept") || "").includes("text/html");
    if (!wantsPage) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });

    const shell = await env.ASSETS.fetch(new Request(new URL("/", url), request));
    return new Response(shell.body, { status: shell.ok ? 200 : shell.status, headers: shell.headers });
  },
};
