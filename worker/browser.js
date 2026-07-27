/**
 * Narrow browser capability for business research.
 *
 * Cloudflare Browser Run executes the page; this endpoint returns readable
 * markdown, not a general-purpose remote-control session. The caller must be a
 * verified Supabase user and private/local network targets are rejected.
 */
import { authenticatedSupabaseUser } from "./outlook.js";

const MAX_MARKDOWN = 60_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function safeResearchUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname === "::"
    || hostname === "::1"
    || hostname.startsWith("::ffff:")
    || /^(fc|fd)/.test(hostname)
    || /^fe[89ab]/.test(hostname)
    || /^0\./.test(hostname)
    || /^127\./.test(hostname)
    || /^10\./.test(hostname)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^169\.254\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || /^198\.(18|19)\./.test(hostname)
    || /^(22[4-9]|23\d|24\d|25[0-5])\./.test(hostname)
  ) return null;
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

export async function browseToMarkdown(url, env) {
  if (!env?.BROWSER) throw new Error("BROWSER is not bound to Cloudflare Browser Run.");
  const target = safeResearchUrl(url);
  if (!target) throw new Error("Only public HTTP and HTTPS pages can be researched.");

  const response = await env.BROWSER.quickAction("markdown", {
    url: target.toString(),
    gotoOptions: { waitUntil: "networkidle2", timeout: 20_000 },
    rejectResourceTypes: ["media", "font"],
  });
  if (!response.ok) throw new Error(`Browser Run returned ${response.status}.`);
  const markdown = await response.text();
  return {
    url: target.toString(),
    title: response.headers.get("x-browser-title") || "",
    markdown: markdown.slice(0, MAX_MARKDOWN),
    truncated: markdown.length > MAX_MARKDOWN,
  };
}

export async function handleBrowserResearch(request, env, payload) {
  if (!env?.BROWSER) {
    return json({
      error: "not_connected",
      provider: "research",
      message: "BROWSER is not bound. Add the Cloudflare Browser Run binding and deploy again.",
    }, 503);
  }
  if (!(await authenticatedSupabaseUser(request))) {
    return json({ error: "unauthorized", message: "Sign in to Supabase before using browser research." }, 401);
  }
  try {
    return json(await browseToMarkdown(payload?.url, env));
  } catch (error) {
    return json({ error: "browser_failed", message: error.message }, 422);
  }
}
