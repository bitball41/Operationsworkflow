import { icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatDate, relativeTime } from "../core/utils.js";
import { badge, button, emptyState, metricCard, pageHead } from "../components/ui.js";

function leadFor(id) {
  return getState().data.leads.find((lead) => lead.id === id);
}

export function renderOutreach() {
  const { data } = getState();
  const draftCount = data.drafts.filter((draft) => draft.status === "draft").length;
  const waitingCount = data.drafts.filter((draft) => draft.status === "pending_approval").length;
  const approvedCount = data.drafts.filter((draft) => draft.status === "approved").length;
  return `
    ${pageHead(
      "Email drafts",
      "Gmail stays underneath. This system owns context, drafting, approvals, follow-up state, and cost.",
      button("Compose draft", { action: "new-draft", iconName: "plus", variant: "primary" }),
    )}
    <section class="grid grid--3">
      ${metricCard({ label: "In progress", value: draftCount, iconName: "pencil", foot: "Not yet submitted", tone: "blue" })}
      ${metricCard({ label: "Needs approval", value: waitingCount, iconName: "shield-check", foot: "External sends are blocked", tone: waitingCount ? "yellow" : "green" })}
      ${metricCard({ label: "Approved to send", value: approvedCount, iconName: "mail-check", foot: "Gmail adapter not connected", tone: "accent" })}
    </section>
    <article class="card" style="margin-top:14px">
      <header class="card__head">
        <div><h3>Outreach queue</h3><p>Every outbound message remains visible and editable</p></div>
        ${badge("pending", "Gmail disconnected")}
      </header>
      ${data.drafts.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Prospect</th><th>Subject</th><th>Type</th><th>Status</th><th>Updated</th><th></th></tr></thead>
        <tbody>${data.drafts.map((draft) => {
          const lead = leadFor(draft.lead_id);
          return `
            <tr data-action="edit-draft" data-id="${draft.id}">
              <td><div class="cell-primary"><strong>${escapeHtml(lead?.business_name || "Unknown prospect")}</strong><span>${escapeHtml(lead?.email || "No email")}</span></div></td>
              <td>${escapeHtml(draft.subject)}</td>
              <td>${badge("pending", draft.kind.replace("_", " "))}</td>
              <td>${badge(draft.status)}</td>
              <td>${relativeTime(draft.updated_at || draft.created_at)}</td>
              <td>${icon("chevron-right")}</td>
            </tr>
          `;
        }).join("")}</tbody>
      </table></div>` : emptyState({ iconName: "send", title: "No drafts", message: "Compose the first personalized message for a ready prospect.", action: "new-draft", actionLabel: "Compose draft" })}
    </article>

    <article class="card" style="margin-top:14px">
      <header class="card__head"><div><h3>Gmail adapter boundary</h3><p>No custom email provider — Gmail handles actual delivery</p></div></header>
      <div class="card__body">
        <div class="grid grid--3">
          <div><span class="eyebrow">Dashboard owns</span><p style="margin-top:8px;color:var(--text-soft);font-size:10px;line-height:1.65">Draft context, approved copy, send permission, thread state, reply classification, and follow-up logic.</p></div>
          <div><span class="eyebrow">Gmail owns</span><p style="margin-top:8px;color:var(--text-soft);font-size:10px;line-height:1.65">Mailbox delivery, sender identity, threads, spam handling, and the source-of-truth message record.</p></div>
          <div><span class="eyebrow">Worker will connect</span><p style="margin-top:8px;color:var(--text-soft);font-size:10px;line-height:1.65">Approved jobs and webhooks flow through the future Cloudflare Worker, never through a browser secret.</p></div>
        </div>
      </div>
    </article>
  `;
}

export function renderInbox() {
  const { data } = getState();
  const inbound = data.communications.filter((item) => item.direction === "inbound");
  const positive = inbound.filter((item) => item.sentiment === "positive");
  return `
    ${pageHead("Reply intelligence", "Triage replies by intent and decide the next action. Gmail sync attaches to this timeline later.", button("Log reply", { action: "new-communication", iconName: "plus", variant: "primary" }))}
    <section class="grid grid--3">
      ${metricCard({ label: "Tracked replies", value: inbound.length, iconName: "inbox", foot: "Inbound conversations", tone: "blue" })}
      ${metricCard({ label: "Positive intent", value: positive.length, iconName: "trending-up", foot: "Interested or asking changes", tone: "green" })}
      ${metricCard({ label: "Needs response", value: inbound.filter((item) => !item.reply_classification?.includes("closed")).length, iconName: "timer-reset", foot: "Manual classification", tone: "yellow" })}
    </section>

    <section class="grid grid--sidebar" style="margin-top:14px">
      <article class="card">
        <header class="card__head"><div><h3>Conversation inbox</h3><p>Most recent prospect replies first</p></div></header>
        ${inbound.length ? `<div>${inbound.map((message) => {
          const lead = leadFor(message.lead_id);
          return `
            <div class="approval-card" data-action="open-reply" data-id="${message.id}" style="cursor:pointer">
              <div class="approval-card__top">
                <div>
                  <h3>${escapeHtml(lead?.business_name || "Unknown prospect")}</h3>
                  <p><strong style="color:var(--text-soft)">${escapeHtml(message.subject || "No subject")}</strong><br>${escapeHtml(message.body_preview || "No preview available")}</p>
                </div>
                ${badge(message.sentiment || "pending", message.sentiment || "Unknown")}
              </div>
              <div class="approval-card__meta">${badge("replied", (message.reply_classification || "unclassified").replaceAll("_", " "))}<span class="badge badge--muted">${relativeTime(message.occurred_at)}</span></div>
            </div>
          `;
        }).join("")}</div>` : emptyState({ iconName: "inbox", title: "No inbound replies", message: "Log a reply manually now; Gmail thread sync will populate this automatically later.", action: "new-communication", actionLabel: "Log reply" })}
      </article>

      <aside class="card">
        <header class="card__head"><div><h3>Intent routing</h3><p>Reply classes and next moves</p></div></header>
        <div class="card__body">
          <div class="settings-list">
            ${[
              ["Interested", "Prepare answer or requested revision", "green"],
              ["Question", "Draft direct response", "blue"],
              ["Not now", "Schedule long follow-up", "yellow"],
              ["Not interested", "Close without pressure", "red"],
              ["Unclear", "Require human classification", "muted"],
            ].map(([label, detail, tone]) => `<div class="settings-row"><div><strong>${label}</strong><p>${detail}</p></div><span class="badge badge--${tone}">${label}</span></div>`).join("")}
          </div>
        </div>
      </aside>
    </section>
  `;
}

export function renderFollowUps() {
  const { data } = getState();
  const scheduled = data.followUps.filter((item) => ["scheduled", "due", "drafted"].includes(item.status));
  const overdue = scheduled.filter((item) => new Date(item.due_at) < new Date() && item.status !== "sent");
  return `
    ${pageHead("Follow-ups", "Simple sequences tied to real outreach. No separate calendar.", button("Schedule follow-up", { action: "new-follow-up", iconName: "plus", variant: "primary" }))}
    <section class="grid grid--3">
      ${metricCard({ label: "Scheduled", value: scheduled.length, iconName: "timer-reset", foot: "Active sequence steps", tone: "accent" })}
      ${metricCard({ label: "Due now", value: overdue.length, iconName: "circle-alert", foot: overdue.length ? "Needs attention" : "Nothing overdue", tone: overdue.length ? "red" : "green" })}
      ${metricCard({ label: "Sent", value: data.followUps.filter((item) => item.status === "sent").length, iconName: "mail-check", foot: "Completed follow-ups", tone: "blue" })}
    </section>
    <article class="card" style="margin-top:14px">
      <header class="card__head"><div><h3>Follow-up queue</h3><p>Short, permissioned, and easy to stop</p></div></header>
      ${data.followUps.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Prospect</th><th>Sequence</th><th>Due</th><th>Status</th><th>Draft</th><th></th></tr></thead>
        <tbody>${data.followUps.map((followUp) => {
          const lead = leadFor(followUp.lead_id);
          const draft = data.drafts.find((item) => item.id === followUp.draft_id);
          return `
            <tr>
              <td><div class="cell-primary"><strong>${escapeHtml(lead?.business_name || "Unknown prospect")}</strong><span>${escapeHtml(lead?.email || "No email")}</span></div></td>
              <td>Follow-up #${followUp.sequence_number}</td>
              <td style="color:${new Date(followUp.due_at) < new Date() && followUp.status !== "sent" ? "var(--red)" : "inherit"}">${formatDate(followUp.due_at)} · ${relativeTime(followUp.due_at)}</td>
              <td>${badge(followUp.status)}</td>
              <td>${draft ? escapeHtml(draft.subject) : "Not drafted"}</td>
              <td><button class="button button--secondary" data-action="manage-follow-up" data-id="${followUp.id}">Manage</button></td>
            </tr>
          `;
        }).join("")}</tbody>
      </table></div>` : emptyState({ iconName: "timer-reset", title: "No follow-ups", message: "Schedule follow-ups only after an initial message exists.", action: "new-follow-up", actionLabel: "Schedule follow-up" })}
    </article>
  `;
}

