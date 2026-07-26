import { OUTREACH_BODY } from "../config.js";
import { pageHead } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml, relativeTime } from "../core/utils.js";
import {
  badge,
  button,
  byId,
  compactMetric,
  demoForLead,
  dueLabel,
  formatDate,
  icon,
  leadName,
  linkOut,
  primaryCell,
  sectionCard,
  statusLabel,
  tableEmpty,
} from "./shared.js";

const CLASSIFICATIONS = [
  "unread",
  "interested",
  "maybe",
  "not_interested",
  "needs_changes",
  "price_objection",
  "follow_up_later",
  "wrong_person",
  "other",
];

function personalizeBody(lead, demo, amount = 400) {
  return OUTREACH_BODY
    .replaceAll("[Business Name]", lead?.business_name || "[Business Name]")
    .replaceAll("[link]", demo?.preview_url || "[preview link]")
    .replace("$400", `$${Number(amount || 400)}`);
}

export function renderOutreach() {
  const { data, routeParams } = getState();
  const available = data.leads.filter((lead) => !["lost", "won"].includes(lead.status));
  const selectedLead = byId(data.leads, routeParams.lead) || available.find((lead) => demoForLead(data, lead.id)) || available[0];
  const demo = selectedLead ? demoForLead(data, selectedLead.id) : null;
  const amount = selectedLead?.deal_value || selectedLead?.asking_price || data.profile?.preferences?.default_site_price || 400;
  const pendingApprovals = data.approvals.filter((item) => item.approval_type === "email_send" && item.status === "pending").length;
  const sent = data.drafts.filter((draft) => draft.status === "sent");

  return `
    ${pageHead("Outreach", "Prepare personalized outbound email beside the lead and demo context. Sending remains approval-gated.", button("Batch prepare", { action: "batch-outreach", iconName: "send", variant: "secondary" }))}
    <div class="placeholder-banner">${icon("paperclip")}<div><strong>Gmail is not connected yet</strong><span>Drafts and approvals are real and persistent. Final send and scheduling actions remain explicit placeholders.</span></div>${badge("setup_required", "Integration pending")}</div>
    <section class="kpi-strip kpi-strip--compact">
      ${compactMetric("Drafts", data.drafts.filter((item) => item.status === "draft").length, "editable")}
      ${compactMetric("Awaiting approval", pendingApprovals, "blocked until review")}
      ${compactMetric("Sent history", sent.length, "recorded")}
      ${compactMetric("Ready demos", data.demos.filter((item) => ["ready", "sent", "viewed"].includes(item.status)).length, "attachable")}
    </section>
    <section class="outreach-layout">
      <form class="card outreach-composer" data-form="outreach-draft" data-mode="approval">
        <header class="card__head"><div><h3>Email composer</h3><p>Writing assistance stays inside the workflow</p></div>${badge("draft", "Draft")}</header>
        <div class="card__body">
          <div class="field-row">
            <label class="field field--flush"><span>Lead</span><select name="lead_id" required data-action="outreach-lead-select">${available.map((lead) => `<option value="${lead.id}" ${selectedLead?.id === lead.id ? "selected" : ""}>${escapeHtml(lead.business_name)}</option>`).join("")}</select></label>
            <label class="field field--flush"><span>Offer</span><select name="offer_amount">${[400, 500, 700].map((price) => `<option value="${price}" ${Number(amount) === price ? "selected" : ""}>$${price}</option>`).join("")}</select></label>
          </div>
          <label class="field"><span>Subject</span><input name="subject" required value="${escapeHtml(selectedLead ? `I made a website for ${selectedLead.business_name}` : "")}"></label>
          <label class="field"><span>Body</span><textarea class="message-editor" name="body" required>${escapeHtml(personalizeBody(selectedLead, demo, amount))}</textarea></label>
          <div class="ai-tools">
            <span>${icon("sparkles")} Writing tools</span>
            <button type="button" data-action="placeholder-ai" data-kind="rewrite">Rewrite</button>
            <button type="button" data-action="placeholder-ai" data-kind="personalize">Personalize</button>
            <button type="button" data-action="placeholder-ai" data-kind="improve">Improve</button>
            <small>Provider connection required</small>
          </div>
        </div>
        <footer class="composer-footer">
          <div><span>${icon("monitor-up")}</span><div><strong>${escapeHtml(demo?.name || "No demo attached")}</strong><small>${demo ? demo.preview_url || "Preview URL pending" : "Create a demo before sending"}</small></div>${demo ? linkOut(demo.preview_url, "Preview") : `<button class="text-link" type="button" data-action="new-demo" data-lead-id="${selectedLead?.id || ""}">Create demo</button>`}</div>
          <div>
            <button class="button button--ghost" type="submit" data-submit-mode="draft">Save draft</button>
            <button class="button button--secondary" type="button" data-action="schedule-placeholder">${icon("clock")} Schedule</button>
            <button class="button button--primary" type="submit" data-submit-mode="approval">${icon("shield-check")} Request send approval</button>
          </div>
        </footer>
      </form>
      <aside class="section-stack">
        ${sectionCard(
          "Lead context",
          selectedLead?.category || "Select a lead",
          selectedLead ? `<dl class="detail-list">
            <div><dt>Business</dt><dd>${escapeHtml(selectedLead.business_name)}</dd></div>
            <div><dt>Contact</dt><dd>${escapeHtml(selectedLead.contact_name || selectedLead.email || selectedLead.phone || "Not available")}</dd></div>
            <div><dt>Stage</dt><dd>${badge(selectedLead.status, statusLabel(selectedLead.status))}</dd></div>
            <div><dt>Website</dt><dd>${badge(selectedLead.has_website ? "warning" : "connected", selectedLead.website_status || "No website")}</dd></div>
            <div><dt>Score</dt><dd>${Number(selectedLead.lead_score || selectedLead.qualification_score || 0)}/100</dd></div>
          </dl>` : `<p class="muted-copy">Add a lead to start composing.</p>`,
        )}
        ${sectionCard(
          "Templates",
          "Reusable starting points",
          `<div class="message-template-list">
            <button data-action="apply-outreach-template" data-template="base"><strong>Demo-first offer</strong><span>Direct, one-time price, no-risk close</span></button>
            <button data-action="apply-outreach-template" data-template="short"><strong>Short follow-through</strong><span>Condensed version for busy owners</span></button>
            <button data-action="apply-outreach-template" data-template="changes"><strong>Customization angle</strong><span>Lead with easy design changes</span></button>
          </div>`,
        )}
      </aside>
    </section>
    ${sectionCard(
      "Draft and sent history",
      "Persistent outreach records",
      `<div class="table-wrap"><table class="data-table responsive-table">
        <thead><tr><th>Lead</th><th>Subject</th><th>Kind</th><th>Status</th><th>Updated</th><th></th></tr></thead>
        <tbody>${data.drafts.map((draft) => `<tr data-action="edit-draft" data-id="${draft.id}">
          <td data-label="Lead">${primaryCell(leadName(data, draft.lead_id), byId(data.leads, draft.lead_id)?.email || "No email")}</td>
          <td data-label="Subject">${escapeHtml(draft.subject)}</td>
          <td data-label="Kind">${escapeHtml(statusLabel(draft.kind))}</td>
          <td data-label="Status">${badge(draft.status, statusLabel(draft.status))}</td>
          <td data-label="Updated">${formatDate(draft.updated_at || draft.created_at)}</td>
          <td data-label="Action"><button class="button button--ghost" data-action="edit-draft" data-id="${draft.id}">Edit</button></td>
        </tr>`).join("") || tableEmpty(6, "No outreach drafts", "Prepare the first lead email above.")}</tbody>
      </table></div>`,
    )}
  `;
}

