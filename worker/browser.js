/**
 * Narrow browser capability for business research.
 *
 * Cloudflare Browser Run executes the page; this endpoint returns readable
 * markdown, not a general-purpose remote-control session. Cloudflare Access is
 * verified by worker/index.js before this handler runs, and private/local
 * network targets are rejected here.
 */

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

  let response;
  let responseDetail = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await env.BROWSER.quickAction("markdown", {
      url: target.toString(),
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 15_000 },
      rejectResourceTypes: ["media", "font"],
    });
    if (response.status !== 429 || attempt === 1) break;
    responseDetail = await response.clone().text().catch(() => "");
    if (/browser time limit exceeded/i.test(responseDetail)) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1_000
      : 10_000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  if (!response.ok) {
    const detail = responseDetail || await response.clone().text().catch(() => "");
    throw new Error(`Browser Run returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}.`);
  }
  const markdown = await response.text();
  return {
    url: target.toString(),
    title: response.headers.get("x-browser-title") || "",
    markdown: markdown.slice(0, MAX_MARKDOWN),
    truncated: markdown.length > MAX_MARKDOWN,
  };
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return String(value || "").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const radix = code[1].toLowerCase() === "x" ? 16 : 10;
    const digits = radix === 16 ? code.slice(2) : code.slice(1);
    const point = Number.parseInt(digits, radix);
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
  });
}

function plainHtmlText(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<(?:script|style|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|svg)>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

/**
 * Bing's normal result HTML is enough for links, snippets and public email
 * evidence. Fetching it directly avoids spending a Browser Run Quick Action on
 * every candidate; the browser remains reserved for promising result pages.
 */
export function searchHtmlToMarkdown(html, baseUrl = "https://www.bing.com/") {
  let text = String(html || "")
    .replace(/<(?:script|style|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|svg)>/gi, " ")
    .replace(/<(?:br|\/p|\/li|\/h[1-6]|\/div)>/gi, "\n");

  text = text.replace(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (whole, quote, href, label) => {
    let target;
    try {
      target = new URL(decodeHtml(href), baseUrl);
    } catch {
      return plainHtmlText(label);
    }
    if (!["http:", "https:"].includes(target.protocol)) return plainHtmlText(label);
    const title = plainHtmlText(label);
    return title ? `[${title}](${target.toString()})` : "";
  });

  return decodeHtml(text.replace(/<[^>]+>/g, " "))
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_MARKDOWN);
}

