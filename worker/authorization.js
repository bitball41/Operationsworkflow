import { workspaceAdmin } from "./workspace.js";

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

function ilikeLiteral(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

/**
 * Cloudflare Access proves the human identity. This second lookup maps that
 * verified email to an active employee record inside the one Operations
 * workspace; it does not create an application account or browser credential.
 */
export async function authorizeWorkspaceMember(claims, env) {
  const email = normalizedEmail(claims?.email);
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
