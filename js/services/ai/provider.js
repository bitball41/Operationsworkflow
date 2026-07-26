/**
 * Model provider boundary.
 *
 * No key is stored in this repository and no request is faked. When a provider
 * is connected, `runAssistantTurn` is the single place that sends the
 * conversation, the app context and the tool schema to a model — everything
 * else in the assistant already works today.
 */
import { NotConnectedError, integrationStatus } from "../integrations.js";

export const MODEL_PROVIDERS = Object.freeze([
  { id: "anthropic", name: "Anthropic", note: "Recommended for the operations assistant" },
  { id: "openai", name: "OpenAI", note: "Alternate provider" },
]);

export function connectedProvider() {
  return MODEL_PROVIDERS.find((provider) => integrationStatus(provider.id) === "connected") || null;
}

export function providerReady() {
  return Boolean(connectedProvider());
}

export function providerNotice() {
  return providerReady()
    ? `${connectedProvider().name} is connected.`
    : "No AI provider is connected, so the assistant cannot answer yet. Tools, context and commands all work.";
}

/**
 * Sends one assistant turn.
 *
 * @param {{messages: Array, context: object, tools: Array}} payload
 * @returns {Promise<{text: string, toolCalls: Array}>}
 */
export async function runAssistantTurn(payload) {
  const provider = connectedProvider();
  if (!provider) {
    throw new NotConnectedError("anthropic", "No AI provider is connected. Add one in Integrations to enable replies.");
  }

  /* Reserved for the provider request. The payload shape is already final:
     { messages, context, tools } -> { text, toolCalls }. */
  throw new NotConnectedError(provider.id, `${provider.name} is marked connected but the request layer is not implemented yet.`);
}

/** Rough token estimate used by the context indicator. */
export function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.ceil(text.length / 4);
}