async function fetchSearchToMarkdown(url) {
  const target = safeResearchUrl(url);
  if (!target || !hostMatches(target.hostname, new Set(["bing.com"]))) {
    throw new Error("Only the configured public search endpoint can be fetched directly.");
  }
  const response = await fetch(target, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (compatible; OperationsWorkflow/3.0; +https://operations.conno.fun)",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Public search returned ${response.status}.`);
  const html = await response.text();
  return {
    url: response.url || target.toString(),
    title: "Public web search",
    markdown: searchHtmlToMarkdown(html, response.url || target.toString()),
    truncated: html.length > MAX_MARKDOWN,
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
const MAX_WEBSITE_CANDIDATES = 3;
const MAX_EMAIL_SOURCE_CANDIDATES = 3;
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;

/*
 * Hosts that represent somebody else's platform rather than a business-owned
 * website. Hosted site builders are intentionally absent: an identity-matched
 * Wix, Squarespace, WordPress, Weebly, Carrd, Webflow, or similar page is still
 * an existing website and must disqualify the lead.
 */
const THIRD_PARTY_WEBSITE_HOSTS = new Set([
  // Search, maps and search chrome.
  "bing.com", "microsoft.com", "google.com", "googleusercontent.com",
  "g.page", "goo.gl", "maps.app.goo.gl", "mapquest.com",
  // Social and publishing profiles.
  "facebook.com", "fb.com", "fb.me", "instagram.com", "tiktok.com",
  "twitter.com", "x.com", "youtube.com", "youtu.be", "pinterest.com",
  "linkedin.com", "nextdoor.com", "reddit.com", "tumblr.com", "medium.com",
  "substack.com", "patreon.com", "twitch.tv", "threads.net", "t.me",
  "telegram.me", "wa.me", "whatsapp.com",
  // Link-in-bio pages.
  "linktr.ee", "linktree.com", "beacons.ai", "linkin.bio", "lnk.bio",
  "bio.link", "bio.site", "taplink.cc", "msha.ke", "milkshake.app",
  "campsite.bio", "solo.to", "about.me", "hoo.be", "flow.page",
  "stan.store", "carrd.link",
  // Directories and review profiles.
  "yelp.com", "tripadvisor.com", "foursquare.com", "yellowpages.com",
  "yp.com", "manta.com", "bbb.org", "angi.com", "angieslist.com",
  "thumbtack.com", "homeadvisor.com", "houzz.com", "porch.com",
  "buildzoom.com", "citysearch.com", "superpages.com", "dexknows.com",
  "hotfrog.com", "chamberofcommerce.com", "merchantcircle.com",
  "cylex.us.com", "opendi.us", "ezlocal.com", "expertise.com",
  "trustpilot.com", "healthgrades.com", "zocdoc.com", "avvo.com",
  "justia.com", "findlaw.com", "lawyers.com", "zillow.com", "realtor.com",
  "trulia.com", "redfin.com", "weddingwire.com", "theknot.com",
  "bark.com", "gigsalad.com", "yell.com", "checkatrade.com",
  "pagesjaunes.fr", "gelbeseiten.de", "paginegialle.it", "justdial.com",
  // Booking, ordering and marketplace storefronts.
  "vagaro.com", "booksy.com", "styleseat.com", "schedulicity.com",
  "mindbodyonline.com", "mindbody.io", "fresha.com", "squareup.com",
  "setmore.com", "acuityscheduling.com", "simplybook.me", "getsquire.com",
  "glossgenius.com", "calendly.com", "opentable.com", "resy.com",
  "doordash.com", "ubereats.com", "grubhub.com", "postmates.com",
  "seamless.com", "chownow.com", "toasttab.com", "order.online",
  "clover.com", "slicelife.com", "justeat.com", "deliveroo.com",
  "wolt.com", "foodpanda.com", "zomato.com", "etsy.com", "ebay.com",
  "amazon.com", "walmart.com", "aliexpress.com", "alibaba.com",
  "mercari.com", "depop.com", "poshmark.com", "indiamart.com",
  // Parked domains and registrar landers.
  "godaddy.com", "secureserver.net", "sedoparking.com", "sedo.com",
  "parkingcrew.net", "bodis.com", "afternic.com", "dan.com",
  "hugedomains.com", "domainmarket.com", "uniregistry.com", "namebright.com",
  "parklogic.com", "cashparking.com", "networksolutions.com", "register.com",
]);

function identityTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !["company", "service", "services", "business", "local"].includes(token));
}

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phoneTail(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-7) : "";
}

function hostMatches(hostname, hostSet) {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  for (const candidate of hostSet) {
    if (host === candidate || host.endsWith(`.${candidate}`)) return true;
  }
  return false;
}

export function isThirdPartyWebsiteHost(hostname) {
  return hostMatches(hostname, THIRD_PARTY_WEBSITE_HOSTS);
}

function decodeBingTarget(value) {
  const encoded = String(value || "");
  if (!encoded) return "";
  let direct;
  try {
    direct = decodeURIComponent(encoded);
  } catch {
    return "";
  }
  if (!direct.startsWith("a1")) return direct;
  try {
    const base64 = direct.slice(2).replace(/-/g, "+").replace(/_/g, "/");
    return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  } catch {
    return "";
  }
}

function unwrapSearchResultUrl(value) {
  const clean = String(value || "").replaceAll("&amp;", "&");
  const safe = safeResearchUrl(clean);
  if (!safe) return null;
  const host = safe.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "bing.com" && safe.pathname.startsWith("/ck/")) {
    const target = decodeBingTarget(
      safe.searchParams.get("u")
      || safe.searchParams.get("url")
      || safe.searchParams.get("r"),
    );
    return target ? safeResearchUrl(target) : null;
  }

  if (host === "google.com" && safe.pathname === "/url") {
    const target = safe.searchParams.get("q") || safe.searchParams.get("url");
    return target ? safeResearchUrl(target) : null;
  }

  return safe;
}

function businessNameMatches(text, identity) {
  const normalized = normalizedText(text);
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const normalizedBusiness = normalizedText(identity.business_name || identity.business);
  const compactBusiness = normalizedBusiness.replace(/[^a-z0-9]/g, "");
  if (compactBusiness.length >= 4 && compact.includes(compactBusiness)) return true;

  const tokens = identityTokens(identity.business_name || identity.business);
  if (!tokens.length) return false;
  const matched = tokens.filter((token) => normalized.includes(token)).length;
  return matched >= Math.min(2, tokens.length) && matched / tokens.length >= 0.5;
}

