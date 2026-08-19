/** Clients, Projects and Maintenance. */
import { PROJECT_STAGES } from "../config.js";
import { CONFIG } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, formatDateTime, formatNumber, relativeTime, statusLabel, sum } from "../core/utils.js";
import { bar, btn, empty, icon, notice, pageHeader, pill, row, rows, section, stats, table, td } from "../components/ui.js";
import { clientLifecycleRows } from "../services/operations.js";
import { isOwner } from "../services/permissions.js";
import { byId, clientName, filterSelect, searchInput } from "./shared.js";

export function renderClients() {
  const { data, routeParams, services } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const stage = routeParams.stage || "all";
  const allLifecycles = clientLifecycleRows(data);
  const lifecycles = allLifecycles
    .filter((item) => stage === "all" || (stage === "attention" ? item.tone !== "green" : item.currentStage === stage))
    .filter((item) => !query || `${clientName(data, item.client)} ${item.client.contact_name} ${item.client.email} ${item.client.package_name}`.toLowerCase().includes(query));
  const activeSubscriptions = data.maintenanceSubscriptions.filter((item) => item.status === "active");
  const provider = services.elevenlabs || { connected: false, webhook_configured: false };
  const conversations = data.voiceConversations.filter((item) => !item.is_example).slice(0, 10);

  return `
    <div class="stack crm-center">
      ${pageHeader({
        title: "Clients",
        subtitle: "Service delivery, agent health, and the next action for each account.",
        actions: btn("New client", { action: "client-new", iconName: "plus", variant: "primary" }),
      })}
      <div class="crm-center__pulse">
        <span><b>${data.clients.length}</b> clients</span>
        <span><b>${allLifecycles.filter((item) => item.tone !== "green").length}</b> need action</span>
        <span><b>${formatCurrency(sum(activeSubscriptions, (item) => item.monthly_amount))}</b> MRR</span>
      </div>

      ${provider.connected
        ? notice("ElevenLabs is connected", provider.webhook_configured ? "Agent actions and signed post-call records are managed server-side." : "Agent actions work; the signed post-call webhook still needs its secret.", { tone: provider.webhook_configured ? "success" : "warn", iconName: provider.webhook_configured ? "check-circle" : "alert", actions: isOwner() ? btn("Sync agents", { action: "voice-agent-sync", size: "sm" }) : "" })
        : notice("ElevenLabs needs server-side setup", "Agent actions stay unavailable until the Edge Function connection passes. No browser credential fallback is allowed.", { tone: "warn", iconName: "lock" })}

      <div class="toolbar">
        ${searchInput("Search clients", routeParams.q || "")}
        ${filterSelect("stage", ["attention", "payment", "onboarding", "agent", "deployment", "service"].map((value) => ({ value, label: value === "attention" ? "Needs action" : statusLabel(value) })), stage, "All clients")}
        <span class="toolbar__spacer"></span>
      </div>

      <div class="client-lifecycle-list">
        ${lifecycles.length ? lifecycles.map((item) => {
          const { client, agent, onboarding, project, subscription, action } = item;
          return `<article class="client-lifecycle-card${item.tone === "red" ? " client-lifecycle-card--alert" : ""}">
            <header class="client-lifecycle-card__head">
              <div><span class="eyebrow">${escapeHtml(item.currentLabel)}</span><h3>${escapeHtml(clientName(data, client))}</h3><p>${escapeHtml(client.contact_name || "No primary contact")} &middot; ${escapeHtml(client.email || client.phone || "No contact details")}</p></div>
              <div class="client-lifecycle-card__value"><strong>${formatCurrency(client.setup_fee || client.agreed_price)}</strong><span>+ ${formatCurrency(client.monthly_fee || CONFIG.defaultMonthlyFee)}/mo</span></div>
            </header>
            <div class="lifecycle-track" aria-label="Client lifecycle">
              ${item.stages.map((step) => `<span class="lifecycle-step${step.complete ? " is-done" : step.id === item.currentStage ? " is-current" : ""}" title="${escapeHtml(step.complete ? `${step.label} complete` : step.label)}">${icon(step.complete ? "check" : "circle")}<b>${escapeHtml(step.label)}</b></span>`).join("")}
            </div>
            <div class="client-lifecycle-card__body">
              <div class="next-action"><span>Next action</span><strong>${escapeHtml(item.nextAction)}</strong><small>${item.progress}% through activation and service setup</small></div>
              <dl class="client-facts">
                <div><dt>Payment</dt><dd>${item.paymentComplete ? pill("paid") : `${formatCurrency(item.setupBalance)} due`}</dd></div>
                <div><dt>Onboarding</dt><dd>${pill(onboarding?.status || client.onboarding_status || "not_started")} ${onboarding ? `${Number(onboarding.progress || 0)}%` : ""}</dd></div>
                <div><dt>Agent</dt><dd>${agent ? pill(agent.last_error ? "error" : agent.status || "active") : "Not created"}</dd></div>
                <div><dt>Deployment</dt><dd>${pill(project?.deployment_status || "not_deployed")}</dd></div>
                <div><dt>Service</dt><dd>${pill(subscription?.status || (item.serviceActive ? "active" : "inactive"))}</dd></div>
                <div><dt>Calls</dt><dd>${formatNumber(item.conversations.length)}</dd></div>
              </dl>
            </div>
            <footer class="client-lifecycle-card__foot">
              <div class="btn-row">
                ${btn(action.label, { action: action.action, attrs: action.attrs, variant: item.tone === "green" ? "" : "primary", size: "sm" })}
                ${agent && action.action !== "voice-agent-open" ? btn("Configure agent", { action: "voice-agent-open", attrs: `data-id="${agent.id}"`, size: "sm" }) : ""}
                ${btn("Client details", { action: "client-open", attrs: `data-id="${client.id}"`, size: "sm", variant: "quiet" })}
                ${btn("Delete", { action: "client-delete", attrs: `data-id="${client.id}"`, size: "sm", variant: "danger" })}
              </div>
              <span class="faint">${client.updated_at ? `Updated ${relativeTime(client.updated_at)}` : "Lifecycle is derived from linked records"}</span>
            </footer>
          </article>`;
        }).join("") : empty({ title: "No clients match", message: data.clients.length ? "Change the lifecycle filter or search." : "Winning a lead creates the client, onboarding, and delivery records automatically." })}
      </div>

      ${section("Recent client calls", {
        subtitle: "Signed ElevenLabs post-call records appear automatically",
        body: table({
          columns: ["Client", "Caller", "Summary", "When", ""],
          rows: conversations.map((conversation) => `<tr data-action="voice-conversation-open" data-id="${conversation.id}">
            ${td("Client", escapeHtml(clientName(data, byId(data.clients, conversation.client_id))))}
            ${td("Caller", escapeHtml(conversation.caller_name || conversation.caller_phone || "Unknown caller"))}
            ${td("Summary", `<div class="cell"><strong>${escapeHtml(conversation.problem || conversation.summary || "No summary returned")}</strong><span>${escapeHtml(conversation.appointment_status || conversation.call_successful || statusLabel(conversation.status))}</span></div>`)}
            ${td("When", formatDateTime(conversation.started_at || conversation.created_at))}
            ${td("", icon("chevron"))}
          </tr>`),
          emptyState: empty({ title: "No real client calls yet", message: "Completed signed post-call records appear here after the first connected agent call." }),
        }),
      })}
    </div>
  `;
}

