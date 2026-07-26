/**
 * Website Studio.
 *
 * The preview dominates: it renders the demo's real index.html/style.css/
 * script.js in a sandboxed frame. The right panel is the AI editing surface
 * (chat, proposed change, apply/revert) and manual editing is either the file
 * editor or the small Site details drawer.
 */
import { getState } from "../core/state.js";
import { escapeHtml, formatNumber, relativeTime } from "../core/utils.js";
import { btn, empty, field, icon, input, notice, pill, section } from "../components/ui.js";
import { BUNDLE_FILES, composeDocument } from "../services/sites/bundle.js";
import { providerReady } from "../services/ai/provider.js";
import { byId, leadName } from "./shared.js";

const REQUESTS = [
  "Make the hero image bigger",
  "Emphasise emergency work",
  "Show their Google rating near the top",
  "Make the mobile layout cleaner",
  "Change the CTA to call now",
  "Make this feel more premium",
];

export function selectedDemo() {
  const { data, routeParams } = getState();
  return byId(data.demos, routeParams.demo) || data.demos[0] || null;
}

export function currentFiles(demo) {
  const { studio } = getState();
  return studio.draftFiles || demo?.content?.files || {};
}

/** Common prefix/suffix trim, then show the changed block. Readable and cheap. */
export function lineDiff(before = "", after = "") {
  const from = String(before).split("\n");
  const to = String(after).split("\n");
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start += 1;
  let end = 0;
  while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end += 1;
  return {
    removed: from.slice(start, from.length - end),
    added: to.slice(start, to.length - end),
    contextStart: start,
    unchanged: from.length - (from.length - end - start),
  };
}

function diffView(change) {
  const files = Object.keys(change.files || {});
  const primary = change.primaryFile || files[0];
  const diff = lineDiff(change.before?.[primary] || "", change.files?.[primary] || "");
  const lines = [
    ...diff.removed.slice(0, 40).map((line) => ({ kind: "del", line })),
    ...diff.added.slice(0, 40).map((line) => ({ kind: "add", line })),
  ];

  return `
    <div class="stack--tight">
      <div class="diff">
        <div class="diff__head"><span>${escapeHtml(primary)}</span><span>${diff.removed.length} − / ${diff.added.length} +</span></div>
        <div class="diff__body">
          ${lines.length
            ? lines.map((entry) => `<div class="diff__line diff__line--${entry.kind}">${entry.kind === "add" ? "+" : "−"} ${escapeHtml(entry.line)}</div>`).join("")
            : `<div class="diff__line">No textual change.</div>`}
        </div>
      </div>
      ${files.length > 1 ? `<p class="faint">Also changes ${escapeHtml(files.filter((file) => file !== primary).join(", "))}.</p>` : ""}
      <div class="btn-row">
        ${btn("Apply", { action: "studio-apply-change", variant: "primary", size: "sm" })}
        ${btn("Discard", { action: "studio-discard-change", size: "sm" })}
      </div>
    </div>
  `;
}