function localityMatches(text, identity) {
  const normalized = normalizedText(text);
  const city = normalizedText(identity.city);
  if (city && city.length >= 3 && normalized.includes(city)) return true;

  const street = normalizedText(String(identity.address || "").split(",")[0]);
  const streetNumber = street.match(/\b\d{1,8}\b/)?.[0] || "";
  const streetTokens = identityTokens(street);
  return Boolean(
    streetNumber
    && normalized.includes(streetNumber)
    && streetTokens.some((token) => normalized.includes(token)),
  );
}

function identityMatch(text, identity) {
  const compact = String(text || "").replace(/\D/g, "");
  const phone = phoneTail(identity.phone);
  const phoneMatched = Boolean(phone && compact.includes(phone));
  const nameMatched = businessNameMatches(text, identity);
  const locationMatched = localityMatches(text, identity);

  if (phoneMatched) {
    return { matched: true, evidence: `Phone ending ${phone.slice(-4)} matched the business.` };
  }
  if (nameMatched && locationMatched) {
    return { matched: true, evidence: "Business name and location matched the page." };
  }
  return { matched: false, evidence: "" };
}

function domainMentionsBusiness(hostname, identity) {
  const compactHost = String(hostname || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return identityTokens(identity.business_name || identity.business)
    .some((token) => compactHost.includes(token.replace(/[^a-z0-9]/g, "")));
}

/**
 * Extracts likely first-party search results. This is only a shortlist: every
 * candidate must still be opened and identity-matched before it can exclude a
 * lead.
 */
export function extractWebsiteCandidates(markdown, identity = {}) {
  const text = String(markdown || "");
  const candidates = new Map();

  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    const target = unwrapSearchResultUrl(match[2]);
    if (!target || isThirdPartyWebsiteHost(target.hostname)) continue;

    const context = text.slice(Math.max(0, match.index - 260), match.index + match[0].length + 420);
    const combined = `${match[1]} ${context} ${target.hostname}`;
    const evidence = identityMatch(combined, identity);
    const nameMatched = businessNameMatches(combined, identity);
    const domainMatched = domainMentionsBusiness(target.hostname, identity);
    if (!evidence.matched && !nameMatched && !domainMatched) continue;

    const host = target.hostname.toLowerCase().replace(/^www\./, "");
    const score = evidence.matched ? 100 : nameMatched && domainMatched ? 70 : nameMatched ? 55 : 40;
    const existing = candidates.get(host);
    if (!existing || score > existing.score) {
      candidates.set(host, {
        url: target.toString(),
        host,
        text: String(match[1] || "").trim(),
        context: context.replace(/\s+/g, " ").trim().slice(0, 500),
        score,
      });
    }
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score || a.host.localeCompare(b.host));
}

function websiteVerdict(status, {
  url = "",
  evidence = "",
  reason = "",
  searchedUrl = "",
} = {}) {
  return {
    status,
    url,
    evidence,
    reason,
    searched_url: searchedUrl,
  };
}

/**
 * Opens likely first-party results and requires matching business identity on
 * the actual page. A failed candidate or conflicting confirmed domains remains
 * unknown so balanced discovery can show it instead of silently guessing.
 */
export async function inspectBusinessWebsiteResults(
  markdown,
  identity,
  browsePage,
  searchedUrl = "",
) {
  const candidates = extractWebsiteCandidates(markdown, identity);
  if (!candidates.length) {
    return websiteVerdict("not_found", {
      reason: "No credible first-party website appeared in public search results.",
      searchedUrl,
    });
  }

  const confirmations = [];
  const failures = [];
  const inspected = candidates.slice(0, MAX_WEBSITE_CANDIDATES);
  const outcomes = await Promise.all(inspected.map(async (candidate) => {
    try {
      const page = await browsePage(candidate.url);
      const match = identityMatch(`${page.title || ""}\n${page.markdown || ""}`, identity);
      return match.matched
        ? { kind: "confirmed", candidate: { ...candidate, evidence: match.evidence } }
        : { kind: "unmatched", candidate };
    } catch (error) {
      return {
        kind: "failed",
        candidate: {
          ...candidate,
          error: error?.message || "The candidate page could not be opened.",
        },
      };
    }
  }));
  for (const outcome of outcomes) {
    if (outcome.kind === "confirmed") confirmations.push(outcome.candidate);
    if (outcome.kind === "failed") failures.push(outcome.candidate);
  }

  const confirmedHosts = new Set(confirmations.map((candidate) => candidate.host));
  if (confirmedHosts.size > 1) {
    return websiteVerdict("unknown", {
      reason: "Multiple different websites matched the business identity.",
      evidence: confirmations.map((candidate) => candidate.url).join(" · "),
      searchedUrl,
    });
  }
  if (confirmations.length === 1 && !failures.length) {
    const match = confirmations[0];
    return websiteVerdict("found", {
      url: match.url,
      evidence: match.evidence,
      reason: "A first-party website matched the business identity.",
      searchedUrl,
    });
  }
  if (confirmations.length && failures.length) {
    return websiteVerdict("unknown", {
      url: confirmations[0].url,
      evidence: confirmations[0].evidence,
      reason: "One website matched, but another plausible candidate could not be verified.",
      searchedUrl,
    });
  }
  if (failures.length) {
    return websiteVerdict("unknown", {
      url: failures[0].url,
      reason: "A plausible first-party website could not be opened for identity verification.",
      evidence: failures[0].error,
      searchedUrl,
    });
  }
  if (candidates.length > inspected.length) {
    return websiteVerdict("unknown", {
      reason: "Too many plausible first-party results appeared to verify confidently.",
      searchedUrl,
    });
  }
  return websiteVerdict("not_found", {
    reason: "Search results were checked, but no first-party page matched the business identity.",
    searchedUrl,
  });
}

