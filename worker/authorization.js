import { workspaceAdmin } from "./workspace.js";

const OWNER_ACCESS_EMAIL = "cj.nissim@icloud.com";

/**
 * The Zero Trust service token is named "Buisness Manager". Access service-token
 * JWTs have no email; `common_name` is either that token name or the Client ID
 * (`CF-Access-Client-Id`). Only these verified identities may act as the owner.
 * Optional `CF_ACCESS_OWNER_SERVICE_TOKEN` covers the documented Client ID form.
 */
const OWNER_SERVICE_TOKEN_IDENTITIES = new Set(["buisness manager"]);

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizedEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizedIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function ilikeLiteral(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function ownerEmailFromServiceToken(claims, env) {
  const commonName = normalizedIdentity(claims?.common_name);
  if (!commonName) return "";
  const allowed = new Set(OWNER_SERVICE_TOKEN_IDENTITIES);
  const configured = normalizedIdentity(env?.CF_ACCESS_OWNER_SERVICE_TOKEN);
  if (configured) allowed.add(configured);
  return allowed.has(commonName) ? OWNER_ACCESS_EMAIL : "";
}

/**
 * Cloudflare Access proves identity. This second lookup maps a verified email,
 * or one allowlisted Access service-token `common_name`, to an active employee
 * record inside the one Operations workspace. It does not create an
 * application account or browser credential.
 */
export async function authorizeWorkspaceMember(claims, env) {
  const email = normalizedEmail(claims?.email) || ownerEmailFromServiceToken(claims, env);
  if (!email) {
    return {
      ok: false,
      response: json({
        error: "team_member_email_required",
        message: "The verified Cloudflare Access identity does not include a usable email claim.",
      }, 403),
    };
  }

  /* Wrangler/local tests have no real Access identity or production employee
     row. This bypass works only after access.js has restricted the request to
     localhost and ALLOW_LOCAL_DEVELOPMENT=true. */
  if (email === "local@operations.invalid" && String(env?.ALLOW_LOCAL_DEVELOPMENT).toLowerCase() === "true") {
    return {
      ok: true,
      member: {
        id: "00000000-0000-4000-8000-000000000001",
        full_name: "Local Owner",
        access_email: email,
        role: "owner",
        status: "active",
        permissions: {},
      },
    };
  }

  const { client, id: workspaceId, error } = workspaceAdmin(env);
  if (error) return { ok: false, response: error };
  const { data, error: lookupError } = await client
    .from("team_members")
    .select("id,full_name,access_email,role,status,permissions")
    .eq("user_id", workspaceId)
    .ilike("access_email", ilikeLiteral(email))
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      response: json({ error: "team_member_lookup_failed", message: "The employee identity could not be verified." }, 503),
    };
  }
  if (!data) {
    return {
      ok: false,
      response: json({
        error: "team_member_unknown",
        message: "This Access identity is not assigned to the Operations workspace.",
      }, 403),
    };
  }
  if (data.status !== "active") {
    return {
      ok: false,
      response: json({
        error: "team_member_inactive",
        message: "This employee record is inactive. Ask the owner to restore access.",
      }, 403),
    };
  }

  return { ok: true, member: { ...data, access_email: email } };
}

export function memberIsOwner(member) {
  return member?.role === "owner";
}

export function ownerRequired() {
  return json({
    error: "owner_required",
    message: "Only the workspace owner can perform this action.",
  }, 403);
}