export function renderProjects() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const status = routeParams.status || "all";
  const projects = data.projects
    .filter((project) => (status === "all" || project.status === status))
    .filter((project) => !query || `${project.name} ${clientName(data, byId(data.clients, project.client_id))}`.toLowerCase().includes(query));

  return `
    <div class="stack">
      ${section("Stages", {
        body: `<div class="stats">${PROJECT_STAGES.map((stage) => `<div class="stat"><b>${data.projects.filter((project) => project.status === stage).length}</b><span>${escapeHtml(statusLabel(stage))}</span></div>`).join("")}</div>`,
      })}

      <div class="toolbar">
        ${searchInput("Search projects", routeParams.q || "")}
        ${filterSelect("status", PROJECT_STAGES.map((value) => ({ value, label: statusLabel(value) })), status, "All stages")}
        <span class="toolbar__spacer"></span>
        ${btn("New project", { action: "project-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${projects.length ? rows(projects.map((project) => {
        const tasks = data.projectTasks.filter((task) => String(task.project_id) === String(project.id));
        const done = tasks.filter((task) => task.status === "completed").length;
        return `<div class="row">
          <span class="row__main">
            <strong>${escapeHtml(project.name)}</strong>
            <span>${escapeHtml(clientName(data, byId(data.clients, project.client_id)))} · ${escapeHtml(project.automation_type || "Automation project")} · ${done}/${tasks.length} tasks · target ${formatDate(project.target_launch || project.deadline)}</span>
            ${bar(project.progress)}
          </span>
          <span class="row__side">
            ${pill(project.status)}
            ${btn("Advance", { action: "project-advance", size: "sm", attrs: `data-id="${project.id}"` })}
            ${btn("Open", { action: "project-open", size: "sm", attrs: `data-id="${project.id}"` })}
          </span>
        </div>`;
      })) : empty({ title: "No projects", message: "Projects track automation delivery from discovery through maintenance." })}
    </div>
  `;
}

