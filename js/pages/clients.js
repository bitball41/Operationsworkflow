/** Clients, Projects and Maintenance. */
import { PROJECT_STAGES } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber, relativeTime, statusLabel, sum } from "../core/utils.js";
import { bar, btn, empty, externalLink, icon, pill, row, rows, section, stats, table, td } from "../components/ui.js";
import { byId, clientName, filterSelect, searchInput } from "./shared.js";

export function renderClients() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const status = routeParams.status || "all";
  const clients = data.clients
    .filter((client) => (status === "all" || client.status === status))
    .filter((client) => !query || `${clientName(data, client)} ${client.contact_name} ${client.domain}`.toLowerCase().includes(query));

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["Clients", formatNumber(data.clients.length)],
          ["Active", formatNumber(data.clients.filter((client) => client.status === "active").length)],
          ["Collected", formatCurrency(sum(data.clients, (client) => client.amount_received))],
          ["Outstanding", formatCurrency(sum(data.clients, (client) => Math.max(0, Number(client.agreed_price || 0) - Number(client.amount_received || 0))))],
        ]),
      })}

      <div class="toolbar">
        ${searchInput("Search clients", routeParams.q || "")}
        ${filterSelect("status", ["onboarding", "active", "awaiting_content", "ready_to_launch", "completed", "paused"].map((value) => ({ value, label: statusLabel(value) })), status, "All statuses")}
        <span class="toolbar__spacer"></span>
        ${btn("New client", { action: "client-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${table({
        columns: ["Business", "Contact", "Site", "Price", "Paid", "Status", ""],
        rows: clients.map((client) => `<tr data-action="client-open" data-id="${client.id}">
          ${td("Business", `<div class="cell"><strong>${escapeHtml(clientName(data, client))}</strong><span>${escapeHtml(client.package_name || "Website client")}</span></div>`)}
          ${td("Contact", escapeHtml(client.contact_name || client.email || "—"))}
          ${td("Site", client.production_url ? externalLink(client.production_url, client.domain || "Open") : escapeHtml(client.domain || "Not live"))}
          ${td("Price", formatCurrency(client.agreed_price))}
          ${td("Paid", `${formatCurrency(client.amount_received)} ${pill(client.payment_status || "pending")}`)}
          ${td("Status", pill(client.status))}
          ${td("", icon("chevron"))}
        </tr>`),
        emptyState: empty({ title: "No clients yet", message: "Convert a won lead into a client to start fulfilment." }),
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
            <span>${escapeHtml(clientName(data, byId(data.clients, project.client_id)))} · ${done}/${tasks.length} tasks · due ${formatDate(project.deadline)}</span>
            ${bar(project.progress)}
          </span>
          <span class="row__side">
            ${pill(project.status)}
            ${btn("Advance", { action: "project-advance", size: "sm", attrs: `data-id="${project.id}"` })}
            ${btn("Open", { action: "project-open", size: "sm", attrs: `data-id="${project.id}"` })}
          </span>
        </div>`;
      })) : empty({ title: "No projects", message: "Projects track fulfilment from payment to launch." })}
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
