/**
 * AI Assistant — the operational workspace for reading and acting across the
 * business. Access is explicit: the selected permission mode decides which
 * tools the model receives and the agent loop enforces the same boundary.
 */
import { getState } from "../core/state.js";
import { escapeHtml, formatNumber } from "../core/utils.js";
import { btn, dot, icon, select } from "../components/ui.js";
import { COMMAND_HINTS } from "../services/ai/commands.js";
import { contextSections, contextSummary, contextTokenEstimate } from "../services/ai/context.js";
import { activeModel, providerReady } from "../services/ai/provider.js";
import { EFFORT_LEVELS, formatPerMTok, modelsForProvider } from "../data/models.js";
import {
  AI_PERMISSION_MODES,
  aiPermissionMode,
  permissionAllows,
  permissionDefinition,
  toolGroups,
} from "../services/ai/tools.js";

const EXAMPLES = [
  { label: "Find leads", text: "Find 25 plumbers in Austin with no website and a public email" },
  { label: "Plan today", text: "What needs my attention today, in priority order?" },
  { label: "Pick outreach", text: "Which five leads should I contact next, and why?" },
  { label: "Check replies", text: "Sync the inbox and summarize every reply that needs action" },
];

function messageBlock(message) {
  if (message.role === "user") {
    return `
      <article class="msg msg--user">
        <div class="msg__content">
          <span class="msg__who">You</span>
          <div class="msg__body">${escapeHtml(message.text)}</div>
        </div>
      </article>
    `;
  }

  if (message.role === "tool") {
    const result = message.result || {};
    const blocked = result.ok === false || result.blocked;
    const args = Object.keys(message.args || {}).length ? JSON.stringify(message.args, null, 2) : "";
    return `
      <article class="msg msg--tool${blocked ? " msg--blocked" : ""}">
        <details class="tool-trace"${blocked ? " open" : ""}>
          <summary>
            <span class="tool-trace__icon">${icon(blocked ? "alert" : "tool")}</span>
            <span class="tool-trace__name">${escapeHtml(message.tool)}</span>
            <span class="tool-trace__status">${blocked ? "Blocked" : "Completed"}</span>
            ${icon("chevron")}
          </summary>
          <div class="tool-trace__body">
            <p>${escapeHtml(result.summary || result.error || "Done.")}</p>
            ${args ? `<pre>${escapeHtml(args)}</pre>` : ""}
          </div>
        </details>
      </article>
    `;
  }

  if (message.role === "assistant") {
    if (!message.text) return "";
    return `
      <article class="msg msg--assistant">
        <div class="msg__avatar">${icon("sparkle")}</div>
        <div class="msg__content">
          <span class="msg__who">Operations AI</span>
          <div class="msg__body">${escapeHtml(message.text)}</div>
        </div>
      </article>
    `;
  }

  return `
    <article class="msg msg--system${message.blocked ? " msg--blocked" : ""}">
      <div class="msg__content">
        <span class="msg__who">${escapeHtml(message.who || "System")}</span>
        <div class="msg__body">${escapeHtml(message.text)}</div>
      </div>
    </article>
  `;
}

function conversationRail(conversations, activeId) {
  return `
    <aside class="assistant-rail" aria-label="Assistant conversations">
      <div class="assistant-rail__head">
        <div>
          <span class="eyebrow">Workspace</span>
          <strong>Operations AI</strong>
        </div>
        ${btn("New", { action: "assistant-new", iconName: "plus", size: "sm", variant: "primary" })}
      </div>
      <div class="assistant-rail__list">
        ${conversations.length ? conversations.map((conversation) => `
          <button class="conversation-item${String(conversation.id) === String(activeId) ? " is-active" : ""}" type="button" data-action="assistant-open-conversation" data-id="${escapeHtml(conversation.id)}">
            ${icon("message")}
            <span>
              <strong>${escapeHtml(conversation.title || "Untitled")}</strong>
              <small>${escapeHtml(conversation.updated_at ? new Date(conversation.updated_at).toLocaleDateString() : "Saved conversation")}</small>
            </span>
          </button>
        `).join("") : `
          <div class="assistant-rail__empty">
            ${icon("message")}
            <p>Your conversations will stay here.</p>
          </div>
        `}
      </div>
      <div class="assistant-rail__foot">
        <span>${dot(providerReady() ? "green" : "")} ${providerReady() ? "Model connected" : "Model offline"}</span>
        <small>Synced with this workspace</small>
      </div>
    </aside>
  `;
}