function nearbyPublicUrl(markdown, index) {
  const before = String(markdown || "").slice(Math.max(0, index - 600), index + 120);
  const urls = [...before.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
  const candidate = urls.at(-1);
  const safe = candidate ? unwrapSearchResultUrl(candidate) : null;
  return safe ? safe.toString() : "";
}

/**
 * Finds identity-related result pages that may publish a business email.
 * Directory and social profiles are intentionally eligible here: they are not
 * an official website, but the page can still be useful public contact
 * evidence after the page itself matches the business.
 */
export function extractEmailSourceCandidates(markdown, identity = {}) {
  const text = String(markdown || "");
  const candidates = new Map();
  const searchHosts = new Set(["bing.com", "microsoft.com", "google.com", "googleusercontent.com"]);

  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    const target = unwrapSearchResultUrl(match[2]);
    if (!target || hostMatches(target.hostname, searchHosts)) continue;

    const lineStart = text.lastIndexOf("\n", match.index) + 1;
    const nextBreak = text.indexOf("\n", match.index + match[0].length);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    const context = text.slice(lineStart, lineEnd);
    const combined = `${match[1]} ${context} ${target.hostname}`;
    const evidence = identityMatch(combined, identity);
    const nameMatched = businessNameMatches(combined, identity);
    if (!evidence.matched && !nameMatched) continue;

    const key = `${target.hostname.toLowerCase()}${target.pathname.replace(/\/+$/, "")}`;
    const score = evidence.matched ? 100 : domainMentionsBusiness(target.hostname, identity) ? 70 : 55;
    const existing = candidates.get(key);
    if (!existing || score > existing.score) {
      candidates.set(key, {
        url: target.toString(),
        host: target.hostname.toLowerCase().replace(/^www\./, ""),
        score,
      });
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, MAX_EMAIL_SOURCE_CANDIDATES);
}

/**
 * Finds a public business email in Browser Run markdown without guessing one.
 * A candidate must appear beside the business name, city, phone, or a matching
 * business domain; unrelated addresses in search chrome are ignored.
 */
export function findPublicBusinessEmail(markdown, identity = {}, {
  identityConfirmed = false,
  sourceUrl = "",
} = {}) {
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
      || isThirdPartyWebsiteHost(domain)
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
    if (identityConfirmed) score += 3;

    if (score < 3) continue;
    candidates.push({
      email,
      score,
      source_url: sourceUrl || nearbyPublicUrl(text, match.index),
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
    !location && phone ? '"' + phone + '"' : "",
    '("email" OR "contact")',
  ].filter(Boolean).join(" ");
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", terms);
  return url;
}

function emptyEmailResult(error = "") {
  return {
    address: "",
    source_url: "",
    evidence: "",
    score: 0,
    searched_url: "",
    error,
  };
}

async function searchBusinessEmail(identity, browsePage, searchPage = browsePage) {
  const searchUrl = businessEmailSearchUrl(identity);
  const page = await searchPage(searchUrl);
  const directMatch = findPublicBusinessEmail(page.markdown, identity);
  const pageMatches = [];

  if (!directMatch) {
    const sources = extractEmailSourceCandidates(page.markdown, identity);
    const inspected = await Promise.all(sources.map(async (source) => {
      try {
        const sourcePage = await browsePage(source.url);
        const evidence = identityMatch(`${sourcePage.title || ""}\n${sourcePage.markdown || ""}`, identity);
        if (!evidence.matched) return null;
        return findPublicBusinessEmail(sourcePage.markdown, identity, {
          identityConfirmed: true,
          sourceUrl: source.url,
        });
      } catch {
        return null;
      }
    }));
    pageMatches.push(...inspected.filter(Boolean));
  }

  const match = directMatch || pageMatches.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))[0] || null;
  return {
    page,
    result: {
      email: match?.email || "",
      source_url: match?.source_url || (match ? searchUrl.toString() : ""),
      evidence: match?.evidence || "",
      score: match?.score || 0,
      searched_url: searchUrl.toString(),
    },
  };
}

