/**
 * The model catalogue is the only thing standing between a typo and an
 * expensive bill, so its shape and its arithmetic are pinned here.
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  MODELS, EFFORT_LEVELS, VERIFIED_MODEL_DEFAULTS, DEFAULT_MODEL_ID, DEFAULT_EFFORT,
  getModel, modelDefinition, modelsForProvider, resolveModel, costOf, formatPerMTok,
} = await import("../js/data/models.js");

test("every model is well formed", () => {
  assert.ok(MODELS.length >= 2);
  for (const model of MODELS) {
    assert.ok(model.id, "has an id");
    assert.ok(["anthropic", "openai"].includes(model.provider), `${model.id} has a known provider`);
    assert.ok(model.label, `${model.id} has a label`);
    assert.equal(typeof model.supportsEffort, "boolean", `${model.id} declares effort support`);
    assert.ok(model.note, `${model.id} explains when to use it`);
  }
  assert.equal(new Set(MODELS.map((m) => m.id)).size, MODELS.length, "ids are unique");
});

test("the verified first-class provider defaults resolve", () => {
  const fallback = getModel(DEFAULT_MODEL_ID);
  assert.ok(fallback, "default resolves");
  assert.equal(VERIFIED_MODEL_DEFAULTS.anthropic, "claude-sonnet-5");
  assert.equal(VERIFIED_MODEL_DEFAULTS.openai, "gpt-5.6-sol");
  assert.equal(VERIFIED_MODEL_DEFAULTS.kimi, "", "compatible providers require deployed configuration");
  assert.equal(VERIFIED_MODEL_DEFAULTS.qwen, "", "regional Qwen configuration is not guessed");
  assert.ok(EFFORT_LEVELS.some((level) => level.id === DEFAULT_EFFORT), "default effort is a real level");
});

test("cost is computed from real token counts", () => {
  /* Sonnet 5 is $3 in / $15 out per million tokens. */
  assert.equal(costOf("claude-sonnet-5", { input: 1_000_000, output: 0 }), 3);
  assert.equal(costOf("claude-sonnet-5", { input: 0, output: 1_000_000 }), 15);
  assert.equal(costOf("claude-sonnet-5", { input: 500_000, output: 100_000 }), 1.5 + 1.5);
  assert.equal(costOf("nonexistent-model", { input: 1_000_000 }), 0, "unknown models cost nothing rather than guessing");
});

test("verified OpenAI pricing is tracked and dynamic provider pricing is not guessed", () => {
  const openai = modelsForProvider("openai")[0];
  assert.ok(openai, "there is at least one OpenAI model");
  assert.equal(formatPerMTok(openai), "$5/$30 per million tokens");
  assert.equal(costOf(openai.id, { input: 1_000_000, output: 1_000_000 }), 35);
  assert.equal(formatPerMTok(modelDefinition("deployment-kimi-model", "kimi")), "price not tracked");
});

test("resolveModel never hands one provider another provider's model", () => {
  assert.equal(resolveModel("claude-sonnet-5", "anthropic").id, "claude-sonnet-5");
  assert.equal(resolveModel("claude-sonnet-5", "openai").id, "gpt-5.6-sol", "an Anthropic id cannot leak to OpenAI");
  assert.equal(resolveModel("", "anthropic").id, DEFAULT_MODEL_ID);
  assert.equal(resolveModel("made-up", "anthropic").id, DEFAULT_MODEL_ID);
});

test("Worker-configured compatible models stay provider-scoped and omit effort", () => {
  const kimi = modelDefinition("deployment-kimi-model", "kimi", { tools: true, effort: false });
  const qwen = modelDefinition("deployment-qwen-model", "qwen", { tools: true, effort: false });
  assert.equal(kimi.provider, "kimi");
  assert.equal(qwen.provider, "qwen");
  assert.equal(kimi.supportsEffort, false);
  assert.equal(qwen.supportsEffort, false);
  assert.equal(getModel("claude-sonnet-5").supportsEffort, true);
});
