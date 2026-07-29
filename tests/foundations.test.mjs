import assert from "node:assert/strict";
import test from "node:test";

import { buildBundleForTemplateRecord, composeDocument } from "../js/services/sites/bundle.js";
import { normalizeTemplateAssetPaths } from "../js/services/sites/templates.js";
import { findPublicBusinessEmail, safeResearchUrl } from "../worker/browser.js";
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

test("the public demo hostname cannot reach the dashboard or Worker APIs", async () => {
  const env = {
    DEMO_DOMAIN: "demos.conno.fun",
    DEMO_SITES: { get: async () => null },
    ASSETS: { fetch: async () => new Response("dashboard", { status: 200 }) },
  };

  for (const path of ["/", "/api/status", "/mcp", "/anything-else"]) {
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
