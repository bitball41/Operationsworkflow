/**
 * Public model metadata used for display and cost accounting.
 *
 * The Worker remains the source of truth for the model it can actually invoke.
 * Anthropic and OpenAI have documented defaults; Kimi and Qwen deliberately do
 * not. Their model ids are deployment configuration because those catalogues
 * and regional availability change independently of this browser bundle.
 */

export const VERIFIED_MODEL_DEFAULTS = Object.freeze({
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.6-sol",
  kimi: "",
  qwen: "",
});

export const MODELS = Object.freeze([
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    inputPerMTok: 3,
    outputPerMTok: 15,
    supportsEffort: true,
    note: "Verified Anthropic model id. The Worker can override it with ANTHROPIC_MODEL.",
  },
  {
    id: "gpt-5.6-sol",
    provider: "openai",
    label: "GPT-5.6 Sol",
    inputPerMTok: 5,
    outputPerMTok: 30,
    supportsEffort: true,
    note: "Verified OpenAI Responses model id and standard token price. The Worker can override it with OPENAI_MODEL.",
  },
]);

export const EFFORT_LEVELS = Object.freeze([
  { id: "low", label: "Low", note: "Faster for short operational answers." },
  { id: "medium", label: "Medium", note: "Balanced starting point for daily work." },
  { id: "high", label: "High", note: "Deeper reasoning for multi-step work." },
  { id: "xhigh", label: "Extra high", note: "Only when the configured model supports it." },
  { id: "max", label: "Max", note: "Highest supported effort; use deliberately." },
]);

export const DEFAULT_MODEL_ID = VERIFIED_MODEL_DEFAULTS.anthropic;
export const DEFAULT_EFFORT = "medium";

export function getModel(id) {
  return MODELS.find((model) => model.id === id) || null;
}

export function modelsForProvider(provider) {
  return MODELS.filter((model) => model.provider === provider);
}

export function modelDefinition(id, provider, capabilities = {}) {
  const known = getModel(id);
  if (known?.provider === provider) return known;
  return {
    id: String(id || ""),
    provider,
    label: String(id || "Not configured"),
    inputPerMTok: null,
    outputPerMTok: null,
    supportsEffort: capabilities.effort === true,
    note: id ? "Configured and verified by the deployed Worker." : "No model is configured on the Worker.",
  };
}

export function resolveModel(id, provider = "anthropic") {
  const chosen = getModel(id);
  if (chosen?.provider === provider) return chosen;
  const fallbackId = VERIFIED_MODEL_DEFAULTS[provider] || "";
  return getModel(fallbackId) || modelDefinition(id || fallbackId, provider);
}

export function costOf(modelId, { input = 0, output = 0 } = {}) {
  const model = getModel(modelId);
  if (!model?.inputPerMTok || !model?.outputPerMTok) return 0;
  return (input / 1e6) * model.inputPerMTok + (output / 1e6) * model.outputPerMTok;
}

export function estimatedTurnCost(modelId) {
  return costOf(modelId, { input: 12_000, output: 700 });
}

export function formatPerMTok(model) {
  if (!model?.inputPerMTok || !model?.outputPerMTok) return "price not tracked";
  return `$${model.inputPerMTok}/$${model.outputPerMTok} per million tokens`;
}
