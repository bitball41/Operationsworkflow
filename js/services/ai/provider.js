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
Call a tool when the answer requires reading or changing real records, and chain tools when a
request needs several steps: find the leads, build the demo, then send. When the person asks for a
normal workspace action, do it immediately with the tools instead of asking them to repeat details
or confirm a routine step. After the tools have run, always answer in your own words — the person
never sees raw tool output as an answer.

You can act on the business, not just describe it: discover new leads, add and edit leads, build
and publish demos, send email to any address (a lead, a client, or someone with no record at all),
schedule follow-ups, sync the Outlook inbox and Whop payments, and record tasks, notes, payments
and expenses.

Discovery tools report a requested count and whether the target was met. Treat complete:false as
unfinished work, not success. Retry once with a cleaner niche, a broader area, or a deeper search
when that is a reasonable interpretation of the request. When some leads were saved, request only
the reported shortfall on the retry. If the target still is not met, state the exact saved count and
the shortfall; never turn "0 businesses scanned" into a completed result.

When a tool comes back blocked, say plainly what is not connected and what would fix it. Never
claim something was sent, published or saved unless a tool reported that it was. Keep replies
short and concrete: the person reading them is mid-task, not browsing.`;

function contextBlock(context) {
  return `<workspace_snapshot>\n${JSON.stringify(context ?? {}, null, 2)}\n</workspace_snapshot>`;
}

/**
 * The tool payload the model gets back.
 *
 * Records in this workspace carry large blobs — a lead's raw OpenScout payload,
 * a demo's whole file bundle — that would dominate the context window without
 * telling the model anything it can use. The summary always survives; the data
 * is trimmed to something a turn can afford.
 */
export function serializeToolResult(result, limit = 6000) {
  const payload = {
    ok: result?.ok !== false,
    ...(result?.complete === undefined ? {} : { complete: Boolean(result.complete) }),
    ...(result?.summary ? { summary: result.summary } : {}),
    ...(result?.error ? { error: result.error } : {}),
    ...(result?.blocked ? { blocked: true } : {}),
    ...(result?.provider ? { provider: result.provider } : {}),
    ...(result?.data === undefined ? {} : { data: result.data }),
  };

  const text = JSON.stringify(payload);
  if (text.length <= limit) return text;

  /* Too big: keep the summary and as much of the head of the data as fits, and
     say so, rather than silently handing back a truncated JSON fragment. */
  const { data, ...envelope } = payload;
  const trimmed = {
    ...envelope,
    data_truncated: true,
    note: "Result too large for one turn. Narrow the query or ask for specific records.",
    data_preview: "",
  };
  /* Escaping means the preview costs more encoded than it does raw, so the
     budget is measured on the encoded result and given back until it fits. */
  const preview = JSON.stringify(data ?? null);
  let room = Math.max(0, limit - JSON.stringify(trimmed).length);
  let encoded = "";
  do {
    trimmed.data_preview = preview.slice(0, room);
    encoded = JSON.stringify(trimmed);
    room -= encoded.length - limit;
  } while (encoded.length > limit && room > 0);

  return encoded.length > limit ? JSON.stringify({ ...trimmed, data_preview: "" }) : encoded;
}

/**
 * Provider-neutral transcript -> Anthropic messages.
 *
 * Anthropic requires every `tool_use` block to be answered by a `tool_result`
 * with a matching id, in a single following user message. Dropping tool
 * messages — as this used to — meant the model never saw what its own tools
 * returned and could never produce a final answer.
 */
function toAnthropicMessages(transcript) {
  const messages = [];
  let pendingResults = [];

  const flush = () => {
    if (!pendingResults.length) return;
    messages.push({ role: "user", content: pendingResults });
    pendingResults = [];
  };

  for (const entry of transcript) {
    if (entry.role === "tool") {
      pendingResults.push({
        type: "tool_result",
        tool_use_id: entry.toolCallId,
        content: serializeToolResult(entry.result),
        ...(entry.result?.ok === false ? { is_error: true } : {}),
      });
      continue;
    }

    flush();

    if (entry.role === "assistant") {
      const content = [
        ...(entry.text ? [{ type: "text", text: entry.text }] : []),
        ...(entry.toolCalls || []).map((call) => ({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.args || {},
        })),
      ];
      if (content.length) messages.push({ role: "assistant", content });
      continue;
    }

    if (entry.role === "user" && entry.text) {
      messages.push({ role: "user", content: entry.text });
    }
  }

  flush();
  return messages;
}

/** The same transcript as OpenAI Responses input items. */
function toOpenAiInput(transcript) {
  const items = [];
  for (const entry of transcript) {
    if (entry.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: entry.toolCallId,
        output: serializeToolResult(entry.result),
      });
      continue;
    }
    if (entry.role === "assistant") {
      if (entry.text) items.push({ role: "assistant", content: entry.text });
      for (const call of entry.toolCalls || []) {
        items.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.args || {}),
        });
      }
      continue;
    }
    if (entry.role === "user" && entry.text) items.push({ role: "user", content: entry.text });
  }
  return items;
}

/**
 * Trims to the recent exchange and repairs it.
 *
 * A tool call with no result, or a result with no call, is a hard 400 from
 * Anthropic — and both happen in normal use: a deterministic command runs a
 * tool with no model call behind it, and an aborted turn leaves a call
 * unanswered. Rather than let either reach the provider, unmatched calls are
 * dropped and orphan results are rewritten as plain narration the model can
 * still read.
 */
export function recentTranscript(entries, limit = 40) {
  const usable = (Array.isArray(entries) ? entries : []).filter((entry) => (
    ["user", "assistant", "tool"].includes(entry?.role)
    && (entry.text || entry.toolCalls?.length || entry.role === "tool")
  ));

  let window = usable;
  if (usable.length > limit) {
    let start = usable.length - limit;
    while (start < usable.length && usable[start].role !== "user") start += 1;
    window = start < usable.length ? usable.slice(start) : usable.slice(-1);
  }

  const answered = new Set(window.filter((entry) => entry.role === "tool" && entry.toolCallId).map((entry) => entry.toolCallId));
  const called = new Set(window.flatMap((entry) => (entry.toolCalls || []).map((call) => call.id)));

  return window.flatMap((entry) => {
    if (entry.role === "assistant") {
      const toolCalls = (entry.toolCalls || []).filter((call) => answered.has(call.id));
      if (!entry.text && !toolCalls.length) return [];
      return [{ ...entry, toolCalls }];
    }
    if (entry.role === "tool" && !called.has(entry.toolCallId)) {
      return [{
        role: "user",
        text: `[${entry.tool} ran outside this conversation] ${serializeToolResult(entry.result, 1500)}`,
      }];
    }
    return [entry];
  });
}

/** Attaches the workspace snapshot to the message that opened this exchange. */
function withContext(messages, context) {
  const block = contextBlock(context);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && typeof message.content === "string") {
      const next = [...messages];
      next[index] = { ...message, content: `${block}\n\n${message.content}` };
      return next;
    }
  }
  return [{ role: "user", content: block }, ...messages];
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
 * The transcript is provider-neutral (see `runAgentLoop`): user text, assistant
 * text plus tool calls, and tool results. Each provider's wire format is built
 * from it here, so the loop above does not care which one is connected.
 *
 * @param {{transcript: Array, context: object, tools: Array, signal?: AbortSignal}} payload
 * @returns {Promise<{text: string, toolCalls: Array, stopReason: string, usage: object|null}>}
 */
export async function runAssistantTurn({ transcript, context, tools, signal } = {}) {
  const provider = connectedProvider();
  if (!provider) {
    throw new NotConnectedError("anthropic", "No AI provider is connected. Add a key to the Cloudflare Worker to enable replies.");
  }

  const entries = recentTranscript(transcript);
  if (!entries.length) throw new Error("There is nothing to send yet.");

  const { model, effort } = activeModel();

  try {
    if (provider.id === "anthropic") {
      const payload = await callAnthropic({
        model: model.id,
        effort,
        system: SYSTEM_PROMPT,
        messages: withContext(toAnthropicMessages(entries), context),
        tools: anthropicTools(tools),
      }, { signal });
      const result = anthropicResult(payload);
      await recordUsage({ model, task: "assistant_turn", usage: result.usage });
      return { ...result, model: model.id };
    }

    const payload = await callOpenAI({
      model: model.id,
      instructions: SYSTEM_PROMPT,
      input: withContext(toOpenAiInput(entries), context),
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
