import { icon, hydrateIcons } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, relativeTime } from "../core/utils.js";
import { badge, button } from "./ui.js";

export function renderAgentPanel() {
  const { data, agentPanelOpen } = getState();
  const panel = document.getElementById("agent-panel");
  const active = data.agentRuns.find((run) => ["running", "waiting_approval", "queued"].includes(run.status));
  const recentEvents = data.agentEvents.slice(0, 6);
  panel.innerHTML = `
    <header class="panel-head">
      <div><h2>Orchestration agent</h2><p>Manual control plane</p></div>
      <button class="icon-button" type="button" data-action="close-panels" aria-label="Close agent panel">${icon("x")}</button>
    </header>
    <section class="panel-section">
      <div class="panel-label"><span>Current state</span>${badge("active", "Manual mode")}</div>
      <div class="agent-status-card">
        <div class="agent-status-card__top">
          <span class="agent-orb"><i></i></span>
          <div><strong>${escapeHtml(active?.title || "Ready for direction")}</strong><span>${escapeHtml(active?.current_step || "No autonomous work is running")}</span></div>
        </div>
        <div class="progress"><i style="width:${active?.progress || 0}%"></i></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;color:var(--muted);font-size:8px"><span>${active ? `${active.progress || 0}% complete` : "Idle"}</span><span>${active ? formatCurrency(active.estimated_cost, 2) : "$0.00"} estimated</span></div>
      </div>
    </section>
    <section class="panel-section">
      <div class="panel-label"><span>Manual plans</span><span>No model calls</span></div>
      <div class="agent-actions">
        <button class="agent-action" data-action="queue-agent-run" data-title="Review priority pipeline">${icon("scan-search")}<strong>Review pipeline</strong><span>Queue a manual review plan</span></button>
        <button class="agent-action" data-action="queue-agent-run" data-title="Prepare next demo brief">${icon("wand-sparkles")}<strong>Prepare demo</strong><span>Plan template and QA work</span></button>
        <button class="agent-action" data-action="queue-agent-run" data-title="Draft next outreach email">${icon("pencil")}<strong>Draft outreach</strong><span>Queue writing preparation</span></button>
        <button class="agent-action" data-action="navigate" data-route-target="approvals">${icon("shield-check")}<strong>Review approvals</strong><span>${data.approvals.filter((item) => item.status === "pending").length} actions waiting</span></button>
      </div>
    </section>
    <section class="panel-section">
      <div class="panel-label"><span>Recent activity</span><button class="button button--ghost" data-action="navigate" data-route-target="activity">View all</button></div>
      <div class="timeline">${recentEvents.map((event) => `
        <div class="timeline-item">
          <span class="timeline-icon">${icon(event.agent_type === "system" ? "activity" : "bot")}</span>
          <div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail || event.event_type)}</p></div>
          <time>${relativeTime(event.created_at)}</time>
        </div>
      `).join("") || `<p style="color:var(--muted);font-size:10px">No activity yet.</p>`}</div>
    </section>
    <section class="panel-section">
      <div class="panel-label"><span>Agent roles</span></div>
      <div class="settings-list">
        <div class="settings-row"><div><strong>Orchestrator</strong><p>Routing and decisions</p></div><span class="badge badge--accent">Control</span></div>
        <div class="settings-row"><div><strong>Designer</strong><p>Template, demo, QA</p></div><span class="badge badge--blue">Build</span></div>
        <div class="settings-row"><div><strong>Writer</strong><p>Email and replies</p></div><span class="badge badge--green">Copy</span></div>
      </div>
    </section>
  `;
  panel.classList.toggle("is-open", agentPanelOpen);
  panel.setAttribute("aria-hidden", String(!agentPanelOpen));
  hydrateIcons(panel);
}

export function renderNotificationPanel() {
  const { data, notificationPanelOpen } = getState();
  const panel = document.getElementById("notification-panel");
  const unread = data.notifications.filter((item) => !item.is_read).length;
  panel.innerHTML = `
    <header class="panel-head">
      <div><h2>Notifications</h2><p>${unread} unread</p></div>
      <div style="display:flex;gap:7px">
        ${unread ? `<button class="button button--ghost" data-action="mark-notifications-read">Mark all read</button>` : ""}
        <button class="icon-button" type="button" data-action="close-panels" aria-label="Close notifications">${icon("x")}</button>
      </div>
    </header>
    <div>${data.notifications.map((item) => `
      <article class="notification-item ${item.is_read ? "" : "is-unread"}" data-action="open-notification" data-id="${item.id}" data-route-target="${escapeHtml(item.action_route || "")}">
        <span class="notification-item__icon" style="${item.type === "success" ? "background:var(--green-soft);color:var(--green)" : item.type === "warning" ? "background:var(--yellow-soft);color:var(--yellow)" : item.type === "error" ? "background:var(--red-soft);color:var(--red)" : ""}">${icon(item.type === "approval" ? "shield-check" : item.type === "success" ? "check-circle-2" : item.type === "error" ? "circle-alert" : "bell")}</span>
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message || "")}</p><time>${relativeTime(item.created_at)}</time></div>
      </article>
    `).join("") || `<div class="empty-state"><div class="empty-icon">${icon("bell")}</div><h3>No notifications</h3><p>Your workspace is quiet.</p></div>`}</div>
  `;
  panel.classList.toggle("is-open", notificationPanelOpen);
  panel.setAttribute("aria-hidden", String(!notificationPanelOpen));
  hydrateIcons(panel);
}

