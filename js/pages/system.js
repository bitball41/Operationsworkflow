import { INTEGRATIONS } from "../config.js";
import { icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, relativeTime } from "../core/utils.js";
import { badge, button, emptyState, metricCard, pageHead } from "../components/ui.js";

export function renderActivity() {
  const { data } = getState();
  const running = data.agentRuns.filter((run) => ["queued", "running", "waiting_approval"].includes(run.status));
  const totalCost = data.agentRuns.reduce((total, run) => total + Number(run.estimated_cost || 0), 0);
  return `
    ${pageHead(
      "Agent activity",
      "A full audit trail for orchestration, design, writing, and manual system events.",
      button("Queue manual run", { action: "queue-agent-run", iconName: "plus", variant: "primary" }),
    )}
    <section class="grid grid--3">
      ${metricCard({ label: "Active runs", value: running.length, iconName: "bot", foot: "Queued, running, or waiting", tone: "purple" })}
      ${metricCard({ label: "Waiting approval", value: data.agentRuns.filter((run) => run.status === "waiting_approval").length, iconName: "shield-check", foot: "Human decision required", tone: "yellow" })}
      ${metricCard({ label: "Estimated run cost", value: formatCurrency(totalCost, 2), iconName: "activity", foot: "Stored against runs", tone: "blue" })}
    </section>

    <section class="grid grid--sidebar" style="margin-top:14px">
      <article class="card">
        <header class="card__head"><div><h3>Event stream</h3><p>Newest event first</p></div><span class="badge badge--muted">${data.agentEvents.length} events</span></header>
        ${data.agentEvents.length ? `<div class="card__body"><div class="timeline">${data.agentEvents.map((event) => `
          <div class="timeline-item">
            <span class="timeline-icon" style="${event.agent_type === "designer" ? "color:var(--blue)" : event.agent_type === "writer" ? "color:var(--green)" : event.agent_type === "orchestrator" ? "color:var(--accent-2)" : ""}">${icon(event.agent_type === "system" ? "activity" : event.agent_type === "designer" ? "wand-sparkles" : event.agent_type === "writer" ? "pencil" : "bot")}</span>
            <div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail || event.event_type.replaceAll("_", " "))}</p><span class="badge badge--muted" style="margin-top:6px">${escapeHtml(event.agent_type)}</span></div>
            <time>${relativeTime(event.created_at)}</time>
          </div>
        `).join("")}</div></div>` : emptyState({ iconName: "activity", title: "No activity", message: "Queue a manual run or work with a prospect to create the first event." })}
      </article>

      <aside class="section-stack">
        ${data.agentRuns.slice(0, 8).map((run) => `
          <article class="card">
            <div class="card__body">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div><span class="eyebrow">${escapeHtml(run.agent_type)}</span><h3 style="font-size:12px;margin-top:6px">${escapeHtml(run.title)}</h3></div>${badge(run.status)}</div>
              <p style="margin-top:8px;color:var(--muted);font-size:9px">${escapeHtml(run.current_step || "No active step")}</p>
              <div class="progress" style="margin-top:12px"><i style="width:${run.progress || 0}%"></i></div>
              <div style="display:flex;justify-content:space-between;margin-top:8px;color:var(--muted);font-size:8px"><span>${run.progress || 0}%</span><span>${formatCurrency(run.estimated_cost, 2)}</span></div>
            </div>
          </article>
        `).join("") || `<article class="card"><div class="card__body"><p style="color:var(--muted);font-size:10px">No runs yet.</p></div></article>`}
      </aside>
    </section>
  `;
}

