import assert from "node:assert/strict";
import test from "node:test";

import { buildBundleForTemplateRecord, composeDocument } from "../js/services/sites/bundle.js";
import { normalizeTemplateAssetPaths } from "../js/services/sites/templates.js";
import {
  extractEmailSourceCandidates,
  extractWebsiteCandidates,
  findPublicBusinessEmail,
  inspectBusinessWebsiteResults,
  isThirdPartyWebsiteHost,
  lookupBusinessPresence,
  safeResearchUrl,
  searchHtmlToMarkdown,
} from "../worker/browser.js";
import { handleDemoPublish, servePublicDemo } from "../worker/demos.js";
import worker from "../worker/index.js";
import { handleMcp } from "../worker/mcp.js";

test("an uploaded template keeps portable files and fills lead placeholders", () => {
  const template = {
    id: "template-1",
    name: "Custom",
    category: "Plumbing",
    source_kind: "custom",
    accent_color: "#123456",
    files: {
      "index.html": "<!doctype html><html><head></head><body><h1>{{business}}</h1><img src=\"assets/team.png\"></body></html>",
      "style.css": "h1{color:{{accent}}}",
      "script.js": "document.body.dataset.city='{{city}}'",
    },
  };
  const built = buildBundleForTemplateRecord({
    business_name: "Northstar Plumbing",
    category: "Plumbing",
    city: "Austin",
  }, template);

  assert.match(built.files["index.html"], /Northstar Plumbing/);
  assert.match(built.files["index.html"], /assets\/team\.png/);
  assert.match(built.files["style.css"], /#123456/);
  assert.match(built.files["script.js"], /Austin/);

  const preview = composeDocument(built.files);
  assert.match(preview, /<style>/);
  assert.match(preview, /<script>/);
});

test("uploaded asset names and matching portable paths are normalized together", () => {
  const normalized = normalizeTemplateAssetPaths({
    "index.html": '<img src="./assets/Hero Photo.png"><img src="assets/Team%20Photo.JPG">',
    "style.css": "body{background:url(assets/Hero Photo.png)}",
    "script.js": "",
  }, [
    { name: "Hero Photo.png" },
    { name: "Team Photo.JPG" },
  ]);

  assert.match(normalized["index.html"], /\.\/assets\/hero-photo\.png/);
  assert.match(normalized["index.html"], /assets\/team-photo\.jpg/);
  assert.match(normalized["style.css"], /assets\/hero-photo\.png/);
});

test("browser research refuses local and private network targets", () => {
  assert.equal(safeResearchUrl("http://localhost:8787"), null);
  assert.equal(safeResearchUrl("http://preview.localhost"), null);
  assert.equal(safeResearchUrl("http://192.168.1.10"), null);
  assert.equal(safeResearchUrl("http://100.64.0.1"), null);
  assert.equal(safeResearchUrl("http://[fc00::1]"), null);
  assert.equal(safeResearchUrl("file:///etc/passwd"), null);
  assert.equal(safeResearchUrl("https://example.com/path#fragment").toString(), "https://example.com/path");
});

test("public email extraction requires matching business evidence", () => {
  const markdown = [
    "[Northstar Plumbing directory profile](https://directory.example/northstar)",
    "Northstar Plumbing serves Austin, TX. Email northstarplumbing@gmail.com or call (512) 555-0138.",
    "Search help: support@bing.com",
  ].join("\n");

  const match = findPublicBusinessEmail(markdown, {
    business_name: "Northstar Plumbing",
    city: "Austin",
    region: "TX",
    phone: "(512) 555-0138",
  });
  assert.equal(match.email, "northstarplumbing@gmail.com");
  assert.equal(match.source_url, "https://directory.example/northstar");

  const unrelated = findPublicBusinessEmail("Someone else: randomperson@gmail.com", {
    business_name: "Northstar Plumbing",
    city: "Austin",
  });
  assert.equal(unrelated, null);
});

test("public search HTML keeps result links, snippets and email evidence", () => {
  const markdown = searchHtmlToMarkdown(`
    <ol>
      <li class="b_algo">
        <h2><a href="https://directory.example/northstar">Northstar Plumbing</a></h2>
        <p>Northstar Plumbing serves Austin. Email hello@northstar.example.</p>
      </li>
    </ol>
  `);
  assert.match(markdown, /\[Northstar Plumbing\]\(https:\/\/directory\.example\/northstar\)/);
  assert.match(markdown, /hello@northstar\.example/);
});

test("email-source candidates include identity-related directory profiles", () => {
  const candidates = extractEmailSourceCandidates([
    "[Northstar Plumbing on Yelp](https://www.yelp.com/biz/northstar-plumbing) Austin, TX",
    "[Unrelated electrician](https://directory.example/unrelated) Dallas, TX",
  ].join("\n"), {
    business_name: "Northstar Plumbing",
    city: "Austin",
    region: "TX",
  });
  assert.deepEqual(candidates.map((candidate) => candidate.host), ["yelp.com"]);
});

test("identity-confirmed pages never turn a platform support address into the business email", () => {
  const match = findPublicBusinessEmail(
    "Northstar Plumbing in Austin. Platform help: support@yelp.com.",
    { business_name: "Northstar Plumbing", city: "Austin" },
    { identityConfirmed: true, sourceUrl: "https://yelp.com/biz/northstar-plumbing" },
  );
  assert.equal(match, null);
});

test("website candidates ignore third-party profiles but keep hosted business sites", () => {
  for (const host of [
    "facebook.com",
    "www.yelp.com",
    "linktr.ee",
    "booksy.com",
    "doordash.com",
    "etsy.com",
    "sedoparking.com",
  ]) {
    assert.equal(isThirdPartyWebsiteHost(host), true, `${host} must stay a third-party presence`);
  }
  for (const host of ["northstarplumbing.com", "northstar.wixsite.com", "northstar.squarespace.com"]) {
    assert.equal(isThirdPartyWebsiteHost(host), false, `${host} can be an official hosted website`);
  }

  const markdown = [
    "[Northstar Plumbing on Facebook](https://facebook.com/northstarplumbing) Austin, TX",
    "[Northstar Plumbing reviews](https://yelp.com/biz/northstar-plumbing) Austin, TX",
    `[Northstar Plumbing](${
      `https://www.bing.com/ck/a?u=a1${btoa("https://northstar.wixsite.com/home")}`
    }) Austin, TX`,
  ].join("\n");
  const candidates = extractWebsiteCandidates(markdown, {
    business_name: "Northstar Plumbing",
    city: "Austin",
    region: "TX",
  });
  assert.deepEqual(candidates.map((candidate) => candidate.host), ["northstar.wixsite.com"]);
});

test("official website inspection requires phone or business plus locality evidence", async () => {
  const identity = {
    business_name: "Northstar Plumbing",
    city: "Austin",
    region: "TX",
    phone: "(512) 555-0138",
  };
  const phoneMatch = await inspectBusinessWebsiteResults(
    "[Northstar Plumbing](https://northstarplumbing.com)",
    identity,
    async () => ({
      title: "Northstar Plumbing",
      markdown: "Call our team at (512) 555-0138.",
    }),
    "https://www.bing.com/search?q=northstar",
  );
  assert.equal(phoneMatch.status, "found");
  assert.equal(phoneMatch.url, "https://northstarplumbing.com/");

  const hostedMatch = await inspectBusinessWebsiteResults(
    "[Northstar Plumbing](https://northstar.wixsite.com/home)",
    { ...identity, phone: "" },
    async () => ({
      title: "Northstar Plumbing",
      markdown: "Northstar Plumbing serves Austin and the surrounding area.",
    }),
  );
  assert.equal(hostedMatch.status, "found", "an identity-matched hosted site is still a website");

  const wrongCity = await inspectBusinessWebsiteResults(
    "[Northstar Plumbing](https://northstarplumbing.example)",
    { ...identity, phone: "" },
    async () => ({
      title: "Northstar Plumbing",
      markdown: "Serving Dallas, Texas.",
    }),
  );
  assert.equal(wrongCity.status, "not_found", "same-name businesses in another city must not be excluded");
});

test("conflicting or unavailable official website candidates stay uncertain", async () => {
  const identity = {
    business_name: "Northstar Plumbing",
    city: "Austin",
    phone: "(512) 555-0138",
  };
  const conflicting = await inspectBusinessWebsiteResults([
    "[Northstar Plumbing](https://northstarplumbing.com) Austin",
    "[Northstar Plumbing](https://northstarplumbing.net) Austin",
  ].join("\n"), identity, async () => ({
    title: "Northstar Plumbing",
    markdown: "Austin plumbers · (512) 555-0138",
  }));
  assert.equal(conflicting.status, "unknown");
  assert.match(conflicting.reason, /multiple/i);

  const unavailable = await inspectBusinessWebsiteResults(
    "[Northstar Plumbing](https://northstarplumbing.com) Austin",
    identity,
    async () => {
      throw new Error("Browser Run timed out");
    },
  );
  assert.equal(unavailable.status, "unknown");
  assert.match(unavailable.evidence, /timed out/i);
});

test("plausible website candidates are opened concurrently", async () => {
  const releases = [];
  const started = [];
  const inspection = inspectBusinessWebsiteResults([
    "[Northstar Plumbing One](https://northstar-one.example) Austin",
    "[Northstar Plumbing Two](https://northstar-two.example) Austin",
    "[Northstar Plumbing Three](https://northstar-three.example) Austin",
  ].join("\n"), {
    business_name: "Northstar Plumbing",
    city: "Austin",
  }, (url) => new Promise((resolve) => {
    started.push(url);
    releases.push(() => resolve({ title: "Other company", markdown: "Serving Dallas." }));
  }));

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started.length, 3, "one slow candidate must not block the next candidate");
  for (const release of releases) release();
  const result = await inspection;
  assert.equal(result.status, "not_found");
});

test("business presence uses one combined search on a rate-limited Browser Run binding", async () => {
  let searches = 0;
  const result = await lookupBusinessPresence({
    business_name: "Northstar Plumbing",
    city: "Austin",
  }, { BROWSER: {} }, {
    browse: async () => {
      searches += 1;
      return { title: "Search", markdown: "No matching results." };
    },
  });

  assert.equal(searches, 1);
  assert.equal(result.website.status, "not_found");
  assert.equal(result.email.address, "");
});

test("email research opens an identity-matched public profile when search snippets omit the address", async () => {
  let profileOpened = false;
  const result = await lookupBusinessPresence({
    business_name: "Northstar Plumbing",
    city: "Austin",
    region: "TX",
  }, { BROWSER: {} }, {
    browse: async (url) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === "www.bing.com") {
        const query = parsed.searchParams.get("q") || "";
        return {
          title: "Search",
          markdown: /\bemail\b/i.test(query)
            ? "[Northstar Plumbing directory profile](https://chamberofcommerce.com/business-directory/texas/austin/northstar) Austin, TX"
            : "[Northstar Plumbing on Yelp](https://yelp.com/biz/northstar-plumbing) Austin, TX",
        };
      }
      if (parsed.hostname === "chamberofcommerce.com") {
        profileOpened = true;
        return {
          title: "Northstar Plumbing",
          markdown: "Northstar Plumbing serves Austin, TX. Reach the team at estimates@northstar-mail.example.",
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  assert.equal(profileOpened, true);
  assert.equal(result.website.status, "not_found");
  assert.equal(result.email.address, "estimates@northstar-mail.example");
  assert.equal(
    result.email.source_url,
    "https://chamberofcommerce.com/business-directory/texas/austin/northstar",
  );
});

test("business presence catches an official site exposed by the email search", async () => {
  const identity = {
    business_name: "Northstar Plumbing",
    city: "Austin",
    region: "TX",
    phone: "(512) 555-0138",
  };
  const browse = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "www.bing.com") {
      const query = parsed.searchParams.get("q") || "";
      if (/\bemail\b/i.test(query)) {
        return {
          title: "Search",
          markdown: [
            "[Northstar Plumbing](https://northstarplumbing.com)",
            "Northstar Plumbing serves Austin. Email hello@northstarplumbing.com or call (512) 555-0138.",
          ].join("\n"),
        };
      }
      return {
        title: "Search",
        markdown: "[Northstar Plumbing on Facebook](https://facebook.com/northstarplumbing) Austin",
      };
    }
    if (parsed.hostname === "northstarplumbing.com") {
      return {
        title: "Northstar Plumbing",
        markdown: "Austin plumbing service · (512) 555-0138",
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await lookupBusinessPresence(identity, { BROWSER: {} }, { browse });
  assert.equal(result.website.status, "found");
  assert.equal(result.website.url, "https://northstarplumbing.com/");
  assert.equal(result.email.address, "hello@northstarplumbing.com");
});

test("business presence preserves an email when the website search is inconclusive", async () => {
  const browse = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "www.bing.com") {
      return {
        title: "Search",
        markdown: [
          "[Uncertain Electric](https://uncertainelectric.example) Austin",
          "Uncertain Electric serves Austin. Email hello@uncertainelectric.example.",
        ].join("\n"),
      };
    }
    if (parsed.hostname === "uncertainelectric.example") throw new Error("Website search timed out");
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await lookupBusinessPresence({
    business_name: "Uncertain Electric",
    city: "Austin",
  }, { BROWSER: {} }, { browse });
  assert.equal(result.website.status, "unknown");
  assert.equal(result.email.address, "hello@uncertainelectric.example");
});

test("the public demo hostname serves the voice demo root without exposing dashboard APIs", async () => {
  const assetRequests = [];
  const env = {
    DEMO_DOMAIN: "demos.conno.fun",
    DEMO_SITES: { get: async () => null },
    ASSETS: {
      fetch: async (request) => {
        const pathname = new URL(request.url).pathname;
        assetRequests.push(pathname);
        if (pathname === "/voice-demo/index.html") {
          return new Response(null, {
            status: 307,
            headers: { location: "/voice-demo/" },
          });
        }
        return new Response("<!doctype html><title>Michael</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      },
    },
  };

  const root = await worker.fetch(new Request("https://demos.conno.fun/"), env);
  assert.equal(root.status, 200);
  assert.equal(await root.text(), "<!doctype html><title>Michael</title>");
  assert.deepEqual(assetRequests, ["/voice-demo/"]);
  assert.match(root.headers.get("permissions-policy"), /microphone=\(self\)/);
  assert.match(root.headers.get("content-security-policy"), /api\.elevenlabs\.io/);

  const cleanPath = await worker.fetch(new Request("https://demos.conno.fun/voice-demo/"), env);
  assert.equal(cleanPath.status, 200);
  assert.equal(await cleanPath.text(), "<!doctype html><title>Michael</title>");

  const style = await worker.fetch(new Request("https://demos.conno.fun/voice-demo/style.css"), env);
  const script = await worker.fetch(new Request("https://demos.conno.fun/voice-demo/app.js"), env);
  assert.equal(style.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(script.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.deepEqual(assetRequests, [
    "/voice-demo/",
    "/voice-demo/",
    "/voice-demo/style.css",
    "/voice-demo/app.js",
  ]);

  for (const path of ["/api/status", "/mcp", "/anything-else", "/voice-demo/src/app.js"]) {
    const response = await worker.fetch(new Request(`https://demos.conno.fun${path}`), env);
    assert.equal(response.status, 404, `${path} must not fall through to the dashboard or an API`);
  }
});

