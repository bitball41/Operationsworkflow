import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksByDomain = new Map();

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function teamDomain(env) {
  const value = String(env?.CF_ACCESS_TEAM_DOMAIN || "").replace(/\/+$/, "");
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".cloudflareaccess.com")
      ? url.toString().replace(/\/+$/, "")
      : "";
  } catch {
    return "";
  }
}

function localDevelopmentAllowed(request, env) {
  if (String(env?.ALLOW_LOCAL_DEVELOPMENT || "").toLowerCase() !== "true") return false;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function remoteKeys(domain) {
  if (!jwksByDomain.has(domain)) {
    jwksByDomain.set(domain, createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`)));
  }
  return jwksByDomain.get(domain);
}

/**
 * Cloudflare Access is the only human authentication boundary.
 *
 * Merely checking for Cf-Access-Jwt-Assertion would allow header spoofing.
 * Verify its rotating RSA signature, issuer, audience and timestamps before any
 * dashboard asset or credential-backed API route is served.
 */
export async function verifyCloudflareAccess(request, env) {
  if (localDevelopmentAllowed(request, env)) {
    return { ok: true, claims: { sub: "local-development", email: "local@operations.invalid" } };
  }

  const issuer = teamDomain(env);
  const audience = String(env?.CF_ACCESS_AUD || "").trim();
  if (!issuer || !audience) {
    return {
      ok: false,
      response: json({
        error: "access_not_configured",
        message: "Cloudflare Access verification is not configured on this Worker.",
      }, 503),
    };
  }

  const token = request.headers.get("cf-access-jwt-assertion") || "";
  if (!token) {
    return {
      ok: false,
      response: json({
        error: "access_required",
        message: "A valid Cloudflare Access session is required.",
      }, 403),
    };
  }

  try {
    const { payload } = await jwtVerify(token, remoteKeys(issuer), {
      algorithms: ["RS256"],
      issuer,
      audience,
    });
    return { ok: true, claims: payload };
  } catch {
    return {
      ok: false,
      response: json({
        error: "access_denied",
        message: "The Cloudflare Access session is invalid or expired.",
      }, 403),
    };
  }
}

export function clearAccessKeyCacheForTests() {
  jwksByDomain.clear();
}
