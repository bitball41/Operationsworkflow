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


const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi;
const BLOCKED_EMAIL_DOMAINS = new Set([
  "example.com",
  "google.com",
  "bing.com",
  "microsoft.com",
  "cloudflare.com",
  "sentry.io",
  "wixpress.com",
]);
const CONTACT_LOCAL_PARTS = new Set(["contact", "hello", "info", "office", "sales", "service", "support"]);

function identityTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !["company", "service", "services", "business", "local"].includes(token));
}

function nearbyPublicUrl(markdown, index) {
  const before = String(markdown || "").slice(Math.max(0, index - 600), index + 120);
  const urls = [...before.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
  const candidate = urls.at(-1);
  const safe = candidate ? safeResearchUrl(candidate) : null;
  return safe ? safe.toString() : "";
}

/**
 * Finds a public business email in Browser Run markdown without guessing one.
 * A candidate must appear beside the business name, city, phone, or a matching
 * business domain; unrelated addresses in search chrome are ignored.
 */
export function findPublicBusinessEmail(markdown, identity = {}) {
  const text = String(markdown || "");
  const businessTokens = identityTokens(identity.business_name || identity.business);
  const city = String(identity.city || "").trim().toLowerCase();
  const phoneDigits = String(identity.phone || "").replace(/\D/g, "").slice(-7);
  const seen = new Set();
  const candidates = [];

  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const email = match[0].toLowerCase().replace(/[.,;:!?]+$/, "");
    if (seen.has(email)) continue;
    seen.add(email);

    const [localPart, domain] = email.split("@");
    const tld = domain.split(".").at(-1);
    if (
      !localPart
      || !domain
      || BLOCKED_EMAIL_DOMAINS.has(domain)
      || ["png", "jpg", "jpeg", "gif", "webp", "svg", "css", "js"].includes(tld)
      || /^(no-?reply|donotreply|mailer-daemon)$/.test(localPart)
      || /^(test|example|yourname|name)$/.test(localPart)
    ) continue;

    const context = text.slice(Math.max(0, match.index - 350), match.index + email.length + 350);
    const contextLower = context.toLowerCase();
    const compactContext = context.replace(/\D/g, "");
    const matchedTokens = businessTokens.filter((token) => contextLower.includes(token));
    let score = matchedTokens.length * 3;

    if (city && contextLower.includes(city)) score += 2;
    if (phoneDigits && compactContext.includes(phoneDigits)) score += 4;
    if (CONTACT_LOCAL_PARTS.has(localPart)) score += 1;
    if (businessTokens.some((token) => domain.includes(token))) score += 3;

    if (score < 3) continue;
    candidates.push({
      email,
      score,
      source_url: nearbyPublicUrl(text, match.index),
      evidence: context.replace(/\s+/g, " ").trim().slice(0, 280),
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
  return candidates[0] || null;
}

function businessEmailSearchUrl(identity = {}) {
  const business = String(identity.business_name || identity.business || "").trim();
  const location = [identity.city, identity.region].map((value) => String(value || "").trim()).filter(Boolean).join(", ");
  const phone = String(identity.phone || "").trim();
  const terms = [
    business ? '"' + business + '"' : "",
    location ? '"' + location + '"' : "",
    phone ? '"' + phone + '"' : "",
    "email",
  ].filter(Boolean).join(" ");
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", terms);
  return url;
}

export async function lookupBusinessEmail(identity, env) {
  const business = String(identity?.business_name || identity?.business || "").trim();
  if (!business) throw new Error("A business name is required for email lookup.");

  const searchUrl = businessEmailSearchUrl(identity);
  const page = await browseToMarkdown(searchUrl, env);
  const match = findPublicBusinessEmail(page.markdown, identity);
  return {
    email: match?.email || "",
    source_url: match?.source_url || (match ? searchUrl.toString() : ""),
    evidence: match?.evidence || "",
    score: match?.score || 0,
    searched_url: searchUrl.toString(),
  };
}

export async function handleBusinessEmailLookup(request, env, payload) {
  if (!env?.BROWSER) {
    return json({
      error: "not_connected",
      provider: "research",
      message: "BROWSER is not bound. Add the Cloudflare Browser Run binding and deploy again.",
    }, 503);
  }
  if (!(await authenticatedSupabaseUser(request))) {
    return json({ error: "unauthorized", message: "Sign in to Supabase before looking up business emails." }, 401);
  }
  try {
    return json(await lookupBusinessEmail(payload || {}, env));
  } catch (error) {
    return json({ error: "email_lookup_failed", message: error.message }, 422);
  }
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
