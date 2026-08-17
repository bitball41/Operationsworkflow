import assert from "node:assert/strict";
import test from "node:test";
import { handleElevenLabs } from "../worker/elevenlabs.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const member = { id: "10000000-0000-4000-8000-000000000002", role: "owner" };

test("the Worker injects server identity and never accepts a browser credential", async () => {
  const originalFetch = globalThis.fetch;
  let upstream;
  globalThis.fetch = async (url, init) => {
    upstream = { url: String(url), init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ agent: { id: "local" } }), { status: 201, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await handleElevenLabs(new Request("https://operations.conno.fun/api/elevenlabs/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Roofing Receptionist",
        workspace_id: "attacker-workspace",
        member_id: "attacker-member",
        api_key: "browser-secret-must-not-pass",
      }),
    }), {
      OPERATIONS_EDGE_SHARED_SECRET: "server-edge-bridge-key",
      OPERATIONS_WORKSPACE_ID: workspaceId,
      SUPABASE_URL: "https://example.supabase.co",
    }, "/agents", member);

    assert.equal(response.status, 201);
    assert.equal(upstream.init.headers.apikey, "server-edge-bridge-key");
    assert.equal(upstream.body.workspace_id, workspaceId);
    assert.equal(upstream.body.member_id, member.id);
    assert.equal(upstream.body.api_key, undefined, "unknown or credential-shaped fields are discarded");
    assert.doesNotMatch(JSON.stringify(upstream.init.headers), /browser-secret/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ElevenLabs actions fail closed when the server bridge is not configured", async () => {
  const response = await handleElevenLabs(new Request("https://operations.conno.fun/api/elevenlabs/voices"), {}, "/voices", member);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "not_connected");
});

test("the Worker exposes only the named ElevenLabs management routes", async () => {
  const response = await handleElevenLabs(new Request("https://operations.conno.fun/api/elevenlabs/secrets"), {
    OPERATIONS_EDGE_SHARED_SECRET: "server-edge-bridge-key",
    OPERATIONS_WORKSPACE_ID: workspaceId,
  }, "/secrets", member);
  assert.equal(response.status, 404);
});
