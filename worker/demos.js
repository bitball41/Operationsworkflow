/**
 * R2-backed public demo hosting.
 *
 * Publishing is authenticated with the user's Supabase access token. Files are
 * written under an immutable version prefix, then one small `current.json`
 * pointer is swapped last. Public reads therefore see either the old complete
 * version or the new complete version, never a half-uploaded bundle.
 */
import { authenticatedSupabaseUser } from "./outlook.js";
import { SUPABASE } from "./upstreams.js";

const MAX_BUNDLE_BYTES = 45 * 1024 * 1024;
const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "default-src 'self' https: data:; script-src 'self' https:; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https: data:; connect-src 'self' https:; frame-ancestors *",
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function bearerToken(request) {
  return (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

function safePath(value) {
  const path = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) return "";
  if (["index.html", "style.css", "script.js"].includes(path)) return path;
  if (/^assets\/[a-z0-9][a-z0-9._-]*$/i.test(path)) return path;
  return "";
}

function contentType(path, fallback = "") {
  if (fallback) return fallback;
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".avif")) return "image/avif";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function userOwnsDemo(request, demoId, publicNumber) {
  const user = await authenticatedSupabaseUser(request);
  const token = bearerToken(request);
  if (!user || !token) return false;

  const url = new URL(`${SUPABASE.rest}/demos`);
  url.searchParams.set("id", `eq.${demoId}`);
  url.searchParams.set("public_number", `eq.${publicNumber}`);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE.publishableKey,
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1;
}

export function demoHostingStatus(env) {
  return {
    configured: Boolean(env?.DEMO_SITES),
    domain: String(env?.DEMO_DOMAIN || "demos.conno.fun"),
    missing: env?.DEMO_SITES ? [] : ["DEMO_SITES"],
  };
}

export async function handleDemoPublish(request, env) {
  if (!env?.DEMO_SITES) {
    return json({
      error: "not_connected",
      provider: "cloudflare",
      message: "DEMO_SITES is not bound. Create the R2 bucket and deploy the Worker again.",
    }, 503);
  }

  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data")) {
    return json({ error: "invalid_request", message: "Demo publishing requires multipart/form-data." }, 400);
  }

  const form = await request.formData();
  const demoId = String(form.get("demo_id") || "");
  const publicNumber = String(form.get("public_number") || "");
  if (!/^[0-9a-f-]{36}$/i.test(demoId) || !/^[1-9]\d*$/.test(publicNumber)) {
    return json({ error: "invalid_request", message: "A valid demo id and public number are required." }, 400);
  }
  if (!(await userOwnsDemo(request, demoId, publicNumber))) {
    return json({ error: "forbidden", message: "That demo does not belong to the signed-in workspace." }, 403);
  }

  const files = [];
  let bytes = 0;
  for (const [field, value] of form.entries()) {
    if (!field.startsWith("file:")) continue;
    const path = safePath(field.slice(5));
    if (!path || typeof value?.arrayBuffer !== "function") {
      return json({ error: "invalid_file", message: `Invalid bundle path: ${field.slice(5)}` }, 400);
    }
    bytes += Number(value.size || 0);
    if (bytes > MAX_BUNDLE_BYTES) {
      return json({ error: "bundle_too_large", message: "A demo bundle cannot exceed 45 MB." }, 413);
    }
    files.push({ path, value });
  }
  if (!files.some((file) => file.path === "index.html")) {
    return json({ error: "invalid_bundle", message: "index.html is required." }, 400);
  }

  const version = crypto.randomUUID();
  const prefix = `sites/${publicNumber}/versions/${version}`;
  await Promise.all(files.map(({ path, value }) => env.DEMO_SITES.put(`${prefix}/${path}`, value.stream(), {
    httpMetadata: {
      contentType: contentType(path, value.type),
      cacheControl: path === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
    },
    customMetadata: { demoId, publicNumber, version },
  })));

  await env.DEMO_SITES.put(`sites/${publicNumber}/current.json`, JSON.stringify({
    demo_id: demoId,
    public_number: Number(publicNumber),
    version,
    files: files.map((file) => file.path),
    published_at: new Date().toISOString(),
  }), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });

  const domain = String(env.DEMO_DOMAIN || "demos.conno.fun").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return json({
    hosted: true,
    provider: "cloudflare-r2",
    public_number: Number(publicNumber),
    version,
    bytes,
    url: `https://${domain}/${publicNumber}`,
    published_at: new Date().toISOString(),
  });
}

function publicDemoRequest(url, env) {
  const demoDomain = String(env?.DEMO_DOMAIN || "demos.conno.fun").toLowerCase();
  const hostMatches = url.host.toLowerCase() === demoDomain;
  const match = hostMatches
    ? url.pathname.match(/^\/(\d+)(?:\/(.*))?$/)
    : url.pathname.match(/^\/p\/(\d+)(?:\/(.*))?$/);
  if (!match) return null;
  return {
    publicNumber: match[1],
    path: safePath(match[2] || "index.html"),
  };
}

export async function servePublicDemo(request, env) {
  if (!env?.DEMO_SITES || request.method !== "GET") return null;
  const url = new URL(request.url);
  const demoDomain = String(env?.DEMO_DOMAIN || "demos.conno.fun").toLowerCase();
  if (
    (url.host.toLowerCase() === demoDomain && /^\/\d+$/.test(url.pathname))
    || (/^\/p\/\d+$/.test(url.pathname))
  ) {
    url.pathname += "/";
    return Response.redirect(url.toString(), 308);
  }
  const target = publicDemoRequest(url, env);
  if (!target) return null;
  if (!target.path) return new Response("Not found", { status: 404 });

  const pointer = await env.DEMO_SITES.get(`sites/${target.publicNumber}/current.json`);
  if (!pointer) return new Response("Demo not found", { status: 404, headers: { "content-type": "text/plain" } });
  const manifest = await pointer.json().catch(() => null);
  if (!manifest?.version || !manifest.files?.includes(target.path)) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }

  const object = await env.DEMO_SITES.get(`sites/${target.publicNumber}/versions/${manifest.version}/${target.path}`);
  if (!object?.body) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => headers.set(name, value));
  if (target.path === "index.html") headers.set("cache-control", "no-cache");
  return new Response(object.body, { headers });
}
