/**
 * Persistent assistant conversations.
 *
 * The transcript remains provider-neutral, exactly like the agent loop. Local
 * workspaces keep conversations in localStorage through the normal data
 * backend; signed-in workspaces keep the same records in Supabase.
 */
import { getState, setAssistant } from "../../core/state.js";
import { createRecord, deleteRecord, findRecord, updateRecord } from "../data.js";

const MAX_MESSAGES = 160;
const MAX_TOOL_RESULT_CHARS = 20_000;

function titleFrom(messages) {
  const first = messages.find((message) => message.role === "user" && message.text)?.text || "New conversation";
  return first.replace(/\s+/g, " ").trim().slice(0, 72) || "New conversation";
}

function trimResult(result) {
  if (result === undefined) return undefined;
  const text = JSON.stringify(result);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return result;
  return {
    ok: result?.ok !== false,
    summary: result?.summary || "Tool result was too large to retain in conversation history.",
    data_truncated: true,
  };
}

function storableMessages(messages) {
  return messages.slice(-MAX_MESSAGES).map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text || "",
    at: message.at,
    who: message.who,
    blocked: Boolean(message.blocked),
    model: message.model,
    tool: message.tool,
    toolCallId: message.toolCallId,
    args: message.args,
    toolCalls: message.toolCalls,
    ...(message.role === "tool" ? { result: trimResult(message.result) } : {}),
  }));
}

export function hydrateAssistantHistory() {
  const conversations = getState().data.assistantConversations || [];
  const latest = conversations[0] || null;
  setAssistant({
    activeConversationId: latest?.id || null,
    messages: Array.isArray(latest?.messages) ? latest.messages : [],
    pending: false,
  }, { silent: true });
  return latest;
}

export async function persistAssistantHistory(messages = getState().assistant.messages) {
  const stored = storableMessages(messages);
  if (!stored.length) return null;

  const activeId = getState().assistant.activeConversationId;
  const existing = activeId ? findRecord("assistantConversations", activeId) : null;
  const payload = {
    title: existing?.title || titleFrom(stored),
    messages: stored,
    last_message_at: stored.at(-1)?.at || new Date().toISOString(),
  };

  const conversation = existing
    ? await updateRecord("assistantConversations", existing.id, payload)
    : await createRecord("assistantConversations", payload);

  setAssistant({ activeConversationId: conversation.id });
  return conversation;
}

export function newAssistantConversation() {
  setAssistant({ activeConversationId: null, messages: [], pending: false });
}

export function openAssistantConversation(id) {
  const conversation = findRecord("assistantConversations", id);
  if (!conversation) return false;
  setAssistant({
    activeConversationId: conversation.id,
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    pending: false,
  });
  return true;
}

export async function deleteAssistantConversation(id = getState().assistant.activeConversationId) {
  if (!id) {
    newAssistantConversation();
    return;
  }
  await deleteRecord("assistantConversations", id);
  const next = getState().data.assistantConversations[0] || null;
  if (next) openAssistantConversation(next.id);
  else newAssistantConversation();
}