function aiPanel(demo) {
  const { studio } = getState();
  const ready = providerReady();

  return `
    <div class="studio__side">
      <div class="studio__side-head">
        <strong>Edit with AI</strong>
        <span class="pill${ready ? " pill--green" : ""}">${ready ? "Connected" : "Not connected"}</span>
      </div>
      <div class="studio__side-body">
        ${studio.pendingChange ? section("Proposed change", { subtitle: studio.pendingChange.summary, body: diffView(studio.pendingChange) }) : ""}

        ${studio.messages.length ? `<div class="stack--tight">
          ${studio.messages.map((message) => `
            <div class="msg msg--${message.role === "user" ? "user" : "system"}${message.blocked ? " msg--blocked" : ""}">
              <span class="msg__who">${escapeHtml(message.role === "user" ? "You" : "Studio")}</span>
              <div class="msg__body">${escapeHtml(message.text)}</div>
            </div>
          `).join("")}
        </div>` : ""}

        ${!studio.pendingChange && !studio.messages.length ? (ready
          ? empty({ title: "Describe a change", message: "Ask for a layout, copy or emphasis change and review the diff before it is applied." })
          : notice(
            "No AI provider connected",
            "Requests are recorded but not answered. Connect a provider to get real edits — the diff, apply and revert flow already works.",
            { tone: "warn", iconName: "sparkle" },
          )) : ""}

        <div class="section">
          <div class="section__head"><div class="section__title"><h3>Quick requests</h3></div></div>
          <div class="suggestions">
            ${REQUESTS.map((request) => `<button class="suggestion" type="button" data-action="studio-suggest" data-text="${escapeHtml(request)}">${escapeHtml(request)}</button>`).join("")}
          </div>
        </div>

        ${section("Manual", {
          body: `<div class="btn-row">
            ${btn("Site details", { action: "studio-details", iconName: "file", size: "sm" })}
            ${btn("Rebuild from template", { action: "studio-rebuild", iconName: "refresh", size: "sm" })}
            ${demo?.content?.custom_edited ? pill("warning", "Has manual edits") : ""}
          </div>`,
        })}
      </div>
      <div class="studio__side-foot">
        <form class="composer" data-form="studio-ai" data-demo-id="${demo?.id || ""}">
          <div class="composer__box">
            <textarea name="message" id="studio-input" rows="1" placeholder="Describe a change…"></textarea>
            <button class="composer__send" type="submit" aria-label="Send">${icon("arrow-right")}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderStudio() {
  const { data, studio } = getState();
  const demo = selectedDemo();

  if (!demo) {
    return `
      <div class="page" style="padding:26px var(--gutter)">
        ${empty({
          title: "No demo to edit",
          message: "Automation builds demos on its own. Build one manually from a lead when you want to review it here.",
          action: "navigate",
          actionLabel: "Open Leads",
          actionAttrs: 'data-route-target="leads"',
          center: true,
        })}
      </div>
    `;
  }

  const files = currentFiles(demo);
  const document_ = composeDocument(files);
  const hosted = demo.content?.publish?.hosted;

  return `
    <div class="studio">
      <div class="studio__main">
        <div class="studio__bar">
          <select class="select-sm" data-action="studio-demo" aria-label="Demo">
            ${data.demos.map((item) => `<option value="${item.id}"${item.id === demo.id ? " selected" : ""}>${escapeHtml(leadName(data, item.lead_id))}</option>`).join("")}
          </select>
          <div class="tabs">
            <button class="tab${studio.view === "preview" ? " is-active" : ""}" type="button" data-action="studio-view" data-value="preview">Preview</button>
            <button class="tab${studio.view === "code" ? " is-active" : ""}" type="button" data-action="studio-view" data-value="code">Code</button>
          </div>
          ${studio.view === "code" ? `<div class="file-tabs">
            ${BUNDLE_FILES.map((file) => `<button class="file-tab${studio.file === file ? " is-active" : ""}" type="button" data-action="studio-file" data-value="${file}">${file}</button>`).join("")}
          </div>` : `<div class="tabs">
            <button class="tab${studio.viewport === "desktop" ? " is-active" : ""}" type="button" data-action="studio-viewport" data-value="desktop" aria-label="Desktop preview">${icon("monitor")}</button>
            <button class="tab${studio.viewport === "mobile" ? " is-active" : ""}" type="button" data-action="studio-viewport" data-value="mobile" aria-label="Mobile preview">${icon("smartphone")}</button>
          </div>`}
          <span class="toolbar__spacer"></span>
          ${btn("", { action: "studio-refresh", iconName: "refresh", size: "sm", attrs: 'aria-label="Refresh preview"' })}
          ${btn("Open", { action: "studio-open-tab", iconName: "external", size: "sm" })}
          ${btn(hosted ? "Update" : "Publish", { action: "studio-publish", iconName: "upload", variant: "primary", size: "sm" })}
        </div>

        <div class="studio__stage">
          ${studio.view === "code" ? `
            <form class="stack--tight" style="width:100%;height:100%;display:flex;flex-direction:column" data-form="studio-file" data-demo-id="${demo.id}" data-file="${escapeHtml(studio.file)}">
              <textarea class="code-editor" name="source" spellcheck="false" aria-label="${escapeHtml(studio.file)} source">${escapeHtml(files[studio.file] || "")}</textarea>
              <div class="btn-row">
                ${btn("Save file", { type: "submit", variant: "primary", size: "sm" })}
                ${btn("Revert to template", { action: "studio-rebuild", size: "sm" })}
                ${btn("Download bundle", { action: "demo-download", size: "sm", attrs: `data-id="${demo.id}"` })}
                <span class="faint">${escapeHtml(studio.file)} · ${formatNumber((files[studio.file] || "").length)} characters</span>
              </div>
            </form>
          ` : `
            <div class="frame${studio.viewport === "mobile" ? " frame--mobile" : ""}">
              <iframe title="Website preview" sandbox="allow-scripts allow-popups" srcdoc="${escapeHtml(document_)}"></iframe>
            </div>
          `}
        </div>
      </div>

      ${aiPanel(demo)}
    </div>
  `;
}

export function siteDetailsForm(demo) {
  const site = demo?.content?.site || {};
  const business = demo?.business_info || {};
  return `
    <form class="stack--tight" data-form="studio-details" data-demo-id="${demo.id}">
      <div class="field-grid">
        ${field("Business name", input("business", site.business || business.name || ""))}
        ${field("Phone", input("phone", site.phone || business.phone || ""))}
        ${field("Email", input("email", site.email || business.email || "", { type: "email" }))}
        ${field("Address", input("address", site.address || business.address || ""))}
        ${field("Primary CTA", input("cta", site.cta || business.cta || ""))}
        ${field("Hours", input("hours", site.hours || business.hours || ""))}
      </div>
      ${demo?.content?.custom_edited ? notice("This demo has manual code edits", "Saving details rebuilds the site from its template and replaces those edits.", { tone: "warn", iconName: "alert" }) : ""}
      <div class="btn-row">
        ${btn("Save and rebuild", { type: "submit", variant: "primary" })}
        ${btn("Cancel", { action: "close-drawer" })}
      </div>
    </form>
  `;
}

export function publishSummary(demo) {
  const publish = demo?.content?.publish;
  if (!publish) return "Not published yet.";
  return `${publish.url} · ${publish.hosted ? "hosted" : "not hosted"} · ${relativeTime(publish.at)}`;
}

export function mountStudio() {
  const input_ = document.getElementById("studio-input");
  if (!input_) return;
  input_.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      input_.closest("form")?.requestSubmit();
    }
  });
}