export function renderSettings() {
  const { data, mode } = getState();
  const preferences = data.profile?.preferences || {};
  return `
    ${pageHead("Settings", "Agent boundaries, permissions, integration adapters, and workspace controls.", mode === "preview" ? badge("pending", "Preview only") : badge("connected", "Supabase connected"))}
    <section class="grid grid--sidebar">
      <div class="section-stack">
        <article class="card">
          <header class="card__head"><div><h3>Approval safeguards</h3><p>External actions remain permissioned even after automation is connected</p></div></header>
          <div class="card__body">
            <div class="settings-list">
              <div class="settings-row"><div><strong>Manual operating mode</strong><p>Agents prepare work but never execute external actions automatically.</p></div><button class="switch ${preferences.manual_mode !== false ? "is-on" : ""}" type="button" role="switch" aria-checked="${preferences.manual_mode !== false}" data-action="toggle-setting" data-key="manual_mode"></button></div>
              <div class="settings-row"><div><strong>Require email approval</strong><p>Every initial email, follow-up, and reply must be approved before Gmail can send.</p></div><button class="switch ${preferences.email_approval_required !== false ? "is-on" : ""}" type="button" role="switch" aria-checked="${preferences.email_approval_required !== false}" data-action="toggle-setting" data-key="email_approval_required"></button></div>
              <div class="settings-row"><div><strong>Require demo deployment approval</strong><p>Public preview deployments stop in the approval queue first.</p></div><button class="switch ${preferences.demo_deploy_approval_required !== false ? "is-on" : ""}" type="button" role="switch" aria-checked="${preferences.demo_deploy_approval_required !== false}" data-action="toggle-setting" data-key="demo_deploy_approval_required"></button></div>
              <div class="settings-row"><div><strong>Daily AI cost guardrail</strong><p>Warn and pause queued agent work when estimated daily spend reaches the limit.</p></div><button class="button button--secondary" data-action="edit-cost-limit">${formatCurrency(preferences.daily_cost_limit || 5, 2)} / day</button></div>
            </div>
          </div>
        </article>

        <article class="card">
          <header class="card__head"><div><h3>External integrations</h3><p>Adapters are visible now; implementation is intentionally deferred</p></div></header>
          <div class="card__body">
            <div class="integration-grid">${INTEGRATIONS.map((integration) => `
              <div class="integration-card">
                <span class="integration-logo" style="--logo-color:${integration.color};--logo-soft:${integration.color}20">${integration.short}</span>
                <div><strong>${integration.name}</strong><small>${integration.detail}</small></div>
                ${badge(integration.status === "connected" ? "connected" : "pending", integration.status === "connected" ? "Live" : "Later")}
              </div>
            `).join("")}</div>
          </div>
        </article>

        <article class="card">
          <header class="card__head"><div><h3>Custom MCP boundary</h3><p>Prepared for any AI client, implemented after the manual workflow is proven</p></div></header>
          <div class="card__body">
            <div class="grid grid--3">
              <div><span class="eyebrow">Read tools</span><p style="margin-top:8px;color:var(--text-soft);font-size:10px;line-height:1.6">Pipeline summaries, prospect context, demo state, approvals, analytics, and cost records.</p></div>
              <div><span class="eyebrow">Write tools</span><p style="margin-top:8px;color:var(--text-soft);font-size:10px;line-height:1.6">Create drafts and proposed actions. External effects stay approval-gated.</p></div>
              <div><span class="eyebrow">Auth</span><p style="margin-top:8px;color:var(--text-soft);font-size:10px;line-height:1.6">A future Worker will hold secrets and verify the caller. No secret keys belong in this frontend.</p></div>
            </div>
          </div>
        </article>
      </div>

      <aside class="section-stack">
        <article class="card">
          <header class="card__head"><div><h3>Three-agent split</h3><p>Clear ownership, lower cost</p></div></header>
          <div class="card__body">
            <div class="settings-list">
              <div class="settings-row"><div><strong>Orchestrator</strong><p>Plans steps, routes work, stops for approval.</p></div><span class="metric-icon">${icon("bot")}</span></div>
              <div class="settings-row"><div><strong>Designer</strong><p>Chooses templates, prepares demos, runs QA.</p></div><span class="metric-icon" style="--metric-color:var(--blue);--metric-soft:var(--blue-soft)">${icon("wand-sparkles")}</span></div>
              <div class="settings-row"><div><strong>Writer</strong><p>Produces personalized email and reply drafts.</p></div><span class="metric-icon" style="--metric-color:var(--green);--metric-soft:var(--green-soft)">${icon("pencil")}</span></div>
            </div>
          </div>
        </article>

        <article class="card">
          <header class="card__head"><div><h3>Account</h3><p>Owner-scoped workspace</p></div></header>
          <div class="card__body">
            <div class="settings-list">
              <div class="settings-row"><div><strong>${escapeHtml(data.profile?.full_name || "Owner")}</strong><p>${escapeHtml(getState().user?.email || "Preview workspace")}</p></div>${badge(data.profile?.role || "owner", data.profile?.role || "owner")}</div>
              <div class="settings-row"><div><strong>Data isolation</strong><p>RLS restricts every row to the signed-in owner.</p></div>${badge("active", "Protected")}</div>
              <div class="settings-row"><div><strong>Demo storage</strong><p>Private per-user folder policy.</p></div>${badge("active", "Protected")}</div>
            </div>
            ${button(mode === "preview" ? "Exit preview" : "Sign out", { action: mode === "preview" ? "exit-preview" : "sign-out", iconName: "log-out", variant: "danger", attrs: 'style="width:100%;margin-top:13px"' })}
          </div>
        </article>
      </aside>
    </section>
  `;
}