export function renderApprovals() {
  const { data } = getState();
  const pending = data.approvals.filter((item) => item.status === "pending");
  const resolved = data.approvals.filter((item) => item.status !== "pending");
  return `
    ${pageHead("Approvals", "The hard stop between agent preparation and external action.", badge(pending.length ? "pending" : "active", pending.length ? `${pending.length} waiting` : "Queue clear"))}
    <section class="grid grid--3" style="margin-bottom:14px">
      ${metricCard({ label: "Waiting", value: pending.length, iconName: "shield-check", foot: "Requires your decision", tone: pending.length ? "yellow" : "green" })}
      ${metricCard({ label: "High risk", value: pending.filter((item) => item.risk_level === "high").length, iconName: "circle-alert", foot: "Destructive or external", tone: "red" })}
      ${metricCard({ label: "Resolved", value: resolved.length, iconName: "check-circle-2", foot: "Decision history retained", tone: "blue" })}
    </section>
    <article class="card">
      <header class="card__head"><div><h3>Waiting for you</h3><p>Nothing here executes automatically</p></div></header>
      ${pending.length ? `<div>${pending.map((approval) => {
        const leadId = approval.entity_type === "message_draft"
          ? data.drafts.find((draft) => draft.id === approval.entity_id)?.lead_id
          : data.demos.find((demo) => demo.id === approval.entity_id)?.lead_id;
        const lead = leadFor(leadId);
        return `
          <div class="approval-card">
            <div class="approval-card__top">
              <div><h3>${escapeHtml(approval.title)}</h3><p>${escapeHtml(approval.summary || "No summary provided.")}</p></div>
              ${badge(approval.risk_level === "high" ? "rejected" : approval.risk_level === "medium" ? "pending" : "active", `${approval.risk_level} risk`)}
            </div>
            <div class="approval-card__meta">
              <span class="badge badge--accent">${escapeHtml(approval.requested_by_agent || "system")}</span>
              <span class="badge badge--muted">${escapeHtml(approval.approval_type.replaceAll("_", " "))}</span>
              ${lead ? `<span class="badge badge--muted">${escapeHtml(lead.business_name)}</span>` : ""}
              <span class="badge badge--muted">${relativeTime(approval.created_at)}</span>
            </div>
            ${approval.approval_type === "email_send" ? (() => {
              const draft = data.drafts.find((item) => item.id === approval.entity_id);
              return draft ? `<div class="message-preview" style="margin-top:12px"><strong>Subject: ${escapeHtml(draft.subject)}</strong>\n\n${escapeHtml(draft.body)}</div>` : "";
            })() : ""}
            <div class="approval-card__actions">
              ${button("Approve", { action: "resolve-approval", iconName: "check", variant: "primary", attrs: `data-id="${approval.id}" data-status="approved"` })}
              ${button("Request changes", { action: "resolve-approval", iconName: "pencil", attrs: `data-id="${approval.id}" data-status="changes_requested"` })}
              ${button("Reject", { action: "resolve-approval", iconName: "x", variant: "danger", attrs: `data-id="${approval.id}" data-status="rejected"` })}
            </div>
          </div>
        `;
      }).join("")}</div>` : emptyState({ iconName: "shield-check", title: "Approval queue is clear", message: "Agent-prepared external actions will stop here before execution." })}
    </article>

    ${resolved.length ? `<article class="card" style="margin-top:14px">
      <header class="card__head"><div><h3>Decision history</h3><p>Recent resolved approvals</p></div></header>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Action</th><th>Type</th><th>Decision</th><th>Requested by</th><th>Resolved</th></tr></thead>
        <tbody>${resolved.slice(0, 20).map((approval) => `
          <tr><td>${escapeHtml(approval.title)}</td><td>${escapeHtml(approval.approval_type.replaceAll("_", " "))}</td><td>${badge(approval.status)}</td><td>${escapeHtml(approval.requested_by_agent || "system")}</td><td>${approval.resolved_at ? relativeTime(approval.resolved_at) : "—"}</td></tr>
        `).join("")}</tbody>
      </table></div>
    </article>` : ""}
  `;
}