function threadList(data, threads, selectedId) {
  return `<div class="thread-list">${threads.map((thread) => `
    <button class="thread-row ${thread.id === selectedId ? "is-active" : ""} ${thread.is_unread ? "is-unread" : ""}" data-action="open-thread" data-id="${thread.id}">
      <span class="avatar">${escapeHtml((thread.sender_name || "U").split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span>
      <span><strong>${escapeHtml(thread.sender_name || "Unknown sender")}</strong><small>${escapeHtml(thread.subject || "(no subject)")}</small><em>${escapeHtml(thread.ai_summary || "No summary available.")}</em></span>
      <span><time>${relativeTime(thread.last_message_at)}</time>${badge(thread.classification, statusLabel(thread.classification))}</span>
    </button>
  `).join("") || `<div class="healthy-state healthy-state--large">${icon("inbox")}<div><strong>No matching threads</strong><span>Gmail-backed conversations will appear here later.</span></div></div>`}</div>`;
}

export function renderInbox() {
  const { data, routeParams } = getState();
  const classification = routeParams.classification || "all";
  const query = (routeParams.q || "").toLowerCase();
  const threads = data.emailThreads.filter((thread) => (
    (classification === "all" || thread.classification === classification)
    && (!query || `${thread.sender_name} ${thread.sender_email} ${thread.subject} ${thread.ai_summary}`.toLowerCase().includes(query))
  ));
  const selected = byId(data.emailThreads, routeParams.thread) || threads[0];
  const lead = selected ? byId(data.leads, selected.lead_id) : null;
  const demo = lead ? demoForLead(data, lead.id) : null;
  const messages = selected
    ? data.emails.filter((email) => email.thread_id === selected.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];

  return `
    ${pageHead("Inbox", "A lead-aware business inbox ready for Gmail and Pub/Sub synchronization.")}
    <div class="placeholder-banner">${icon("inbox")}<div><strong>Frontend and database are ready for Gmail</strong><span>Classification, threading, lead matching, replies, and approvals work with stored records; live mail transport is still a placeholder.</span></div>${badge("setup_required", "Gmail pending")}</div>
    <div class="toolbar">
      <div class="toolbar__group">
        <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search sender, business, subject…" value="${escapeHtml(routeParams.q || "")}"></label>
        <select class="compact-select" data-action="route-select" data-key="classification"><option value="all">All classifications</option>${CLASSIFICATIONS.map((value) => `<option value="${value}" ${classification === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select>
      </div>
      <span class="selection-count">${data.emailThreads.filter((thread) => thread.is_unread).length} unread</span>
    </div>
    <section class="inbox-layout card">
      <aside>${threadList(data, threads, selected?.id)}</aside>
      <article class="thread-detail">
        ${selected ? `
          <header class="thread-detail__head">
            <div><span class="eyebrow">${escapeHtml(lead?.business_name || "Unlinked conversation")}</span><h2>${escapeHtml(selected.subject || "(no subject)")}</h2><p>${escapeHtml(selected.sender_name)} · ${escapeHtml(selected.sender_email || "")}</p></div>
            <div><select class="compact-select" data-action="classify-thread" data-id="${selected.id}">${CLASSIFICATIONS.filter((value) => value !== "unread").map((value) => `<option value="${value}" ${selected.classification === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select>${lead ? badge(lead.status, statusLabel(lead.status)) : ""}</div>
          </header>
          <section class="thread-context">
            <div><span>AI summary</span><p>${escapeHtml(selected.ai_summary || "Connect a writing provider to generate summaries.")}</p></div>
            <div><span>Intent</span><p>${escapeHtml(statusLabel(selected.intent || selected.classification))}</p></div>
            <div><span>Suggested reply</span><p>${escapeHtml(selected.suggested_reply || "Connect a writing provider for suggested replies.")}</p></div>
            <span class="placeholder-chip">${icon("sparkles")} AI placeholders</span>
          </section>
          <div class="conversation">${messages.map((message) => `
            <article class="message-bubble message-bubble--${message.direction}">
              <header><strong>${message.direction === "outbound" ? "Connor" : escapeHtml(selected.sender_name || message.sender)}</strong><time>${formatDate(message.sent_at || message.received_at || message.created_at, { hour: "numeric", minute: "2-digit" })}</time></header>
              <p>${escapeHtml(message.body)}</p>
            </article>
          `).join("") || `<p class="muted-copy">No stored messages in this thread.</p>`}</div>
          <form class="reply-composer" data-form="thread-reply" data-thread-id="${selected.id}" data-lead-id="${selected.lead_id || ""}">
            <textarea name="body" required placeholder="Write a reply…">${escapeHtml(selected.suggested_reply || "")}</textarea>
            <footer><div>${demo ? linkOut(demo.preview_url, "Attached demo") : `<span class="muted-copy">No demo attached</span>`}</div><div><button class="button button--ghost" type="button" data-action="placeholder-ai">Improve</button><button class="button button--primary" type="submit">${icon("shield-check")} Request send approval</button></div></footer>
          </form>
        ` : `<div class="healthy-state healthy-state--large">${icon("inbox")}<div><strong>Select a conversation</strong><span>Thread detail and reply tools appear here.</span></div></div>`}
      </article>
    </section>
  `;
}

function followUpView(item, view) {
  if (view === "completed") return ["sent", "replied", "completed", "dead", "skipped"].includes(item.status);
  if (["sent", "replied", "completed", "dead", "skipped", "cancelled"].includes(item.status)) return false;
  const due = new Date(item.due_at);
  if (view === "today") return due.toDateString() === new Date().toDateString() || item.status === "due";
  if (view === "overdue") return due < new Date() && due.toDateString() !== new Date().toDateString();
  return due > new Date() && due.toDateString() !== new Date().toDateString();
}

export function renderFollowUps() {
  const { data, routeParams } = getState();
  const view = routeParams.view || "today";
  const query = (routeParams.q || "").toLowerCase();
  const rows = data.followUps.filter((item) => followUpView(item, view) && (!query || leadName(data, item.lead_id).toLowerCase().includes(query)));
  const counts = Object.fromEntries(["today", "overdue", "upcoming", "completed"].map((key) => [key, data.followUps.filter((item) => followUpView(item, key)).length]));

  return `
    ${pageHead("Follow-Ups", "Prioritized follow-up work with the last contact, demo, suggested copy, and next action together.", button("Schedule follow-up", { action: "new-follow-up", iconName: "plus", variant: "primary" }))}
    <div class="placeholder-banner">${icon("timer-reset")}<div><strong>Follow-up state is persistent</strong><span>Draft, snooze, reschedule, dead, and replied actions work now. Final Gmail send remains a placeholder behind approval.</span></div></div>
    <div class="toolbar">
      <div class="tabs">${["today", "overdue", "upcoming", "completed"].map((key) => `<button class="tab ${view === key ? "is-active" : ""}" data-action="route-filter" data-key="view" data-value="${key}">${statusLabel(key)} · ${counts[key]}</button>`).join("")}</div>
      <label class="inline-search">${icon("search")}<input data-route-search placeholder="Search business" value="${escapeHtml(routeParams.q || "")}"></label>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table class="data-table responsive-table">
          <thead><tr><th>Business</th><th>Last contacted</th><th>Attempt</th><th>Stage</th><th>Demo</th><th>Suggested follow-up</th><th>Due</th><th>Actions</th></tr></thead>
          <tbody>${rows.map((item) => {
            const lead = byId(data.leads, item.lead_id);
            const demo = demoForLead(data, item.lead_id);
            return `<tr>
              <td data-label="Business">${primaryCell(lead?.business_name || "Unknown lead", lead?.email || lead?.phone || "No contact")}</td>
              <td data-label="Last contact">${lead?.last_contacted_at ? primaryCell(formatDate(lead.last_contacted_at), `${Math.max(0, Math.floor((Date.now() - new Date(lead.last_contacted_at)) / 86400000))} days ago`) : "Never"}</td>
              <td data-label="Attempt">#${Number(item.sequence_number || 1)}</td>
              <td data-label="Stage">${lead ? badge(lead.status, statusLabel(lead.status)) : "—"}</td>
              <td data-label="Demo">${demo ? badge(demo.status, statusLabel(demo.status)) : "No demo"}</td>
              <td data-label="Suggested"><p class="table-copy">${escapeHtml(item.suggested_text || "No suggestion saved.")}</p></td>
              <td data-label="Due"><span class="${view === "overdue" ? "text-danger" : ""}">${escapeHtml(dueLabel(item.due_at))}</span></td>
              <td data-label="Actions"><div class="row-actions row-actions--wrap">
                <button class="button button--ghost" data-action="draft-follow-up" data-id="${item.id}">Draft</button>
                <button class="button button--ghost" data-action="snooze-follow-up" data-id="${item.id}">Snooze</button>
                <button class="button button--ghost" data-action="follow-up-status" data-id="${item.id}" data-status="replied">Replied</button>
                <button class="button button--danger" data-action="follow-up-status" data-id="${item.id}" data-status="dead">Dead</button>
              </div></td>
            </tr>`;
          }).join("") || tableEmpty(8, `No ${view} follow-ups`, "This follow-up view is clear.")}</tbody>
        </table>
      </div>
    </section>
  `;
}
