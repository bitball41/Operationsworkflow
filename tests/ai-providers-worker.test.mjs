import assert from "node:assert/strict";
import test from "node:test";

import { aiProviderConfig, aiProviderStatus } from "../worker/ai-providers.js";
import { handleAnthropic, handleOpenAICompatible } from "../worker/index.js";

async function withFetch(handler, action) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await action();
  } finally {
    globalThis.fetch = original;
  }
}

test("compatible providers require explicit maintainable model configuration", () => {
  const kimi = aiProviderConfig({ KIMI_API_KEY: "test" }, "kimi");
  assert.ok(kimi.missing.includes("KIMI_MODEL"));

  const qwen = aiProviderConfig({
    QWEN_API_KEY: "test",
    QWEN_MODEL: "configured-qwen",
    QWEN_BASE_URL: "https://attacker.example/v1",
  }, "qwen");
  assert.ok(qwen.missing.some((item) => /invalid/i.test(item)));
});

test("a provider is connected only after an authenticated model check", async () => {
  const env = {
    ANTHROPIC_API_KEY: "anthropic-test",
    ANTHROPIC_MODEL: "claude-sonnet-5",
  };
  const status = await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.anthropic.com");
    assert.equal(new Headers(init.headers).get("x-api-key"), "anthropic-test");
    return Response.json({ data: [{ id: "claude-sonnet-5" }] });
  }, () => aiProviderStatus(env));

  assert.equal(status.anthropic.connected, true);
  assert.equal(status.openai.connected, false);
  assert.equal(status.kimi.connected, false);
  assert.equal(status.qwen.connected, false);
});

test("a credential is not called connected when its configured model is unavailable", async () => {
  const status = await withFetch(
    async () => Response.json({ data: [{ id: "another-model" }] }),
    () => aiProviderStatus({ OPENAI_API_KEY: "openai-test", OPENAI_MODEL: "configured-model" }),
  );
  assert.equal(status.openai.configured, true);
  assert.equal(status.openai.connected, false);
  assert.match(status.openai.reason, /not returned/i);
});

test("the Worker, not the browser payload, chooses compatible model ids", async () => {
  const response = await withFetch(async (input, init = {}) => {
    assert.equal(String(input), "https://api.moonshot.ai/v1/chat/completions");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer kimi-test");
    const payload = JSON.parse(init.body);
    assert.equal(payload.model, "worker-configured-kimi");
    assert.notEqual(payload.model, "browser-chosen-model");
    return Response.json({ choices: [{ message: { content: "ok" } }] });
  }, () => handleOpenAICompatible(new Request("https://operations.conno.fun/api/ai/compatible/kimi/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "browser-chosen-model", messages: [{ role: "user", content: "hello" }] }),
  }), {
    KIMI_API_KEY: "kimi-test",
    KIMI_MODEL: "worker-configured-kimi",
  }, "kimi"));

  assert.equal(response.status, 200);
});

test("Anthropic requests also use only the deployed Worker model", async () => {
  const response = await withFetch(async (_input, init = {}) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.model, "claude-sonnet-5");
    assert.notEqual(payload.model, "browser-model");
    return Response.json({ content: [{ type: "text", text: "ok" }] });
  }, () => handleAnthropic(new Request("https://operations.conno.fun/api/ai/anthropic/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "browser-model", messages: [{ role: "user", content: "hello" }] }),
  }), { ANTHROPIC_API_KEY: "anthropic-test" }));
  assert.equal(response.status, 200);
});