function createSerialBrowser(browse, env) {
  const pageCache = new Map();
  let tail = Promise.resolve();
  return (url) => {
    const key = String(url);
    if (!pageCache.has(key)) {
      const page = tail.catch(() => {}).then(() => browse(key, env));
      tail = page.catch(() => {});
      pageCache.set(key, page);
    }
    return pageCache.get(key);
  };
}

function createSearchBrowser(browsePage) {
  return async (url) => {
    try {
      return await fetchSearchToMarkdown(url);
    } catch (fetchError) {
      try {
        return await browsePage(url);
      } catch (browserError) {
        throw new Error(
          `Public search failed (${fetchError?.message || "fetch unavailable"}); browser fallback failed (${browserError?.message || "browser unavailable"}).`,
        );
      }
    }
  };
}

export async function lookupBusinessEmail(identity, env) {
  const business = String(identity?.business_name || identity?.business || "").trim();
  if (!business) throw new Error("A business name is required for email lookup.");

  const browsePage = createSerialBrowser(browseToMarkdown, env);
  const { result } = await searchBusinessEmail(identity, browsePage, createSearchBrowser(browsePage));
  return result;
}

/**
 * Runs one combined public-presence search, extracts evidence-matched email,
 * and inspects any first-party website exposed by the same results. One search
 * per business matters on Workers Free, where Quick Actions are limited to one
 * request every ten seconds.
 */
export async function lookupBusinessPresence(identity, env, {
  browse = browseToMarkdown,
  search = null,
} = {}) {
  const business = String(identity?.business_name || identity?.business || "").trim();
  if (!business) throw new Error("A business name is required for web-presence lookup.");

  /*
   * The current Browser Run binding rejects overlapping Quick Actions with
   * 429s. Keep the higher-level research independent, but queue the underlying
   * page loads and cache duplicates so evidence is not lost to rate limits.
  */
  const browsePage = createSerialBrowser(browse, env);
  const searchPage = search || (browse === browseToMarkdown ? createSearchBrowser(browsePage) : browsePage);

  let website = websiteVerdict("unknown", {
    reason: "The public presence search could not be completed.",
  });
  let email = emptyEmailResult();
  let emailPage = null;
  try {
    const emailSearch = await searchBusinessEmail(identity, browsePage, searchPage);
    emailPage = emailSearch.page;
    email = {
      address: emailSearch.result.email,
      source_url: emailSearch.result.source_url,
      evidence: emailSearch.result.evidence,
      score: emailSearch.result.score,
      searched_url: emailSearch.result.searched_url,
      error: "",
    };
  } catch (error) {
    email = emptyEmailResult(error?.message || "Email search unavailable.");
    website = websiteVerdict("unknown", {
      reason: "The public presence search could not be completed.",
      evidence: error?.message || "Search unavailable.",
    });
  }

  if (emailPage) {
    const emailSearchUrl = email.searched_url;
    try {
      const emailWebsite = await inspectBusinessWebsiteResults(
        emailPage.markdown,
        identity,
        browsePage,
        emailSearchUrl,
      );
      website = emailWebsite;
    } catch (error) {
      website = websiteVerdict("unknown", {
        reason: "A website exposed by the email search could not be verified.",
        evidence: error?.message || "Verification unavailable.",
        searchedUrl: emailSearchUrl,
      });
    }
  }

  return {
    website: { ...website, checked_at: new Date().toISOString() },
    email,
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
  try {
    return json(await lookupBusinessEmail(payload || {}, env));
  } catch (error) {
    return json({ error: "email_lookup_failed", message: error.message }, 422);
  }
}

export async function handleBusinessPresenceLookup(request, env, payload) {
  if (!env?.BROWSER) {
    return json({
      error: "not_connected",
      provider: "research",
      message: "BROWSER is not bound. Add the Cloudflare Browser Run binding and deploy again.",
    }, 503);
  }
  try {
    return json(await lookupBusinessPresence(payload || {}, env));
  } catch (error) {
    return json({ error: "business_presence_failed", message: error.message }, 422);
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
  try {
    return json(await browseToMarkdown(payload?.url, env));
  } catch (error) {
    return json({ error: "browser_failed", message: error.message }, 422);
  }
}