export function renderMaintenance() {
  const { data, routeParams } = getState();
  const status = routeParams.status || "all";
  const subscriptions = data.maintenanceSubscriptions.filter((item) => status === "all" || item.status === status);
  const active = data.maintenanceSubscriptions.filter((item) => item.status === "active");
  const openRequests = data.maintenanceRequests.filter((request) => request.status !== "completed");

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["MRR", formatCurrency(sum(active, (item) => item.monthly_amount))],
          ["Active plans", formatNumber(active.length)],
          ["Open requests", formatNumber(openRequests.length)],
          ["Cancelled", formatNumber(data.maintenanceSubscriptions.filter((item) => item.status === "cancelled").length)],
        ]),
      })}

      <div class="toolbar">
        ${filterSelect("status", ["active", "inactive", "past_due", "cancelled"].map((value) => ({ value, label: statusLabel(value) })), status, "All plans")}
        <span class="toolbar__spacer"></span>
        ${btn("Add plan", { action: "maintenance-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${table({
        columns: ["Client", "Plan", "Status", "Next charge", "Last payment", ""],
        rows: subscriptions.map((subscription) => {
          const client = byId(data.clients, subscription.client_id);
          return `<tr>
            ${td("Client", `<div class="cell"><strong>${escapeHtml(clientName(data, client))}</strong><span>${escapeHtml(byId(data.clientSites, subscription.site_id)?.domain || "")}</span></div>`)}
            ${td("Plan", `${escapeHtml(subscription.plan_name || "Maintenance")} · ${formatCurrency(subscription.monthly_amount)}/mo`)}
            ${td("Status", pill(subscription.status))}
            ${td("Next charge", formatDate(subscription.next_charge_on))}
            ${td("Last payment", formatDate(subscription.last_payment_on))}
            ${td("", btn("Edit", { action: "maintenance-open", size: "sm", attrs: `data-id="${subscription.id}"` }))}
          </tr>`;
        }),
        emptyState: empty({ title: "No maintenance plans", message: "Offer $50/month care when a client site launches." }),
      })}

      ${section("Requests", {
        count: data.maintenanceRequests.length,
        body: data.maintenanceRequests.length ? rows(data.maintenanceRequests.map((request) => {
          const subscription = byId(data.maintenanceSubscriptions, request.subscription_id);
          return row({
            main: request.title,
            sub: `${clientName(data, byId(data.clients, subscription?.client_id))} · ${request.description || ""}`,
            iconName: "refresh",
            side: `${pill(request.status)}<span class="faint">${relativeTime(request.created_at)}</span>${btn(request.status === "completed" ? "Reopen" : "Complete", { action: "maintenance-request-toggle", size: "sm", attrs: `data-id="${request.id}"` })}`,
          });
        })) : empty({ title: "No requests", message: "Client change requests appear here." }),
      })}
    </div>
  `;
}
