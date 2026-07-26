import { pageHead } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml, sum } from "../core/utils.js";
import {
  badge,
  button,
  byId,
  clientName,
  compactMetric,
  formatCurrency,
  formatDate,
  icon,
  leadName,
  linkOut,
  primaryCell,
  renderPillList,
  sectionCard,
  statusLabel,
  tableEmpty,
} from "./shared.js";

export function renderClients() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const status = routeParams.status || "all";
  const rows = data.clients.filter((client) => {
    const name = clientName(data, client);
    return (status === "all" || client.status === status)
      && (!query || `${name} ${client.contact_name} ${client.email} ${client.domain}`.toLowerCase().includes(query));
  });
  return `
    ${pageHead("Clients", "Closed businesses with website, project, payment, maintenance, email, notes, and activity context.", button("Convert won lead", { action: "new-client", iconName: "plus", variant: "primary" }))}
    <section class="kpi-strip kpi-strip--compact">
      ${compactMetric("Clients", data.clients.length, "all time")}
      ${compactMetric("Active", data.clients.filter((item) => item.status === "active").length, "live relationships")}
      ${compactMetric("Onboarding", data.clients.filter((item) => item.status === "onboarding").length, "fulfillment")}
      ${compactMetric("Collected", formatCurrency(sum(data.clients, (item) => item.amount_received)), "recorded")}
    </section>
    <div class="toolbar">
      <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search clients, contacts, domains…" value="${escapeHtml(routeParams.q || "")}"></label>
      <select class="compact-select" data-action="route-select" data-key="status"><option value="all">All statuses</option>${["onboarding", "active", "awaiting_content", "ready_to_launch", "completed", "paused"].map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select>
    </div>
    <section class="card">
      <div class="table-wrap"><table class="data-table responsive-table">
        <thead><tr><th>Business</th><th>Contact</th><th>Website</th><th>Sale</th><th>Payment</th><th>Project</th><th>Maintenance</th><th>Purchase</th><th></th></tr></thead>
        <tbody>${rows.map((client) => {
          const lead = byId(data.leads, client.lead_id);
          const project = data.projects.find((item) => item.client_id === client.id);
          const maintenance = data.maintenanceSubscriptions.find((item) => item.client_id === client.id);
          return `<tr data-action="open-client" data-id="${client.id}">
            <td data-label="Business">${primaryCell(lead?.business_name || "Unknown business", client.package_name || "Website client")}</td>
            <td data-label="Contact">${primaryCell(client.contact_name || lead?.contact_name || "No contact", client.email || client.phone || "No details")}</td>
            <td data-label="Website">${client.production_url ? linkOut(client.production_url, client.domain || "Open site") : `<span class="muted-copy">${escapeHtml(client.domain || "Not live")}</span>`}</td>
            <td data-label="Sale">${formatCurrency(client.agreed_price)}</td>
            <td data-label="Payment">${badge(client.payment_status || "pending", statusLabel(client.payment_status || "pending"))}</td>
            <td data-label="Project">${project ? badge(project.status, statusLabel(project.status)) : "—"}</td>
            <td data-label="Maintenance">${maintenance ? badge(maintenance.status, `${statusLabel(maintenance.status)} · ${formatCurrency(maintenance.monthly_amount)}/mo`) : badge("inactive", "Not active")}</td>
            <td data-label="Purchase">${formatDate(client.purchase_date || client.closed_at)}</td>
            <td data-label="Actions"><button class="icon-button icon-button--small" data-action="open-client" data-id="${client.id}" aria-label="Open client">${icon("chevron-right")}</button></td>
          </tr>`;
        }).join("") || tableEmpty(9, "No clients yet", "Move a lead to Won and convert it into a client.")}</tbody>
      </table></div>
    </section>
  `;
}

export function renderProjects() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const status = routeParams.status || "all";
  const rows = data.projects.filter((project) => (
    (status === "all" || project.status === status)
    && (!query || `${project.name} ${clientName(data, byId(data.clients, project.client_id))} ${project.notes}`.toLowerCase().includes(query))
  ));
  const stages = ["payment_received", "changes", "client_review", "domain_setup", "launch", "live"];
  return `
    ${pageHead("Projects", "Client fulfillment from recorded payment through production launch.", button("New project", { action: "new-project", iconName: "plus", variant: "primary" }))}
    <div class="workflow-stage-strip">${stages.map((stage, index) => `<span><i>${index + 1}</i>${statusLabel(stage)}<b>${data.projects.filter((project) => project.status === stage).length}</b></span>`).join("")}</div>
    <div class="toolbar">
      <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search projects or clients" value="${escapeHtml(routeParams.q || "")}"></label>
      <select class="compact-select" data-action="route-select" data-key="status"><option value="all">All stages</option>${stages.map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select>
    </div>
    <section class="project-grid">${rows.map((project) => {
      const client = byId(data.clients, project.client_id);
      const site = byId(data.clientSites, project.site_id);
      const tasks = data.projectTasks.filter((item) => item.project_id === project.id);
      const completed = tasks.filter((item) => item.status === "completed").length;
      return `<article class="card project-card">
        <header><div><span class="eyebrow">${escapeHtml(clientName(data, client))}</span><h3>${escapeHtml(project.name)}</h3></div>${badge(project.status, statusLabel(project.status))}</header>
        <div class="project-progress"><div><span>Project progress</span><b>${Number(project.progress || 0)}%</b></div><div class="progress"><i style="width:${Number(project.progress || 0)}%"></i></div></div>
        <dl class="detail-list detail-list--compact">
          <div><dt>Deadline</dt><dd>${formatDate(project.deadline, { year: "numeric" })}</dd></div>
          <div><dt>Tasks</dt><dd>${completed}/${tasks.length} complete</dd></div>
          <div><dt>Site</dt><dd>${escapeHtml(site?.domain || site?.name || "Draft")}</dd></div>
          <div><dt>Edits</dt><dd>${Number(project.requested_edits?.length || 0)} requested</dd></div>
        </dl>
        ${project.requested_edits?.length ? `<div class="requested-edits"><span>Requested edits</span>${renderPillList(project.requested_edits)}</div>` : ""}
        <footer><button class="button button--ghost" data-action="open-project" data-id="${project.id}">Details</button>${site?.production_url ? linkOut(site.production_url, "Open site") : ""}<button class="button button--primary" data-action="advance-project" data-id="${project.id}">Advance stage</button></footer>
      </article>`;
    }).join("") || `<div class="card healthy-state healthy-state--large">${icon("clipboard-check")}<div><strong>No projects found</strong><span>Create a fulfillment project for a client.</span></div></div>`}</section>
  `;
}

