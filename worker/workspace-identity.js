const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The Operations installation has one workspace, not application accounts.
 *
 * OPERATIONS_WORKSPACE_ID is the preferred non-secret binding. The legacy Whop
 * name remains as a deployment-safe fallback while existing environments move
 * to the clearer name.
 */
export function operationsWorkspaceId(env) {
  const value = String(env?.OPERATIONS_WORKSPACE_ID || env?.WHOP_OWNER_USER_ID || "").trim();
  return UUID.test(value) ? value : "";
}

export function operationsWorkspace(env) {
  const id = operationsWorkspaceId(env);
  return id ? { id, name: "Operations" } : null;
}
