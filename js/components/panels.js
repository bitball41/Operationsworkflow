import { icon, hydrateIcons } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, relativeTime } from "../core/utils.js";
import { badge } from "./ui.js";

function activeRun(data) {
  return data.agentRuns.find((run) => ["running", "paused", "waiting_approval", "queued"].includes(run.status)) || data.agentRuns[0];
}

export function renderAgentPanel() {
  const { data, agentPanelOpen } = getState();
  const panel = document.getElementById("agent-panel");
  const run = activeRun(data);
  const events = run ? data.agentEvents.filter((item) => item.run_id === run.id).slice(0, 10) : [];
  const messages = run?.messages || [];
  panel.innerHTML = `
    <header class="panel-head">
      <div><h2>Orchestrator</h2><p>Persistent workflow control</p></div>
      <button class="icon-button" type="button" data-action="close-panels" aria-label="Close orchestrator">${icon("x")}</button>
    </header>
    <section class="panel-section">
      <div class="panel-label"><span>Current objective</span>${badge(run?.status || "active", run ? run.status.replaceAll("_", " ") : "Idle")}</div>
      <div class="agent-status-card">
        <div class="agent-status-card__top">
          <span class="agent-orb"><i></i></span>
          <div><strong>${escapeHtml(run?.objective || run?.title || "Ready for an objective")}</strong><span>${escapeHtml(run?.current_step || "No workflow is running")}</span></div>
        </div>
        <div class="progress"><i style="width:${Number(run?.progress || 0)}%"></i></div>
        <div class="run-meta"><span>${Number(run?.progress || 0)}% complete</span><span>${formatCurrency(run?.estimated_cost || 0, 2)} estimated</span></div>
        <div class="run-controls">
          ${!run || ["completed", "failed", "cancelled"].includes(run.status) ? `<button class="button button--primary" data-action="queue-agent-run" data-title="Review priority pipeline">${icon("sparkles")} Start plan</button>` : `
            <button class="button button--secondary" data-action="agent-control" data-id="${run.id}" data-status="${run.status === "paused" ? "running" : "paused"}">${icon(run.status === "paused" ? "arrow-right" : "clock")} ${run.status === "paused" ? "Resume" : "Pause"}</button>
            <button class="button button--danger" data-action="agent-control" data-id="${run.id}" data-status="cancelled">Cancel</button>
          `}
        </div>
      </div>
    </section>
    ${run ? `<section class="panel-section">
      <div class="panel-label"><span>Plan</span><span>${(run.completed_steps || []).length} complete</span></div>
      <div class="step-list">
        ${(run.completed_steps || []).map((step) => `<div class="is-complete">${icon("check-circle-2")}<span>${escapeHtml(step)}</span></div>`).join("")}
        ${run.current_step ? `<div class="is-current">${icon("refresh-cw")}<span>${escapeHtml(run.current_step)}</span></div>` : ""}
        ${(run.upcoming_steps || []).map((step) => `<div>${icon("circle-plus")}<span>${escapeHtml(step)}</span></div>`).join("")}
      </div>
    </section>` : ""}
    <section class="panel-section">
      <div class="panel-label"><span>Event log</span><span>${events.length} recent</span></div>
      <div class="timeline">${events.map((event) => `
        <div class="timeline-item"><span class="timeline-icon">${icon(event.event_type?.includes("error") ? "circle-alert" : "activity")}</span><div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail || event.event_type)}</p></div><time>${relativeTime(event.created_at)}</time></div>
      `).join("") || `<p class="muted-copy">No events for the current run.</p>`}</div>
      ${run?.error_message ? `<div class="inline-alert inline-alert--error">${icon("circle-alert")}<div><strong>Workflow error</strong><span>${escapeHtml(run.error_message)}</span></div></div>` : ""}
    </section>
    <section class="panel-section orchestrator-chat">
      <div class="panel-label"><span>Chat</span><span>Manual messages</span></div>
      <div class="chat-history">${messages.map((message) => `<div class="chat-message chat-message--${message.role === "user" ? "user" : "system"}"><span>${escapeHtml(message.text || message.content || "")}</span><time>${message.at ? relativeTime(message.at) : ""}</time></div>`).join("") || `<p class="muted-copy">Message the orchestrator to record direction. No model API is called yet.</p>`}</div>
      <form data-form="orchestrator-message" data-id="${run?.id || ""}"><input name="message" required placeholder="Add direction or context…"><button class="icon-button" type="submit" aria-label="Send message">${icon("send")}</button></form>
    </section>
  `;
  panel.classList.toggle("is-open", agentPanelOpen);
  panel.setAttribute("aria-hidden", String(!agentPanelOpen));
  hydrateIcons(panel);
}

