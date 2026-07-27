/**
 * Model provider boundary.
 *
 * No key is stored in this repository or in the browser. `runAssistantTurn`
 * posts the conversation, the app context and the tool schema to the Cloudflare
 * Worker, which adds the credential and calls the provider. Everything else in
 * the assistant — context, tools, commands — already works without a provider.
 */
import { callAnthropic, callOpenAI, ApiError } from "../api.js";
import { NotConnectedError, integrationStatus } from "../integrations.js";
import { DEFAULT_EFFORT, costOf, resolveModel } from "../../data/models.js";
import { createRecord, preferences } from "../data.js";

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
  if (!providerReady()) {
    return "No AI provider is connected, so the assistant cannot answer yet. Tools, context and commands all work.";
  }
  const { model, effort } = activeModel();
  return `${connectedProvider().name} · ${model.label}${model.supportsEffort ? ` · ${effort} effort` : ""}`;
}

/**
 * The model and effort every turn runs on. Chosen in Settings, or the catalogue
 * default; always narrowed to a model the connected provider actually serves,
 * so switching provider can never send an Anthropic id to OpenAI.
 */
export function activeModel() {
  const provider = connectedProvider()?.id || "anthropic";
  const settings = preferences();
  return {
    provider,
    model: resolveModel(settings.model, provider),
    effort: settings.effort || DEFAULT_EFFORT,
  };
}

/**
 * Records what a turn actually cost, so the Costs page shows real spend rather
 * than an estimate. Never allowed to fail a turn that already succeeded.
 */
async function recordUsage({ model, task, usage }) {
  const input = Number(usage?.input_tokens ?? usage?.input_tokens_total ?? 0);
  const output = Number(usage?.output_tokens ?? 0);
  if (!input && !output) return;

  try {
    await createRecord("aiUsage", {
      provider: model.provider,
      model: model.id,
      task,
      request_count: 1,
      input_tokens: input,
      output_tokens: output,
      cost: Number(costOf(model.id, { input, output }).toFixed(6)),
      occurred_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Could not record AI usage", error);
  }
}

const SYSTEM_PROMPT = `You are the operations assistant for a one-person website-selling business.
You find local businesses without websites, build them a demo site, send one email, and follow the
work through to a paid client.

A structured snapshot of the whole workspace is supplied with every turn. Use it. Do not invent
leads, clients, demos, numbers or dates that are not in it — say what you do not know instead.
Call a tool when the answer requires reading or changing real records. Keep replies short and
concrete: the person reading them is mid-task, not browsing.`;

function contextBlock(context) {
  return `<workspace_snapshot>\n${JSON.stringify(context ?? {}, null, 2)}\n</workspace_snapshot>`;
}

/** Trims the transcript to the recent turns so a long session stays affordable. */
function recentTurns(messages, limit = 24) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.text)
    .slice(-limit)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.text),
    }));
}

/** Anthropic tool schema: `input_schema` where the registry emits `parameters`. */
function anthropicTools(tools) {
  return (tools || []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema || tool.parameters || { type: "object", properties: {} },
  }));
}

function anthropicResult(payload) {
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  return {
    text: blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim(),
    toolCalls: blocks
      .filter((block) => block.type === "tool_use")
      .map((block) => ({ id: block.id, name: block.name, args: block.input || {} })),
    stopReason: payload?.stop_reason || "",
    usage: payload?.usage || null,
  };
}

function openAiResult(payload) {
  const items = Array.isArray(payload?.output) ? payload.output : [];
  const text = String(payload?.output_text || "").trim() || items
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((part) => part?.type === "output_text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return {
    text,
    toolCalls: items
      .filter((item) => item?.type === "function_call")
      .map((item) => ({
        id: item.call_id || item.id,
        name: item.name,
        args: typeof item.arguments === "string" ? safeParse(item.arguments) : item.arguments || {},
      })),
    stopReason: payload?.status || "",
    usage: payload?.usage || null,
  };
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/**
 * Sends one assistant turn.
 *
 * @param {{messages: Array, context: object, tools: Array, signal?: AbortSignal}} payload
 * @returns {Promise<{text: string, toolCalls: Array, stopReason: string, usage: object|null}>}
 */
export async function runAssistantTurn({ messages, context, tools, signal } = {}) {
  const provider = connectedProvider();
  if (!provider) {
    throw new NotConnectedError("anthropic", "No AI provider is connected. Add a key to the Cloudflare Worker to enable replies.");
  }

  const turns = recentTurns(messages);
  if (!turns.length) throw new Error("There is nothing to send yet.");

  /* The snapshot rides on the newest user turn rather than the system prompt so
     the system prompt stays byte-identical and keeps its prompt cache. */
  const withContext = turns.map((turn, index) => (
    index === turns.length - 1 && turn.role === "user"
      ? { ...turn, content: `${contextBlock(context)}\n\n${turn.content}` }
      : turn
  ));

  const { model, effort } = activeModel();

  try {
    if (provider.id === "anthropic") {
      const payload = await callAnthropic({
        model: model.id,
        effort,
        system: SYSTEM_PROMPT,
        messages: withContext,
        tools: anthropicTools(tools),
      }, { signal });
      const result = anthropicResult(payload);
      await recordUsage({ model, task: "assistant_turn", usage: result.usage });
      return { ...result, model: model.id };
    }

    const payload = await callOpenAI({
      model: model.id,
      instructions: SYSTEM_PROMPT,
      input: withContext,
      tools: (tools || []).map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema || tool.parameters || { type: "object", properties: {} },
      })),
    }, { signal });
    const result = openAiResult(payload);
    await recordUsage({ model, task: "assistant_turn", usage: result.usage });
    return { ...result, model: model.id };
  } catch (error) {
    if (error instanceof ApiError && error.blocked) {
      throw new NotConnectedError(error.provider || provider.id, error.message);
    }
    throw error;
  }
}

/** Rough token estimate used by the context indicator. */
export function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.ceil(text.length / 4);
}