function accessControl() {
  const current = aiPermissionMode();
  return select(
    "ai_permission_mode",
    AI_PERMISSION_MODES.map((mode) => ({ value: mode.id, label: `${mode.shortLabel} access` })),
    current,
    { attrs: 'data-action="ai-permission-select" class="select-sm permission-select" aria-label="AI access"' },
  );
}

function contextPanel() {
  const mode = aiPermissionMode();
  const permission = permissionDefinition(mode);
  const groups = toolGroups();
  const tools = groups.flatMap(([, entries]) => entries);
  const allowed = tools.filter((tool) => permissionAllows(tool, mode)).length;

  return `
    <aside class="assistant-context">
      <div class="assistant-context__head">
        <div>
          <span class="eyebrow">Live context</span>
          <strong>${escapeHtml(contextSummary())}</strong>
        </div>
        <button class="icon-btn" type="button" data-action="assistant-toggle-context" aria-label="Close context">${icon("x")}</button>
      </div>

      <section class="context-block">
        <div class="context-block__head">
          <span>AI access</span>
          <b>${escapeHtml(permission.label)}</b>
        </div>
        <p>${escapeHtml(permission.description)}</p>
        <div class="permission-meter">
          ${AI_PERMISSION_MODES.map((entry) => `<span class="${entry.id === mode ? "is-active" : ""}">${escapeHtml(entry.shortLabel)}</span>`).join("")}
        </div>
        <small>${allowed} of ${tools.length} tools available to the model</small>
      </section>

      <section class="context-block">
        <div class="context-block__head">
          <span>Workspace snapshot</span>
          <b>~${formatNumber(contextTokenEstimate())} tokens</b>
        </div>
        <div class="context-grid">
          ${contextSections().map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value))}</b></div>`).join("")}
        </div>
      </section>

      <section class="context-block">
        <div class="context-block__head">
          <span>Tool access</span>
          <b>${allowed} enabled</b>
        </div>
        <div class="tool-groups">
          ${groups.map(([group, entries]) => `
            <details>
              <summary><span>${escapeHtml(group)}</span><b>${entries.filter((tool) => permissionAllows(tool, mode)).length}/${entries.length}</b></summary>
              <div class="tool-list">
                ${entries.map((tool) => `
                  <div class="${permissionAllows(tool, mode) ? "" : "is-disabled"}">
                    <span>${dot(permissionAllows(tool, mode) ? "green" : "")}<code>${escapeHtml(tool.name)}</code></span>
                    <small>${escapeHtml(tool.summary)}</small>
                  </div>
                `).join("")}
              </div>
            </details>
          `).join("")}
        </div>
      </section>
    </aside>
  `;
}

function emptyConversation() {
  const ready = providerReady();
  const permission = permissionDefinition();
  return `
    <div class="assistant-welcome">
      <div class="assistant-welcome__mark">${icon("sparkle")}</div>
      <span class="eyebrow">Operations AI</span>
      <h2>What should we move forward?</h2>
      <p>${ready
        ? `The assistant has live workspace context and ${escapeHtml(permission.label.toLowerCase())}.`
        : "Connect a model for natural-language work. Direct commands still run without one."}</p>
    </div>

    <div class="prompt-grid">
      ${EXAMPLES.map((example) => `
        <button class="prompt-card" type="button" data-action="assistant-suggest" data-text="${escapeHtml(example.text)}">
          <span>${escapeHtml(example.label)}</span>
          <p>${escapeHtml(example.text)}</p>
          ${icon("arrow-right")}
        </button>
      `).join("")}
    </div>

    <div class="command-strip">
      <span>Direct commands</span>
      <div>
        ${COMMAND_HINTS.slice(0, 6).map((hint) => `<button type="button" data-action="assistant-suggest" data-text="${escapeHtml(hint.command)}"><code>${escapeHtml(hint.command)}</code></button>`).join("")}
      </div>
    </div>
  `;
}

function modelSwitcher() {
  const { model, effort } = activeModel();
  const options = modelsForProvider(model?.provider || "anthropic")
    .map((entry) => ({ value: entry.id, label: `${entry.label} · ${formatPerMTok(entry)}` }));

  return `
    ${select("model", options, model?.id, { attrs: 'data-action="model-select" class="select-sm model-select" aria-label="AI model"' })}
    ${model?.supportsEffort
      ? select("effort", EFFORT_LEVELS.map((level) => ({ value: level.id, label: `${level.label} effort` })), effort, { attrs: 'data-action="effort-select" class="select-sm effort-select" aria-label="Reasoning effort"' })
      : ""}
  `;
}

export function renderAssistant() {
  const { assistant, data } = getState();
  const ready = providerReady();
  const conversations = data.assistantConversations || [];
  const permission = permissionDefinition();
  const activeConversation = conversations.find((conversation) => String(conversation.id) === String(assistant.activeConversationId));

  return `
    <div class="assistant-shell${assistant.contextOpen ? " has-context" : ""}">
      ${conversationRail(conversations, assistant.activeConversationId)}

      <section class="chat">
        <header class="chat__bar">
          <div class="chat__mobile-conversations">
            ${conversations.length ? select(
              "conversation",
              conversations.map((conversation) => ({ value: conversation.id, label: conversation.title || "Untitled" })),
              assistant.activeConversationId,
              { attrs: 'data-action="assistant-conversation" class="select-sm"', placeholder: "New conversation" },
            ) : ""}
          </div>
          <div class="chat__identity">
            <div class="chat__identity-mark">${icon("sparkle")}</div>
            <div>
              <strong>${escapeHtml(activeConversation?.title || "New conversation")}</strong>
              <span>${ready ? "Connected and ready" : "Direct commands available"}</span>
            </div>
          </div>
          <div class="chat__controls">
            ${accessControl()}
            ${ready ? modelSwitcher() : ""}
            <button class="context-chip${assistant.contextOpen ? " is-active" : ""}" type="button" data-action="assistant-toggle-context">
              ${icon("layers")}<span>Context</span>
            </button>
            ${assistant.activeConversationId ? btn("", { action: "assistant-delete", iconName: "trash", size: "sm", variant: "quiet", attrs: 'aria-label="Delete conversation"' }) : ""}
          </div>
        </header>

        <div class="chat__status">
          <span>${dot(ready ? "green" : "")} ${escapeHtml(ready ? "Model replies enabled" : "Model replies disabled")}</span>
          <span class="permission-status permission-status--${escapeHtml(permission.id)}">${icon("lock")} ${escapeHtml(permission.label)}</span>
          <span>${escapeHtml(permission.description)}</span>
        </div>

        <div class="chat__scroll" id="chat-scroll">
          <div class="chat__inner">
            ${assistant.messages.length ? assistant.messages.map(messageBlock).join("") : emptyConversation()}
            ${assistant.pending ? `
              <article class="msg msg--assistant msg--pending">
                <div class="msg__avatar">${icon("sparkle")}</div>
                <div class="msg__content">
                  <span class="msg__who">Operations AI</span>
                  <div class="thinking"><i></i><i></i><i></i><span>Working through the workspace</span></div>
                </div>
              </article>
            ` : ""}
          </div>
        </div>

        <div class="chat__composer">
          <form class="composer" data-form="assistant">
            <div class="composer__box">
              <textarea name="message" id="assistant-input" rows="1" placeholder="Ask about the business or tell the AI what to do"></textarea>
              <button class="composer__send" type="submit" aria-label="Send">${icon("arrow-right")}</button>
            </div>
            <div class="composer__foot">
              <span>${icon("lock")} ${escapeHtml(permission.shortLabel)} access · ${escapeHtml(contextSummary())}</span>
              <span>Enter to send · Shift+Enter for a new line</span>
            </div>
          </form>
        </div>
      </section>

      ${assistant.contextOpen ? contextPanel() : ""}
    </div>
  `;
}

/** Post-render behaviour: keep the latest message in view, size the composer. */
export function mountAssistant() {
  const scroll = document.getElementById("chat-scroll");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;

  const input = document.getElementById("assistant-input");
  if (!input) return;
  const resize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(200, input.scrollHeight)}px`;
  };
  input.addEventListener("input", resize);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      input.closest("form")?.requestSubmit();
    }
  });
  if (window.matchMedia("(min-width: 900px)").matches) input.focus();
}
