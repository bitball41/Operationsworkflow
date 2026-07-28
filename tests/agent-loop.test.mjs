/**
 * The assistant loop, end to end against a scripted provider.
 *
 * The bug this guards against was silent: tools ran, their results were thrown
 * away before the request was built, and the model was never given a chance to
 * answer. Nothing errored — the assistant simply stopped talking.
 */
import assert from "node:assert/strict";
import test from "node:test";

globalThis.localStorage = {
  values: new Map(),
  getItem(key) {
    return this.values.get(key) ?? null;
  },
  setItem(key, value) {
    this.values.set(key, String(value));
  },
  removeItem(key) {
    this.values.delete(key);
  },
};
globalThis.window = {};
globalThis.__OPERATIONS_TEST_MEMORY__ = true;

const { getState, setData, setState } = await import("../js/core/state.js");
const { runAgentLoop } = await import("../js/services/ai/agent.js");
const { aiPermissionMode, permissionAllows, runTool, toolSchema } = await import("../js/services/ai/tools.js");

setData({
  profile: {
    id: "owner-1",
    preferences: { ai_permission_mode: "work", ai_permission_mode_version: 2 },
  },
  leads: [{
    id: "lead-1",
    business_name: "Ironwood Electric",
    category: "Electrician",
    city: "Mansfield",
    status: "qualified",
    lead_score: 91,
    has_website: false,
    email: "",
    last_contacted_at: null,
  }],
}, { silent: true });

setState({
  storage: "local",
  services: {
    reachable: true,
    providers: { anthropic: true, outlook: false, openai: false, whop: false, google_maps: false },
    outlook: { configured: false, connected: false, signed_in: false, missing: [] },
  },
}, { silent: true });

