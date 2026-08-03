import assert from "node:assert/strict";
import test from "node:test";

import { collectionWriteAllowed, handleWorkspaceRecords, handleWorkspaceSnapshot } from "../worker/workspace.js";

const WORKSPACE_ID = "2847b8e2-8a34-4a72-8e44-2cfc1be4255b";
const OWNER = { id: "10000000-0000-4000-8000-000000000001", role: "owner", status: "active" };
const SALESPERSON = { id: "10000000-0000-4000-8000-000000000002", role: "salesperson", status: "active" };

function env() {
  return {
    OPERATIONS_WORKSPACE_ID: WORKSPACE_ID,
    SUPABASE_SECRET_KEY: "sb_secret_test",
  };
}

function json(value, status = 200) {
  return Response.json(value, { status });
}

async function withFetch(handler, action) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await action();
  } finally {
    globalThis.fetch = original;
  }
}

test("the Worker can open the existing workspace before the account-removal migration", async () => {
  const seen = [];
  const response = await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    seen.push(`${init.method || "GET"} ${url.pathname}`);

    if (url.pathname.endsWith("/operations_workspaces")) {
      return json({ code: "PGRST205", message: "Could not find operations_workspaces in the schema cache" }, 404);
    }
    if (url.pathname.endsWith("/profiles") && (init.method || "GET") === "POST") {
      return new Response(null, { status: 201 });
    }
    if (url.pathname.endsWith("/rpc/operations_workspace_snapshot")) {
      return json({ code: "PGRST202", message: "Could not find operations_workspace_snapshot in the schema cache" }, 404);
    }
    if (url.pathname.endsWith("/profiles")) {
      return json({ id: WORKSPACE_ID, full_name: "Connor", preferences: {} });
    }
    return json([]);
  }, () => handleWorkspaceSnapshot(env(), OWNER));

  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.workspace.id, WORKSPACE_ID);
  assert.equal(snapshot.workspace.member.role, "owner");
  assert.equal(snapshot.profile.full_name, "Connor");
  assert.ok(Array.isArray(snapshot.leads));
  assert.ok(Array.isArray(snapshot.assistantConversations));
  assert.ok(seen.some((entry) => entry.endsWith("/rpc/operations_workspace_snapshot")));
});

test("record inserts always use the configured workspace id", async () => {
  let inserted = null;
  const response = await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/rest/v1/leads"));
    inserted = JSON.parse(init.body);
    return json([{ ...inserted[0], id: "11111111-1111-4111-8111-111111111111" }], 201);
  }, () => handleWorkspaceRecords(new Request("https://operations.conno.fun/api/workspace/records/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [{ business_name: "Northstar", user_id: "attacker-controlled" }] }),
  }), env(), "leads", "", OWNER));

  assert.equal(response.status, 201);
  assert.equal(inserted[0].user_id, WORKSPACE_ID);
});

test("the existing production service-role secret remains valid during rollout", async () => {
  const legacyEnv = {
    OPERATIONS_WORKSPACE_ID: WORKSPACE_ID,
    SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-test",
  };
  let apiKey = "";
  const response = await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/rest/v1/leads"));
    apiKey = new Headers(init.headers).get("apikey") || "";
    const [record] = JSON.parse(init.body);
    return json([{ ...record, id: "22222222-2222-4222-8222-222222222222" }], 201);
  }, () => handleWorkspaceRecords(new Request("https://operations.conno.fun/api/workspace/records/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [{ business_name: "Legacy Key Tree Care" }] }),
  }), legacyEnv, "leads", "", OWNER));

  assert.equal(response.status, 201);
  assert.equal(apiKey, legacyEnv.SUPABASE_SERVICE_ROLE_KEY);
});

test("owner-only collections reject salesperson writes before reaching Supabase", async () => {
  let called = false;
  const response = await withFetch(async () => {
    called = true;
    return json([]);
  }, () => handleWorkspaceRecords(new Request("https://operations.conno.fun/api/workspace/records/commissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [{ status: "paid" }] }),
  }), env(), "commissions", "", SALESPERSON));

  assert.equal(response.status, 403);
  assert.equal(called, false);
  assert.equal(collectionWriteAllowed(SALESPERSON, "integrations"), false);
  assert.equal(collectionWriteAllowed(SALESPERSON, "deployments"), false);
  assert.equal(collectionWriteAllowed(OWNER, "commissions"), true);
});

test("salesperson lead inserts are assigned to the verified employee", async () => {
  let inserted = null;
  const response = await withFetch(async (_input, init = {}) => {
    inserted = JSON.parse(init.body);
    return json([{ ...inserted[0], id: "33333333-3333-4333-8333-333333333333" }], 201);
  }, () => handleWorkspaceRecords(new Request("https://operations.conno.fun/api/workspace/records/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [{ business_name: "Assigned Lead", assigned_team_member_id: OWNER.id }] }),
  }), env(), "leads", "", SALESPERSON));

  assert.equal(response.status, 201);
  assert.equal(inserted[0].assigned_team_member_id, SALESPERSON.id);
});
