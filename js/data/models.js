/**
 * The models you can actually pick, what they cost, and what they are for.
 *
 * Shared by the browser and the Cloudflare Worker — the Worker imports this at
 * build time, so the picker and the allow list can never drift apart. Nothing
 * secret is in here; it is public catalogue information.
 *
 * Prices are US dollars per million tokens, from each provider's public pricing.
 * They exist so the Costs page can show real spend instead of a guess, and so
 * the picker can say what a choice costs before you make it.
 */

export const MODELS = Object.freeze([
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Haiku 4.5",
    inputPerMTok: 1,
    outputPerMTok: 5,
    /* Haiku is a previous-generation model: it has no effort control and no
       adaptive thinking, so the worker must not send either. */
    supportsEffort: false,
    note: "Cheapest. Good for lookups, classification and short answers.",
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Sonnet 5",
    inputPerMTok: 3,
    outputPerMTok: 15,
    supportsEffort: true,
    note: "The sensible default — close to Opus on agentic work at a third of the price.",
  },
  {
    id: "claude-opus-5",
    provider: "anthropic",
    label: "Opus 5",
    inputPerMTok: 5,
    outputPerMTok: 25,
    supportsEffort: true,
    note: "Hardest reasoning and long multi-step work. Five times Haiku on input.",
  },
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Opus 4.8",
    inputPerMTok: 5,
    outputPerMTok: 25,
    supportsEffort: true,
    note: "Previous-generation Opus. Keep as a fallback if Opus 5 refuses a request.",
  },
  {
    id: "gpt-5",
    provider: "openai",
    label: "GPT-5",
    /* Not priced here: this catalogue only carries figures taken from published
       pricing. OpenAI spend shows as tokens, not dollars, rather than as a
       number that might be wrong. */
    inputPerMTok: null,
    outputPerMTok: null,
    supportsEffort: false,
    note: "Used only when OpenAI is the connected provider. Cost is not tracked.",
  },
]);

/** Effort controls how much the model thinks, and is the biggest cost lever. */
export const EFFORT_LEVELS = Object.freeze([
  { id: "low", label: "Low", note: "Fewest tokens. Scoped, literal answers." },
  { id: "medium", label: "Medium", note: "Good balance for day-to-day questions." },
  { id: "high", label: "High", note: "The provider default. Deeper reasoning." },
  { id: "xhigh", label: "Extra high", note: "For genuinely hard multi-step work." },
]);

export const DEFAULT_MODEL_ID = "claude-sonnet-5";
export const DEFAULT_EFFORT = "medium";

export function getModel(id) {
  return MODELS.find((model) => model.id === id) || null;
}

export function modelsForProvider(provider) {
  return MODELS.filter((model) => model.provider === provider);
}

/** The chosen model, falling back to this provider's cheapest sensible option. */
export function resolveModel(id, provider = "anthropic") {
  const chosen = getModel(id);
  if (chosen && chosen.provider === provider) return chosen;
  return getModel(DEFAULT_MODEL_ID)?.provider === provider
    ? getModel(DEFAULT_MODEL_ID)
    : modelsForProvider(provider)[0] || null;
}

/** Dollar cost of one call. Returns 0 for models with no published price here. */
export function costOf(modelId, { input = 0, output = 0 } = {}) {
  const model = getModel(modelId);
  if (!model?.inputPerMTok || !model?.outputPerMTok) return 0;
  return (input / 1e6) * model.inputPerMTok + (output / 1e6) * model.outputPerMTok;
}

/**
 * What a typical assistant turn costs on this model, so the picker can show a
 * number rather than an abstract price. Based on a workspace snapshot plus tool
 * schema in, and a short answer out.
 */
export function estimatedTurnCost(modelId) {
  return costOf(modelId, { input: 12_000, output: 700 });
}

export function formatPerMTok(model) {
  if (!model?.inputPerMTok || !model?.outputPerMTok) return "not tracked";
  return `$${model.inputPerMTok}/$${model.outputPerMTok} per million tokens`;
}