/** Replays scripted Anthropic responses and records what was sent each time. */
function scriptedProvider(replies) {
  const sent = [];
  const original = globalThis.fetch;
  let turn = 0;

  globalThis.fetch = async (path, init = {}) => {
    if (!String(path).includes("/api/ai/anthropic/messages")) throw new Error(`Unexpected fetch: ${path}`);
    sent.push(JSON.parse(init.body));
    const reply = replies[Math.min(turn, replies.length - 1)];
    turn += 1;
    return new Response(JSON.stringify({
      content: reply,
      stop_reason: reply.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn",
      usage: { input_tokens: 100, output_tokens: 20 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  return { sent, restore: () => { globalThis.fetch = original; } };
}

test("legacy Work access is upgraded to full workspace control", () => {
  setData({
    profile: {
      ...getState().data.profile,
      preferences: { ai_permission_mode: "work" },
    },
  }, { silent: true });

  assert.equal(aiPermissionMode(), "full");
  const names = toolSchema(aiPermissionMode()).map((tool) => tool.name);
  for (const name of ["discover_leads", "create_task", "record_payment", "send_email", "publish_demo", "start_automation"]) {
    assert.ok(names.includes(name), `Full access is missing ${name}`);
  }

  setData({
    profile: {
      ...getState().data.profile,
      preferences: { ai_permission_mode: "work", ai_permission_mode_version: 2 },
    },
  }, { silent: true });
});

test("permission modes expose only the tools the AI is allowed to use", () => {
  const viewNames = toolSchema("view").map((tool) => tool.name);
  const workNames = toolSchema("work").map((tool) => tool.name);
  const fullNames = toolSchema("full").map((tool) => tool.name);

  assert.ok(viewNames.includes("get_next_lead"));
  assert.ok(!viewNames.includes("create_task"));
  assert.ok(!viewNames.includes("send_email"));

  assert.ok(workNames.includes("get_next_lead"));
  assert.ok(workNames.includes("create_task"));
  assert.ok(!workNames.includes("send_email"));
  assert.ok(!workNames.includes("publish_demo"));
  assert.ok(!workNames.includes("start_automation"));

  assert.ok(fullNames.includes("send_email"));
  assert.ok(fullNames.includes("publish_demo"));
  assert.ok(fullNames.includes("start_automation"));
  assert.equal(permissionAllows("send_email", "full"), true);
  assert.equal(permissionAllows("send_email", "work"), false);
});

test("permission enforcement blocks a tool even if a provider asks for it", async () => {
  const result = await runTool("create_task", { title: "Should not exist" }, { permissionMode: "view" });
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.permission, true);
  assert.equal(result.permission_mode, "view");
  assert.match(result.error, /blocked by View only/i);
});

test("a tool call is executed and its result is sent back to the model", async () => {
  const provider = scriptedProvider([
    [{ type: "tool_use", id: "call_1", name: "get_next_lead", input: {} }],
    [{ type: "text", text: "Ironwood Electric is next — score 91, no website." }],
  ]);

  try {
    const { entries, steps, stopped } = await runAgentLoop({
      transcript: [{ id: "u1", role: "user", text: "who should I contact next?" }],
    });

    assert.equal(stopped, "answered");
    assert.equal(steps, 2, "one turn to call the tool, one to answer");

    const tool = entries.find((entry) => entry.role === "tool");
    assert.equal(tool.tool, "get_next_lead");
    assert.equal(tool.result.ok, true);
    assert.match(tool.result.summary, /Ironwood Electric/);

    const exposedTools = provider.sent[0].tools.map((tool) => tool.name);
    assert.ok(exposedTools.includes("get_next_lead"));
    assert.ok(exposedTools.includes("create_task"));
    assert.ok(!exposedTools.includes("send_email"), "Work access must not advertise external tools");

    /* The whole point: the second request carries the result of the first. */
    const secondRequest = provider.sent[1];
    const resultBlock = secondRequest.messages
      .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
      .find((block) => block.type === "tool_result");

    assert.ok(resultBlock, "the follow-up request contained no tool_result");
    assert.equal(resultBlock.tool_use_id, "call_1", "matched to the call that produced it");
    assert.match(resultBlock.content, /Ironwood Electric/);

    assert.equal(entries.at(-1).role, "assistant");
    assert.match(entries.at(-1).text, /Ironwood Electric is next/);
  } finally {
    provider.restore();
  }
});

test("every tool_use is answered before the next request is built", async () => {
  const provider = scriptedProvider([
    [
      { type: "text", text: "Checking both." },
      { type: "tool_use", id: "call_a", name: "get_status", input: {} },
      { type: "tool_use", id: "call_b", name: "get_revenue", input: {} },
    ],
    [{ type: "text", text: "Nothing urgent, and no revenue recorded yet." }],
  ]);

  try {
    await runAgentLoop({ transcript: [{ id: "u1", role: "user", text: "status and revenue?" }] });

    const second = provider.sent[1];
    const calls = second.messages
      .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
      .filter((block) => block.type === "tool_use")
      .map((block) => block.id);
    const results = second.messages
      .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
      .filter((block) => block.type === "tool_result")
      .map((block) => block.tool_use_id);

    assert.deepEqual(calls.sort(), ["call_a", "call_b"]);
    assert.deepEqual(results.sort(), ["call_a", "call_b"], "an unanswered tool_use is a hard 400");
  } finally {
    provider.restore();
  }
});

test("a blocked integration is reported to the model rather than swallowed", async () => {
  setData({
    profile: {
      ...getState().data.profile,
      preferences: { ...getState().data.profile?.preferences, ai_permission_mode: "full", ai_permission_mode_version: 2 },
    },
  }, { silent: true });

  const provider = scriptedProvider([
    [{ type: "tool_use", id: "call_1", name: "send_email", input: { to: "someone@example.com", subject: "Hi", body: "Hello" } }],
    [{ type: "text", text: "Outlook is not connected, so nothing was sent." }],
  ]);

  try {
    const { entries } = await runAgentLoop({
      transcript: [{ id: "u1", role: "user", text: "email someone@example.com" }],
    });

    const tool = entries.find((entry) => entry.role === "tool");
    assert.equal(tool.result.ok, false);
    assert.equal(tool.result.blocked, true);

    const block = provider.sent[1].messages
      .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
      .find((item) => item.type === "tool_result");
    assert.equal(block.is_error, true);
    assert.match(block.content, /not connected/i);
  } finally {
    provider.restore();
    setData({
      profile: {
        ...getState().data.profile,
        preferences: { ...getState().data.profile?.preferences, ai_permission_mode: "work", ai_permission_mode_version: 2 },
      },
    }, { silent: true });
  }
});

test("the loop stops rather than calling tools forever", async () => {
  /* One scripted reply, replayed: the model never stops asking for a tool. */
  const provider = scriptedProvider([
    [{ type: "tool_use", id: "call_loop", name: "get_status", input: {} }],
  ]);

  try {
    const { steps, stopped, entries } = await runAgentLoop({
      transcript: [{ id: "u1", role: "user", text: "go" }],
      maxSteps: 3,
    });

    assert.equal(stopped, "max_steps");
    assert.equal(steps, 3);
    assert.equal(entries.at(-1).role, "system");
    assert.match(entries.at(-1).text, /Stopped after 3 steps/);
  } finally {
    provider.restore();
  }
});

test("the workspace snapshot rides along and is rebuilt each step", async () => {
  const provider = scriptedProvider([
    [{ type: "tool_use", id: "call_1", name: "get_next_lead", input: {} }],
    [{ type: "text", text: "Done." }],
  ]);

  try {
    await runAgentLoop({ transcript: [{ id: "u1", role: "user", text: "who is next?" }] });

    for (const request of provider.sent) {
      const first = request.messages.find((message) => typeof message.content === "string");
      assert.match(first.content, /<workspace_snapshot>/, "every request carries the snapshot");
      assert.match(first.content, /Ironwood Electric/);
      assert.match(first.content, /who is next\?/, "attached to the message that opened the exchange");
    }
  } finally {
    provider.restore();
  }
});

test("a tool call whose ids repeat across turns still resolves to one answer", async () => {
  const provider = scriptedProvider([
    [{ type: "tool_use", id: "call_1", name: "get_status", input: {} }],
    [{ type: "tool_use", id: "call_2", name: "get_tasks", input: { view: "open" } }],
    [{ type: "text", text: "All clear." }],
  ]);

  try {
    const { entries, steps } = await runAgentLoop({
      transcript: [{ id: "u1", role: "user", text: "anything to do?" }],
    });

    assert.equal(steps, 3, "the loop chains one tool into the next");
    assert.deepEqual(
      entries.filter((entry) => entry.role === "tool").map((entry) => entry.tool),
      ["get_status", "get_tasks"],
    );
    assert.equal(getState().assistant.pending, false, "the loop does not touch page state");
  } finally {
    provider.restore();
  }
});
