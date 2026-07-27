/**
 * The model catalogue is the only thing standing between a typo and an
 * expensive bill, so its shape and its arithmetic are pinned here.
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  MODELS, EFFORT_LEVELS, DEFAULT_MODEL_ID, DEFAULT_EFFORT,
  getModel, modelsForProvider, resolveModel, costOf, estimatedTurnCost, formatPerMTok,
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

test("the default model exists and is not the most expensive one", () => {
  const fallback = getModel(DEFAULT_MODEL_ID);
  assert.ok(fallback, "default resolves");
  const priced = MODELS.filter((m) => m.outputPerMTok);
  const dearest = Math.max(...priced.map((m) => m.outputPerMTok));
  assert.ok(fallback.outputPerMTok < dearest, "the default is not the priciest option");
  assert.ok(EFFORT_LEVELS.some((level) => level.id === DEFAULT_EFFORT), "default effort is a real level");
});

test("cost is computed from real token counts", () => {
  /* Sonnet 5 is $3 in / $15 out per million tokens. */
  assert.equal(costOf("claude-sonnet-5", { input: 1_000_000, output: 0 }), 3);
  assert.equal(costOf("claude-sonnet-5", { input: 0, output: 1_000_000 }), 15);
  assert.equal(costOf("claude-sonnet-5", { input: 500_000, output: 100_000 }), 1.5 + 1.5);
  assert.equal(costOf("nonexistent-model", { input: 1_000_000 }), 0, "unknown models cost nothing rather than guessing");
});

test("a cheaper model really is cheaper for the same turn", () => {
  assert.ok(estimatedTurnCost("claude-haiku-4-5") < estimatedTurnCost("claude-sonnet-5"));
  assert.ok(estimatedTurnCost("claude-sonnet-5") < estimatedTurnCost("claude-opus-5"));
});

test("unpriced models report as untracked instead of as free", () => {
  const openai = modelsForProvider("openai")[0];
  assert.ok(openai, "there is at least one OpenAI model");
  assert.equal(formatPerMTok(openai), "not tracked");
  assert.match(openai.note, /not tracked/i);
});

test("resolveModel never hands one provider another provider's model", () => {
  assert.equal(resolveModel("claude-opus-5", "anthropic").id, "claude-opus-5");
  assert.equal(resolveModel("claude-opus-5", "openai").provider, "openai", "an Anthropic id cannot leak to OpenAI");
  assert.equal(resolveModel("", "anthropic").id, DEFAULT_MODEL_ID);
  assert.equal(resolveModel("made-up", "anthropic").id, DEFAULT_MODEL_ID);
});

test("models without an effort control are flagged so the worker omits it", () => {
  assert.equal(getModel("claude-haiku-4-5").supportsEffort, false);
  assert.equal(getModel("claude-sonnet-5").supportsEffort, true);
});
