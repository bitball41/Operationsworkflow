/**
 * Static entry point for the public ElevenLabs voice-agent demo.
 *
 * This deliberately exposes only the three files required by the custom
 * interface. The rest of demos.conno.fun remains restricted to numbered,
 * R2-backed customer demos in demos.js.
 */
const VOICE_DEMO_ASSETS = Object.freeze({
  "/": { path: "/voice-demo/index.html", type: "text/html; charset=utf-8" },
  "/voice-demo/style.css": { path: "/voice-demo/style.css", type: "text/css; charset=utf-8" },
  "/voice-demo/app.js": { path: "/voice-demo/app.js", type: "text/javascript; charset=utf-8" },
});

const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-cache",
  "content-security-policy": [
    "default-src 'none'",
    "script-src 'self' blob:",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "connect-src 'self' https://api.elevenlabs.io wss://api.elevenlabs.io https://livekit.rtc.elevenlabs.io wss://livekit.rtc.elevenlabs.io",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(self), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
});

export async function serveVoiceAgentDemo(request, env) {
  if (!env?.ASSETS || !["GET", "HEAD"].includes(request.method)) return null;

  const url = new URL(request.url);
  const asset = VOICE_DEMO_ASSETS[url.pathname];
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
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => headers.set(name, value));
  headers.set("content-type", asset.type);

  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    headers,
  });
}
