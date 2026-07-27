/**
 * AI Assistant — a full-page workspace built around having access to the whole
 * operations system. Context, tools and commands work today; replies wait for a
 * provider, and the page says so plainly instead of faking one.
 */
import { getState } from "../core/state.js";
import { escapeHtml, formatNumber } from "../core/utils.js";
import { advanced, btn, dot, icon, notice, select } from "../components/ui.js";
import { COMMAND_HINTS } from "../services/ai/commands.js";
import { contextSections, contextSummary, contextTokenEstimate } from "../services/ai/context.js";
import { activeModel, providerReady } from "../services/ai/provider.js";
import { EFFORT_LEVELS, formatPerMTok, modelsForProvider } from "../data/models.js";
import { toolGroups } from "../services/ai/tools.js";

const EXAMPLES = [
  "Which leads should I contact next?",
  "What needs my attention?",
  "What happened today?",
  "How much revenue did I make this week?",
  "Which template should I use for Ironwood Electric?",
];

function messageBlock(message) {
  if (message.role === "user") {
    return `<div class="msg msg--user"><span class="msg__who">You</span><div class="msg__body">${escapeHtml(message.text)}</div></div>`;
  }
  if (message.role === "tool") {
    const result = message.result || {};
    return `
      <div class="msg msg--system">
        <span class="msg__who">Command · ${escapeHtml(message.tool)}</span>
        <div class="tool-call">${icon("tool")}<code>${escapeHtml(message.tool)}()</code></div>
        <div class="msg__body">${escapeHtml(result.summary || result.error || "Done.")}</div>
      </div>
    `;
  }
  return `
    <div class="msg msg--system${message.blocked ? " msg--blocked" : ""}">
      <span class="msg__who">${escapeHtml(message.who || "Operations")}</span>
      <div class="msg__body">${escapeHtml(message.text)}</div>
    </div>
  `;
}

function contextPanel() {
  return `
    <div class="stack--tight" style="padding:16px var(--gutter) 0">
      ${notice(
        "What the assistant can see",
        `A structured snapshot of the workspace is built on every turn — about ${formatNumber(contextTokenEstimate())} tokens.`,
        { iconName: "info" },
      )}
      <div class="context-grid">
        ${contextSections().map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value))}</b></div>`).join("")}
      </div>
      ${advanced(`Tools it can call (${toolGroups().reduce((total, [, tools]) => total + tools.length, 0)})`, toolGroups().map(([group, tools]) => `
        <div>
          <p class="faint" style="margin-bottom:8px">${escapeHtml(group)}</p>
          <div class="tool-list">
            ${tools.map((tool) => `<div><code>${escapeHtml(tool.name)}</code><p>${escapeHtml(tool.summary)}</p></div>`).join("")}
          </div>
        </div>
      `).join(""))}
    </div>
  `;
}

function emptyConversation() {
  return `
    <div class="stack">
      ${notice(
        providerReady() ? "Provider connected" : "No AI provider connected yet",
        providerReady()
          ? "Ask anything about the workspace."
          : "Replies need an OpenAI or Anthropic connection. Until then, the commands below run real operations with no model involved.",
        { tone: providerReady() ? "" : "warn", iconName: "sparkle" },
      )}
      <div class="section">
        <div class="section__head"><div class="section__title"><h3>Commands that work now</h3></div></div>
        <div class="suggestions">
          ${COMMAND_HINTS.map((hint) => `<button class="suggestion" type="button" data-action="assistant-suggest" data-text="${escapeHtml(hint.command)}"><code>${escapeHtml(hint.command)}</code> — ${escapeHtml(hint.detail)}</button>`).join("")}
        </div>
      </div>
      <div class="section">
        <div class="section__head"><div class="section__title"><h3>What it will answer once connected</h3></div></div>
        <div class="suggestions">
          ${EXAMPLES.map((example) => `<button class="suggestion" type="button" data-action="assistant-suggest" data-text="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join("")}
        </div>
      </div>
    </div>
  `;
}

/**
 * Model and effort, switchable without leaving the conversation. Cost is on the
 * label so the expensive choice is never the invisible one.
 */
function modelSwitcher() {
  const { model, effort } = activeModel();
  const options = modelsForProvider(model?.provider || "anthropic")
    .map((entry) => ({ value: entry.id, label: `${entry.label} · ${formatPerMTok(entry)}` }));

  return `
    ${select("model", options, model?.id, { attrs: 'data-action="model-select" class="select-sm"' })}
    ${model?.supportsEffort
      ? select("effort", EFFORT_LEVELS.map((level) => ({ value: level.id, label: `${level.label} effort` })), effort, { attrs: 'data-action="effort-select" class="select-sm"' })
      : ""}
  `;
}

export function renderAssistant() {
  const { assistant } = getState();
  const ready = providerReady();

  return `
    <div class="chat">
      <div class="chat__bar">
        <span class="pill${ready ? " pill--green" : ""}">${ready ? "Provider connected" : "Provider not connected"}</span>
        ${ready ? modelSwitcher() : ""}
        <button class="context-chip" type="button" data-action="assistant-toggle-context">
          ${icon("layers")} Context: ${escapeHtml(contextSummary())} ${icon(assistant.contextOpen ? "chevron-down" : "chevron")}
        </button>
        <span class="toolbar__spacer"></span>
        ${assistant.messages.length ? btn("Clear", { action: "assistant-clear", size: "sm" }) : ""}
      </div>

      ${assistant.contextOpen ? contextPanel() : ""}

      <div class="chat__scroll" id="chat-scroll">
        <div class="chat__inner">
          ${assistant.messages.length ? assistant.messages.map(messageBlock).join("") : emptyConversation()}
          ${assistant.pending ? `<div class="msg msg--system"><span class="msg__who">Working</span><div class="msg__body"><span class="spin"></span></div></div>` : ""}
        </div>
      </div>

      <div class="chat__composer">
        <form class="composer" data-form="assistant">
          <div class="composer__box">
            <textarea name="message" id="assistant-input" rows="1" placeholder="Ask about the business, or type go to start outreach"></textarea>
            <button class="composer__send" type="submit" aria-label="Send">${icon("arrow-right")}</button>
          </div>
          <div class="composer__foot">
            <span>${dot(ready ? "green" : "")} ${escapeHtml(ready ? "Model replies enabled" : "Commands run locally · model replies disabled")}</span>
            <span>Enter to send · Shift+Enter for a new line</span>
          </div>
        </form>
      </div>
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