export function renderMaintenance() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const status = routeParams.status || "all";
  const rows = data.maintenanceSubscriptions.filter((subscription) => (
    (status === "all" || subscription.status === status)
    && (!query || clientName(data, byId(data.clients, subscription.client_id)).toLowerCase().includes(query))
  ));
  const active = data.maintenanceSubscriptions.filter((item) => item.status === "active");
  const mrr = sum(active, (item) => item.monthly_amount);
  const maintenancePayments = data.payments.filter((item) => item.payment_type === "maintenance" && ["paid", "available"].includes(item.status));
  const cancellations = data.maintenanceSubscriptions.filter((item) => item.status === "cancelled").length;
  const churn = data.maintenanceSubscriptions.length ? (cancellations / data.maintenanceSubscriptions.length) * 100 : 0;

  return `
    ${pageHead("Maintenance", "$50/month optional site care, hosting, updates, and request history.", button("Add subscription", { action: "new-maintenance", iconName: "plus", variant: "primary" }))}
    <section class="grid grid--4 metric-grid-mobile">
      ${compactMetric("MRR", formatCurrency(mrr), "active recurring revenue")}
      ${compactMetric("Active", active.length, "subscriptions")}
      ${compactMetric("Maintenance revenue", formatCurrency(sum(maintenancePayments, (item) => item.amount)), "recorded")}
      ${compactMetric("Churn", `${churn.toFixed(1)}%`, `${cancellations} cancellations`)}
    </section>
    <div class="toolbar">
      <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search maintenance clients" value="${escapeHtml(routeParams.q || "")}"></label>
      <select class="compact-select" data-action="route-select" data-key="status"><option value="all">All subscriptions</option>${["active", "inactive", "past_due", "cancelled"].map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select>
    </div>
    <section class="card">
      <div class="table-wrap"><table class="data-table responsive-table">
        <thead><tr><th>Client / site</th><th>Plan</th><th>Status</th><th>Started</th><th>Next charge</th><th>Last payment</th><th>Revenue</th><th>Hosting</th><th>Domain</th><th></th></tr></thead>
        <tbody>${rows.map((subscription) => {
          const client = byId(data.clients, subscription.client_id);
          const site = byId(data.clientSites, subscription.site_id);
          const payments = maintenancePayments.filter((item) => item.maintenance_subscription_id === subscription.id);
          const requests = data.maintenanceRequests.filter((item) => item.subscription_id === subscription.id && item.status !== "completed");
          return `<tr>
            <td data-label="Client">${primaryCell(clientName(data, client), site?.domain || site?.name || "No site")}</td>
            <td data-label="Plan">${primaryCell(subscription.plan_name || "Website Maintenance", `${formatCurrency(subscription.monthly_amount)}/month`)}</td>
            <td data-label="Status">${badge(subscription.status, statusLabel(subscription.status))}</td>
            <td data-label="Started">${formatDate(subscription.started_on)}</td>
            <td data-label="Next charge">${formatDate(subscription.next_charge_on)}</td>
            <td data-label="Last payment">${formatDate(subscription.last_payment_on)}</td>
            <td data-label="Revenue">${formatCurrency(sum(payments, (item) => item.amount))}</td>
            <td data-label="Hosting">${badge(subscription.hosting_included ? "connected" : "inactive", subscription.hosting_included ? "Included" : "No")}</td>
            <td data-label="Domain">${badge(subscription.domain_managed ? "connected" : "inactive", subscription.domain_managed ? "Managed" : "Client")}</td>
            <td data-label="Actions"><button class="button button--ghost" data-action="open-maintenance" data-id="${subscription.id}">${requests.length} open request${requests.length === 1 ? "" : "s"}</button></td>
          </tr>`;
        }).join("") || tableEmpty(10, "No maintenance subscriptions", "Offer $50/month maintenance when a client site launches.")}</tbody>
      </table></div>
    </section>
    ${sectionCard(
      "Maintenance requests",
      "Update work and support history",
      `<div class="task-list">${data.maintenanceRequests.map((request) => {
        const subscription = byId(data.maintenanceSubscriptions, request.subscription_id);
        const client = subscription ? byId(data.clients, subscription.client_id) : null;
        return `<article class="task-row"><span class="timeline-icon">${icon("refresh-cw")}</span><div><strong>${escapeHtml(request.title)}</strong><span>${escapeHtml(clientName(data, client))} · ${escapeHtml(request.description || "")}</span></div>${badge(request.priority, statusLabel(request.priority))}${badge(request.status, statusLabel(request.status))}<button class="button button--ghost" data-action="maintenance-request-status" data-id="${request.id}">${request.status === "completed" ? "Reopen" : "Complete"}</button></article>`;
      }).join("") || `<p class="muted-copy">No maintenance requests.</p>`}</div>`,
    )}
  `;
}