export function renderApprovalPanel() {
  const { data, approvalPanelOpen } = getState();
  const panel = document.getElementById("approval-panel");
  const pending = data.approvals.filter((item) => item.status === "pending");
  panel.innerHTML = `
    <header class="panel-head">
      <div><h2>Approval queue</h2><p>${pending.length} waiting for review</p></div>
      <button class="icon-button" type="button" data-action="close-panels" aria-label="Close approvals">${icon("x")}</button>
    </header>
    <div>${pending.map((item) => `
      <article class="approval-card">
        <div class="approval-card__top"><div><span class="eyebrow">${escapeHtml(item.approval_type.replaceAll("_", " "))}</span><h3>${escapeHtml(item.title)}</h3></div>${badge(item.risk_level === "high" ? "error" : item.risk_level === "medium" ? "warning" : "active", `${item.risk_level} risk`)}</div>
        <p>${escapeHtml(item.summary || "Review this operation before it can proceed.")}</p>
        <div class="approval-card__meta"><span>${icon("bot")} ${escapeHtml(item.requested_by_agent || "system")}</span><span>${relativeTime(item.created_at)}</span></div>
        <div class="approval-card__actions">
          <button class="button button--ghost" data-action="inspect-approval" data-id="${item.id}">Review details</button>
          <button class="button button--danger" data-action="resolve-approval" data-id="${item.id}" data-status="rejected">Reject</button>
          <button class="button button--primary" data-action="resolve-approval" data-id="${item.id}" data-status="approved">Approve</button>
        </div>
      </article>
    `).join("") || `<div class="healthy-state healthy-state--large">${icon("shield-check")}<div><strong>Queue is clear</strong><span>Risky actions will wait here before execution.</span></div></div>`}</div>
  `;
  panel.classList.toggle("is-open", approvalPanelOpen);
  panel.setAttribute("aria-hidden", String(!approvalPanelOpen));
  hydrateIcons(panel);
}

export function renderNotificationPanel() {
  const { data, notificationPanelOpen } = getState();
  const panel = document.getElementById("notification-panel");
  const unread = data.notifications.filter((item) => !item.is_read).length;
  panel.innerHTML = `
    <header class="panel-head">
      <div><h2>Notifications</h2><p>${unread} unread</p></div>
      <div class="panel-head__actions">
        ${unread ? `<button class="button button--ghost" data-action="mark-notifications-read">Mark all read</button>` : ""}
        <button class="icon-button" type="button" data-action="close-panels" aria-label="Close notifications">${icon("x")}</button>
      </div>
    </header>
    <div>${data.notifications.map((item) => `
      <article class="notification-item ${item.is_read ? "" : "is-unread"}" data-action="open-notification" data-id="${item.id}" data-route-target="${escapeHtml(item.action_route || "")}">
        <span class="notification-item__icon notification-item__icon--${item.type}">${icon(item.type === "approval" ? "shield-check" : item.type === "success" ? "check-circle-2" : item.type === "error" ? "circle-alert" : item.type === "warning" ? "clock" : "bell")}</span>
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message || "")}</p><time>${relativeTime(item.created_at)}</time></div>
      </article>
    `).join("") || `<div class="healthy-state healthy-state--large">${icon("bell")}<div><strong>No notifications</strong><span>Your workspace is quiet.</span></div></div>`}</div>
  `;
  panel.classList.toggle("is-open", notificationPanelOpen);
  panel.setAttribute("aria-hidden", String(!notificationPanelOpen));
  hydrateIcons(panel);
}
