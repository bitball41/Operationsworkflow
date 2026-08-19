/**
 * Outreach, Inbox and Follow-Ups.
 *
 * Drafting is instant and uses the standard offer. States are explicit:
 * draft -> ready -> sent, with failed kept separate.
 */
import { CONFIG, REPLY_CLASSIFICATIONS } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatNumber, isToday, relativeTime, statusLabel } from "../core/utils.js";
import {
  btn,
  empty,
  externalLink,
  field,
  healthDot,
  input,
  notice,
  pageHeader,
  pill,
  section,
  select,
  stats,
  table,
  td,
  textarea,
} from "../components/ui.js";
import { canSend, draftOutreach } from "../services/email/outreach.js";
import { canReadOutlookMail, outlookBlocker } from "../services/integrations.js";
import { attentionItems } from "../services/operations.js";
import { preferences } from "../services/data.js";
import { byId, demoForLead, filterSelect, leadName, searchInput, viewTabs } from "./shared.js";

/* ---------- outreach ---------- */

export function renderOutreach() {
  const { data, routeParams } = getState();
  const settings = preferences();
  const view = routeParams.view || "ready";
  const candidates = data.leads.filter((lead) => !["won", "lost"].includes(lead.status));
  const selectedLead = byId(data.leads, routeParams.lead)
    || candidates.find((lead) => demoForLead(data, lead.id))
    || candidates[0]
    || null;
  const demo = selectedLead ? demoForLead(data, selectedLead.id) : null;
  const price = Number(selectedLead?.quoted_setup_fee) || Number(settings.default_setup_fee) || CONFIG.defaultSetupFee;
  const copy = draftOutreach({ lead: selectedLead, demo, price, owner: settings.owner_name });

  const queue = data.drafts.filter((draft) => {
    if (view === "all") return true;
    if (view === "sent") return draft.status === "sent";
    if (view === "failed") return draft.status === "failed";
    if (view === "ready") return ["ready", "approved", "pending_approval", "scheduled"].includes(draft.status);
    return draft.status === "draft";
  });

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["Draft", formatNumber(data.drafts.filter((item) => item.status === "draft").length)],
          ["Ready to send", formatNumber(data.drafts.filter((item) => ["ready", "approved"].includes(item.status)).length)],
          ["Sent today", formatNumber(data.drafts.filter((item) => item.status === "sent" && isToday(item.sent_at)).length)],
          ["Sent total", formatNumber(data.drafts.filter((item) => item.status === "sent").length)],
        ]),
      })}

      ${canSend() ? "" : notice(
        "Outlook is not connected",
        "Drafts, links and states are real. The send button will tell you it is blocked rather than marking anything as sent.",
        { iconName: "mail", actions: btn("Connect", { action: "navigate", attrs: 'data-route-target="integrations"', size: "sm" }) },
      )}

      ${section("Compose", {
        subtitle: "The standard offer, addressed to a lead",
        actions: `
          ${btn("Email anyone", { action: "email-new", iconName: "mail", size: "sm" })}
          ${btn("Prepare a batch", { action: "outreach-batch", iconName: "layers", size: "sm" })}
        `,
        body: selectedLead ? `
          <form class="stack--tight" data-form="outreach" data-lead-id="${selectedLead.id}">
            <div class="field-grid">
              ${field("Lead", select("lead_id", candidates.map((lead) => ({ value: lead.id, label: lead.business_name })), selectedLead.id, { attrs: 'data-action="outreach-lead"' }))}
              ${field("Activation fee", input("price", price, { type: "number", attrs: 'min="2500" max="2500" step="50" readonly' }))}
              ${field("Demo", demo
                ? `<div class="row" style="padding:0;border:0">${externalLink(demo.preview_url, demo.preview_url ? "Preview link" : "Not published")}${demo.content?.publish?.hosted ? "" : `<span class="pill">not hosted</span>`}</div>`
                : btn("Build a demo first", { action: "demo-build", attrs: `data-lead-id="${selectedLead.id}"`, size: "sm" }))}
            </div>
            ${field("Subject", input("subject", copy.subject, { required: true }))}
            ${field("Body", textarea("body", copy.body, { required: true, attrs: 'rows="14"' }))}
            <div class="btn-row">
              ${btn("Save as draft", { type: "submit", attrs: 'data-mode="draft"' })}
              ${btn("Save as ready", { type: "submit", attrs: 'data-mode="ready"' })}
              ${btn(canSend() ? "Send now" : "Try send", { type: "submit", variant: "primary", iconName: "send", attrs: 'data-mode="send"' })}
            </div>
          </form>
        ` : empty({
          title: "No leads to write to",
          message: "Save leads from Lead Discovery first.",
          action: "navigate",
          actionLabel: "Open Lead Discovery",
          actionAttrs: 'data-route-target="discovery"',
        }),
      })}

      ${section("Queue", {
        actions: viewTabs("view", [["draft", "Draft"], ["ready", "Ready"], ["sent", "Sent"], ["failed", "Failed"], ["all", "All"]], view),
        body: table({
          columns: ["Lead", "Subject", "Kind", "Status", "Updated", ""],
          rows: queue.map((draft) => `<tr>
            ${td("Lead", `<div class="cell"><strong>${escapeHtml(leadName(data, draft.lead_id))}</strong><span>${escapeHtml(byId(data.leads, draft.lead_id)?.email || "No email on file")}</span></div>`)}
            ${td("Subject", escapeHtml(draft.subject))}
            ${td("Kind", escapeHtml(statusLabel(draft.kind)))}
            ${td("Status", `${pill(draft.status)}${draft.error_message && draft.status !== "sent" ? `<span class="faint"> ${escapeHtml(draft.error_message)}</span>` : ""}`)}
            ${td("Updated", relativeTime(draft.sent_at || draft.updated_at))}
            ${td("", `<span class="cell-actions">
              ${draft.status === "sent" ? "" : btn("Send", { action: "draft-send", size: "sm", attrs: `data-id="${draft.id}"` })}
              ${btn("Open", { action: "draft-open", size: "sm", attrs: `data-id="${draft.id}"` })}
            </span>`)}
          </tr>`),
          emptyState: empty({ title: `Nothing in ${view}`, message: "Compose above or let automation prepare a batch." }),
        }),
      })}
    </div>
  `;
}

/* ---------- inbox ---------- */

export function renderInbox() {
  const { data, routeParams } = getState();
  const inboxBlocker = outlookBlocker()
    || (canReadOutlookMail() ? "" : "This Outlook connection can send but not read. Disconnect and reconnect it from Integrations to grant Mail.Read.");
  const query = (routeParams.q || "").toLowerCase();
  const classification = routeParams.classification || "all";
  const threads = data.emailThreads
    .filter((thread) => (classification === "all" || thread.classification === classification))
    .filter((thread) => !query || `${thread.sender_name} ${thread.subject} ${thread.sender_email}`.toLowerCase().includes(query));
  const selected = byId(data.emailThreads, routeParams.thread) || threads[0] || null;
  const lead = selected ? byId(data.leads, selected.lead_id) : null;
  const demo = lead ? demoForLead(data, lead.id) : null;
  const messages = selected
    ? data.emails.filter((email) => String(email.thread_id) === String(selected.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];

  return `
    <div class="stack">
      ${pageHeader({
        title: "Inbox",
        subtitle: "Human review: replies, overdue follow-ups, and items that need a decision. Activity is history.",
        actions: btn("Sync inbox", { action: "inbox-sync", iconName: "refresh", variant: "primary", attrs: inboxBlocker ? "disabled" : "" }),
      })}
      ${inboxBlocker ? notice("Inbox cannot sync yet", inboxBlocker, { tone: "warn", iconName: "inbox" }) : ""}
      ${section("Needs review", {
        count: attentionItems().length,
        body: attentionItems().length ? `<div class="attention-list">${attentionItems().slice(0, 8).map((item) => `
          <div class="attention-item">
            ${healthDot(item.tone || "amber")}
            <div class="attention-item__copy">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.detail || "")}</span>
            </div>
            <div class="attention-item__meta">
              ${item.at ? `<span class="faint">${relativeTime(item.at)}</span>` : ""}
              ${btn("Open", {
                action: "navigate",
                size: "sm",
                attrs: `data-route-target="${item.route}"${item.params ? ` data-route-params="${escapeHtml(JSON.stringify(item.params))}"` : ""}`,
              })}
            </div>
          </div>
        `).join("")}</div>` : empty({ title: "Review queue is clear", message: "Unread replies, overdue follow-ups, and agent issues land here." }),
      })}

      <div class="toolbar">
        ${searchInput("Search replies", routeParams.q || "")}
        ${filterSelect("classification", REPLY_CLASSIFICATIONS.map((value) => ({ value, label: statusLabel(value) })), classification, "All replies")}
        <span class="toolbar__spacer"></span>
        <span class="faint">${formatNumber(data.emailThreads.filter((thread) => thread.is_unread).length)} unread</span>
      </div>

      <div class="inbox">
        <div class="thread-list">
          ${threads.map((thread) => `
            <button class="thread${selected?.id === thread.id ? " is-active" : ""}${thread.is_unread ? " is-unread" : ""}" type="button" data-action="thread-open" data-id="${thread.id}">
              <span class="thread__top"><strong>${escapeHtml(thread.sender_name || "Unknown")}</strong><time>${relativeTime(thread.last_message_at)}</time></span>
              <p>${escapeHtml(thread.subject || "(no subject)")}</p>
              <span>${pill(thread.classification)}</span>
            </button>
          `).join("") || empty({
            title: "No replies",
            message: inboxBlocker || "Nothing new. Sync the inbox to pull the latest messages from Outlook.",
          })}
        </div>

        <div class="stack">
          ${selected ? `
            ${section(selected.subject || "(no subject)", {
              subtitle: `${selected.sender_name || ""} · ${selected.sender_email || ""}`,
              actions: `
                <select class="select-sm" data-action="thread-classify" data-id="${selected.id}" aria-label="Classification">
                  ${REPLY_CLASSIFICATIONS.map((value) => `<option value="${value}"${selected.classification === value ? " selected" : ""}>${statusLabel(value)}</option>`).join("")}
                </select>
                ${lead ? btn("Open lead", { action: "lead-open", size: "sm", attrs: `data-id="${lead.id}"` }) : ""}
              `,
              body: `
                ${selected.ai_summary ? `<p class="lead">${escapeHtml(selected.ai_summary)}</p>` : ""}
                <div class="stack--tight">
                  ${messages.map((message) => `
                    <article class="bubble${message.direction === "outbound" ? " bubble--outbound" : ""}">
                      <header><strong>${escapeHtml(message.direction === "outbound" ? "Me" : selected.sender_name || "Them")}</strong><time>${relativeTime(message.sent_at || message.received_at || message.created_at)}</time></header>
                      <p>${escapeHtml(message.body)}</p>
                    </article>
                  `).join("") || `<p class="faint">No stored messages in this thread.</p>`}
                </div>
              `,
            })}
            <form class="stack--tight" data-form="reply" data-thread-id="${selected.id}" data-lead-id="${selected.lead_id || ""}">
              ${field("Reply", textarea("body", "", { placeholder: "Write a reply…", required: true, attrs: 'rows="5"' }))}
              <div class="btn-row">
                ${demo ? externalLink(demo.preview_url, "Attached demo") : `<span class="faint">No demo attached</span>`}
                <span class="toolbar__spacer"></span>
                ${btn("Save reply as ready", { type: "submit", variant: "primary" })}
              </div>
            </form>
          ` : empty({ title: "Select a conversation", message: "Thread detail and reply tools appear here.", center: true })}
        </div>
      </div>
    </div>
  `;
}

/* ---------- follow-ups ---------- */

function followUpView(item, view) {
  const done = ["sent", "replied", "completed", "dead", "skipped", "cancelled"].includes(item.status);
  if (view === "done") return done;
  if (done) return false;
  const due = new Date(item.due_at);
  if (view === "overdue") return due < new Date() && !isToday(item.due_at);
  if (view === "today") return isToday(item.due_at) || item.status === "due";
  return due > new Date() && !isToday(item.due_at);
}

export function renderFollowUps() {
  const { data, routeParams } = getState();
  const view = routeParams.view || "overdue";
  const counts = Object.fromEntries(["overdue", "today", "upcoming", "done"].map((key) => [key, data.followUps.filter((item) => followUpView(item, key)).length]));
  const items = data.followUps.filter((item) => followUpView(item, view));

  return `
    <div class="stack">
      <div class="toolbar">
        ${viewTabs("view", [
          ["overdue", `Overdue · ${counts.overdue}`],
          ["today", `Today · ${counts.today}`],
          ["upcoming", `Upcoming · ${counts.upcoming}`],
          ["done", `Done · ${counts.done}`],
        ], view)}
        <span class="toolbar__spacer"></span>
        ${btn("Schedule follow-up", { action: "followup-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${table({
        columns: ["Business", "Attempt", "Sent", "Due", "Status", ""],
        rows: items.map((item) => {
          const lead = byId(data.leads, item.lead_id);
          return `<tr>
            ${td("Business", `<div class="cell"><strong>${escapeHtml(lead?.business_name || "Unknown lead")}</strong><span>${escapeHtml(lead?.email || lead?.phone || "No contact details")}</span></div>`)}
            ${td("Attempt", `#${Number(item.sequence_number || 1)}`)}
            ${td("Sent", lead?.last_contacted_at ? relativeTime(lead.last_contacted_at) : "Never")}
            ${td("Due", relativeTime(item.due_at))}
            ${td("Status", pill(item.status))}
            ${td("", `<span class="cell-actions">
              ${btn("Draft", { action: "followup-draft", size: "sm", attrs: `data-id="${item.id}"` })}
              ${btn("Snooze", { action: "followup-snooze", size: "sm", attrs: `data-id="${item.id}"` })}
              ${btn("Replied", { action: "followup-status", size: "sm", attrs: `data-id="${item.id}" data-status="replied"` })}
              ${btn("Dead", { action: "followup-status", size: "sm", attrs: `data-id="${item.id}" data-status="dead"` })}
            </span>`)}
          </tr>`;
        }),
        emptyState: empty({
          title: `No ${view} follow-ups`,
          message: view === "overdue" ? "Nothing is late. " : "Every sent email can create one automatically.",
        }),
      })}
    </div>
  `;
}