class FakeR2 {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    let bytes;
    if (typeof value === "string") bytes = new TextEncoder().encode(value);
    else if (value instanceof ReadableStream) bytes = new Uint8Array(await new Response(value).arrayBuffer());
    else bytes = new Uint8Array(await new Response(value).arrayBuffer());
    this.objects.set(key, { bytes, options });
    return { key };
  }

  async get(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      body: new Blob([stored.bytes]).stream(),
      httpEtag: '"test-etag"',
      async json() {
        return JSON.parse(new TextDecoder().decode(stored.bytes));
      },
      writeHttpMetadata(headers) {
        if (stored.options.httpMetadata?.contentType) headers.set("content-type", stored.options.httpMetadata.contentType);
        if (stored.options.httpMetadata?.cacheControl) headers.set("cache-control", stored.options.httpMetadata.cacheControl);
      },
    };
  }
}

async function withFetch(handler, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

test("demo publishing swaps a complete R2 version onto its numbered public URL", async () => {
  const bucket = new FakeR2();
  const env = {
    DEMO_SITES: bucket,
    DEMO_DOMAIN: "demos.conno.fun",
    OPERATIONS_WORKSPACE_ID: "2847b8e2-8a34-4a72-8e44-2cfc1be4255b",
    SUPABASE_SECRET_KEY: "sb_secret_test",
  };
  const form = new FormData();
  form.set("demo_id", "11111111-1111-4111-8111-111111111111");
  form.set("public_number", "41");
  form.append("file:index.html", new Blob([
    '<!doctype html><link rel="stylesheet" href="style.css"><h1>Demo</h1>',
  ], { type: "text/html" }), "index.html");
  form.append("file:style.css", new Blob(["h1{color:red}"], { type: "text/css" }), "style.css");

  const response = await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("/rest/v1/demos")) {
      return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }, () => handleDemoPublish(new Request("https://operations.conno.fun/api/demos/publish", {
    method: "POST",
    body: form,
  }), env));

  assert.equal(response.status, 200);
  const published = await response.json();
  assert.equal(published.url, "https://demos.conno.fun/41");
  assert.ok(bucket.objects.has("sites/41/current.json"));

  const redirect = await servePublicDemo(new Request("https://demos.conno.fun/41"), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "https://demos.conno.fun/41/");

  const page = await servePublicDemo(new Request("https://demos.conno.fun/41/"), env);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Demo/);
  assert.match(page.headers.get("content-security-policy"), /default-src/);
});

test("the MCP endpoint authenticates, initializes, and lists its working tools", async () => {
  const env = { MCP_API_TOKEN: "test-token", DEMO_DOMAIN: "demos.conno.fun" };
  const unauthorized = await handleMcp(new Request("https://operations.conno.fun/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  }), env);
  assert.equal(unauthorized.status, 401);

  const request = (method, id) => new Request("https://operations.conno.fun/mcp", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method }),
  });
  const initialized = await handleMcp(request("initialize", 1), env);
  assert.equal((await initialized.json()).result.protocolVersion, "2025-11-25");

  const listed = await handleMcp(request("tools/list", 2), env);
  const tools = (await listed.json()).result.tools.map((tool) => tool.name);
  assert.deepEqual(tools, ["operations_api_status", "browser_research"]);
});
