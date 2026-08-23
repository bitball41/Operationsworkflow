/**
 * Static entry points for the public voice-agent and client-dashboard demos.
 *
 * This deliberately exposes only the three files required by the custom
 * interface. The rest of demos.conno.fun remains restricted to numbered,
 * R2-backed customer demos in demos.js.
 */
const PUBLIC_DEMO_ASSETS = Object.freeze({
  // Fetch the directory URL rather than index.html. Cloudflare Assets
  // canonicalizes index.html to /voice-demo/, so requesting the physical file
  // here would leak a redirect back through the public-host router.
  "/": { path: "/voice-demo/", type: "text/html; charset=utf-8", kind: "voice" },
  "/voice-demo/": { path: "/voice-demo/", type: "text/html; charset=utf-8", kind: "voice" },
  "/voice-demo/style.css": { path: "/voice-demo/style.css", type: "text/css; charset=utf-8", kind: "voice" },
  "/voice-demo/app.js": { path: "/voice-demo/app.js", type: "text/javascript; charset=utf-8", kind: "voice" },
  "/client-dashboard/": { path: "/client-demo/", type: "text/html; charset=utf-8", kind: "client" },
  "/client-dashboard/style.css": { path: "/client-demo/style.css", type: "text/css; charset=utf-8", kind: "client" },
  "/client-dashboard/app.js": { path: "/client-demo/app.js", type: "text/javascript; charset=utf-8", kind: "client" },
});

const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-cache",
  "cross-origin-opener-policy": "same-origin",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
});

const BASE_CSP = [
  "default-src 'none'",
  "script-src 'self' blob:",
  "style-src 'self' https://conno.fun https://fonts.googleapis.com",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];

function securityHeaders(kind) {
  const isVoice = kind === "voice";
  return {
    ...SECURITY_HEADERS,
    "content-security-policy": [
      ...BASE_CSP,
      `media-src 'self'${isVoice ? " blob:" : ""}`,
      isVoice
        ? "connect-src 'self' https://api.elevenlabs.io wss://api.elevenlabs.io https://livekit.rtc.elevenlabs.io wss://livekit.rtc.elevenlabs.io"
        : "connect-src 'none'",
      `worker-src 'self'${isVoice ? " blob:" : ""}`,
    ].join("; "),
    "permissions-policy": isVoice
      ? "camera=(), microphone=(self), geolocation=()"
      : "camera=(), microphone=(), geolocation=()",
  };
}

export async function serveVoiceAgentDemo(request, env) {
  if (!env?.ASSETS || !["GET", "HEAD"].includes(request.method)) return null;

  const url = new URL(request.url);
  if (url.pathname === "/client-dashboard") {
    url.pathname = "/client-dashboard/";
    return Response.redirect(url, 308);
  }

  const asset = PUBLIC_DEMO_ASSETS[url.pathname];
  if (!asset) return null;

  const assetUrl = new URL(asset.path, url.origin);
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (response.status === 404) {
    return new Response("Voice demo asset unavailable", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const headers = new Headers(response.headers);
  Object.entries(securityHeaders(asset.kind)).forEach(([name, value]) => headers.set(name, value));
  headers.set("content-type", asset.type);

  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    headers,
  });
}
