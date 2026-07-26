import { pageHead, metricCard } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml, groupBy, sum } from "../core/utils.js";
import {
  badge,
  button,
  byId,
  clientName,
  compactMetric,
  formatCurrency,
  formatDate,
  formatNumber,
  horizontalBars,
  icon,
  leadName,
  miniLineChart,
  primaryCell,
  revenueSummary,
  sectionCard,
  statusLabel,
  tableEmpty,
} from "./shared.js";

function paidPayments(data) {
  return data.payments.filter((item) => ["paid", "available"].includes(item.status));
}

export function renderPayments() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const type = routeParams.type || "all";
  const status = routeParams.status || "all";
  const rows = data.payments.filter((payment) => (
    (type === "all" || payment.payment_type === type)
    && (status === "all" || payment.status === status)
    && (!query || `${payment.customer_name} ${payment.external_transaction_id} ${payment.source}`.toLowerCase().includes(query))
  ));
  const paid = paidPayments(data);
  return `
    ${pageHead("Payments", "Website sales and maintenance revenue prepared for future Whop webhooks.", button("Record payment", { action: "new-payment", iconName: "plus", variant: "primary" }))}
    <div class="placeholder-banner">${icon("wallet-cards")}<div><strong>Whop sync is not connected</strong><span>Recorded payments, fees, refunds, client links, and transaction placeholders are persistent now.</span></div>${badge("setup_required", "Whop pending")}</div>
    <section class="grid grid--4 metric-grid-mobile">
      ${metricCard({ label: "Revenue", value: formatCurrency(sum(paid, (item) => item.amount)), iconName: "trending-up", foot: "Paid + available", tone: "green" })}
      ${metricCard({ label: "Pending", value: formatCurrency(sum(data.payments.filter((item) => item.status === "pending"), (item) => item.amount)), iconName: "clock", foot: "Awaiting settlement", tone: "yellow" })}
      ${metricCard({ label: "Website revenue", value: formatCurrency(sum(paid.filter((item) => item.payment_type === "website_sale"), (item) => item.amount)), iconName: "monitor-up", foot: "One-time sales", tone: "blue" })}
      ${metricCard({ label: "Maintenance revenue", value: formatCurrency(sum(paid.filter((item) => item.payment_type === "maintenance"), (item) => item.amount)), iconName: "refresh-cw", foot: "Recurring payments", tone: "purple" })}
    </section>
    <section class="kpi-strip kpi-strip--compact">
      ${compactMetric("Available", formatCurrency(sum(data.payments.filter((item) => item.status === "available"), (item) => item.amount)), "recorded")}
      ${compactMetric("Fees", formatCurrency(sum(data.payments, (item) => item.fee_amount)), "payment costs")}
      ${compactMetric("Refunds", formatCurrency(sum(data.payments.filter((item) => item.status === "refunded"), (item) => item.amount)), "returned")}
      ${compactMetric("Transactions", data.payments.length, "all records")}
    </section>
    <div class="toolbar">
      <div class="toolbar__group toolbar__group--grow">
        <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search customer or transaction" value="${escapeHtml(routeParams.q || "")}"></label>
        <select class="compact-select" data-action="route-select" data-key="type"><option value="all">All payment types</option><option value="website_sale" ${type === "website_sale" ? "selected" : ""}>Website sale</option><option value="maintenance" ${type === "maintenance" ? "selected" : ""}>Maintenance</option></select>
        <select class="compact-select" data-action="route-select" data-key="status"><option value="all">All statuses</option>${["pending", "paid", "available", "failed", "refunded"].map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select>
      </div>
    </div>
    <section class="card"><div class="table-wrap"><table class="data-table responsive-table">
      <thead><tr><th>Customer</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th><th>Fees</th><th>Refund</th><th>Source</th><th>Transaction</th></tr></thead>
      <tbody>${rows.map((payment) => `<tr>
        <td data-label="Customer">${primaryCell(payment.customer_name || clientName(data, byId(data.clients, payment.client_id)), payment.client_id ? "Linked client" : "Unlinked")}</td>
        <td data-label="Type">${badge(payment.payment_type === "maintenance" ? "active" : "connected", statusLabel(payment.payment_type))}</td>
        <td data-label="Amount"><strong>${formatCurrency(payment.amount)}</strong></td>
        <td data-label="Date">${formatDate(payment.paid_at || payment.created_at, { year: "numeric" })}</td>
        <td data-label="Status">${badge(payment.status, statusLabel(payment.status))}</td>
        <td data-label="Fees">${formatCurrency(payment.fee_amount, 2)}</td>
        <td data-label="Refund">${escapeHtml(statusLabel(payment.refund_state || "none"))}</td>
        <td data-label="Source">${escapeHtml(payment.source || "manual")}</td>
        <td data-label="Transaction"><code class="id-code">${escapeHtml(payment.external_transaction_id || "placeholder")}</code></td>
      </tr>`).join("") || tableEmpty(9, "No payments found", "Record the first website sale or maintenance payment.")}</tbody>
    </table></div></section>
  `;
}

function paymentTrend(data) {
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index), 1);
    return { year: date.getFullYear(), month: date.getMonth(), label: date.toLocaleDateString("en-US", { month: "short" }), value: 0 };
  });
  paidPayments(data).forEach((payment) => {
    const date = new Date(payment.paid_at || payment.created_at);
    const bucket = buckets.find((item) => item.year === date.getFullYear() && item.month === date.getMonth());
    if (bucket) bucket.value += Number(payment.amount || 0);
  });
  return buckets;
}

function revenueBreakdown(data, selector) {
  const totals = {};
  paidPayments(data).filter((item) => item.payment_type === "website_sale").forEach((payment) => {
    const client = byId(data.clients, payment.client_id);
    const lead = client ? byId(data.leads, client.lead_id) : null;
    const key = selector(lead) || "Unknown";
    totals[key] = (totals[key] || 0) + Number(payment.amount || 0);
  });
  return Object.entries(totals).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function renderAnalytics() {
  const { data } = getState();
  const { gross, profit } = revenueSummary(data);
  const sent = data.drafts.filter((item) => item.status === "sent").length;
  const replies = data.emailThreads.length;
  const positive = data.emailThreads.filter((item) => ["interested", "needs_changes"].includes(item.classification)).length;
  const won = data.leads.filter((lead) => lead.status === "won").length;
  const averageDeal = won ? sum(data.clients, (client) => client.agreed_price) / won : 0;
  const trend = paymentTrend(data);
  const funnel = [
    ["Leads", data.leads.length, "#748095"],
    ["Demos", data.demos.length, "#8f75ff"],
    ["Emails", sent, "#4c8dff"],
    ["Replies", replies, "#43c9d7"],
    ["Interested", data.leads.filter((lead) => ["interested", "closing", "won"].includes(lead.status)).length, "#f1bf5a"],
    ["Sales", won, "#37d690"],
  ];
  const niche = revenueBreakdown(data, (lead) => lead?.category);
  const location = revenueBreakdown(data, (lead) => lead?.city);
  const mrr = sum(data.maintenanceSubscriptions.filter((item) => item.status === "active"), (item) => item.monthly_amount);

  return `
    ${pageHead("Analytics", "Revenue, outreach, funnel, niche, location, and maintenance performance in one decision view.")}
    <section class="grid grid--4 metric-grid-mobile">
      ${metricCard({ label: "Revenue", value: formatCurrency(gross), iconName: "trending-up", foot: `${won} sales`, tone: "green" })}
      ${metricCard({ label: "Profit", value: formatCurrency(profit), iconName: "circle-dollar-sign", foot: "Recorded net", tone: "purple" })}
      ${metricCard({ label: "Average deal", value: formatCurrency(averageDeal), iconName: "badge-dollar-sign", foot: "Per won lead", tone: "blue" })}
      ${metricCard({ label: "Close rate", value: `${data.leads.length ? ((won / data.leads.length) * 100).toFixed(1) : "0.0"}%`, iconName: "check-circle-2", foot: "Lead → sale", tone: "yellow" })}
    </section>
    <section class="kpi-strip">
      ${compactMetric("Revenue / lead", formatCurrency(data.leads.length ? gross / data.leads.length : 0), "efficiency")}
      ${compactMetric("Revenue / email", formatCurrency(sent ? gross / sent : 0), "outbound")}
      ${compactMetric("Reply rate", `${sent ? ((replies / sent) * 100).toFixed(1) : "0.0"}%`, `${replies} replies`)}
      ${compactMetric("Positive reply", `${replies ? ((positive / replies) * 100).toFixed(1) : "0.0"}%`, `${positive} positive`)}
      ${compactMetric("Maintenance MRR", formatCurrency(mrr), "recurring")}
      ${compactMetric("Active plans", data.maintenanceSubscriptions.filter((item) => item.status === "active").length, "maintenance")}
    </section>
    <section class="grid grid--wide">
      ${sectionCard("Revenue trend", "Recorded payments across six months", miniLineChart(trend.map((item) => item.value), { labels: trend.map((item) => item.label), color: "#37d690" }))}
      ${sectionCard("Full funnel", "Current record counts", horizontalBars(funnel.map(([label, value, color]) => ({ label, value, color }))))}
    </section>
    <section class="grid grid--2">
      ${sectionCard("Revenue by niche", "Optimize for high-value verticals", niche.length ? horizontalBars(niche, { valueFormatter: formatCurrency }) : `<p class="muted-copy">Revenue-linked niche data will appear after sales.</p>`)}
      ${sectionCard("Revenue by location", "Geographic performance", location.length ? horizontalBars(location, { valueFormatter: formatCurrency }) : `<p class="muted-copy">Revenue-linked location data will appear after sales.</p>`)}
    </section>
    <section class="grid grid--3">
      ${sectionCard("Outreach", "Recorded email outcomes", `<dl class="detail-list"><div><dt>Emails sent</dt><dd>${sent}</dd></div><div><dt>Replies</dt><dd>${replies}</dd></div><div><dt>Interested</dt><dd>${positive}</dd></div><div><dt>Follow-up conversion</dt><dd>${data.followUps.length ? ((data.followUps.filter((item) => ["replied", "completed"].includes(item.status)).length / data.followUps.length) * 100).toFixed(1) : "0.0"}%</dd></div></dl>`)}
      ${sectionCard("Maintenance", "Recurring customer health", `<dl class="detail-list"><div><dt>MRR</dt><dd>${formatCurrency(mrr)}</dd></div><div><dt>Active</dt><dd>${data.maintenanceSubscriptions.filter((item) => item.status === "active").length}</dd></div><div><dt>Cancellations</dt><dd>${data.maintenanceSubscriptions.filter((item) => item.status === "cancelled").length}</dd></div><div><dt>Revenue</dt><dd>${formatCurrency(sum(paidPayments(data).filter((item) => item.payment_type === "maintenance"), (item) => item.amount))}</dd></div></dl>`)}
      ${sectionCard("Unit economics", "Recorded operating efficiency", `<dl class="detail-list"><div><dt>Cost / lead</dt><dd>${formatCurrency(data.leads.length ? (gross - profit) / data.leads.length : 0, 2)}</dd></div><div><dt>Cost / demo</dt><dd>${formatCurrency(data.demos.length ? (gross - profit) / data.demos.length : 0, 2)}</dd></div><div><dt>Cost / customer</dt><dd>${formatCurrency(data.clients.length ? (gross - profit) / data.clients.length : 0, 2)}</dd></div><div><dt>Net margin</dt><dd>${gross ? ((profit / gross) * 100).toFixed(1) : "0.0"}%</dd></div></dl>`)}
    </section>
  `;
}

export function renderPricing() {
  const { data } = getState();
  const experiments = [...data.pricingExperiments].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  const winner = experiments[0];
  return `
    ${pageHead("Pricing Experiments", "Compare $400, $500, and $700 offers by revenue—not conversion alone.", button("New experiment", { action: "new-pricing-experiment", iconName: "plus", variant: "primary" }))}
    ${winner ? `<div class="insight-banner">${icon("trending-up")}<div><strong>Current revenue leader: ${escapeHtml(winner.name)}</strong><span>${formatCurrency(winner.revenue)} total · ${winner.sent_count ? formatCurrency(winner.revenue / winner.sent_count, 2) : "$0.00"} revenue per email</span></div>${badge("connected", "Best recorded revenue")}</div>` : ""}
    <section class="card"><div class="table-wrap"><table class="data-table responsive-table">
      <thead><tr><th>Experiment</th><th>Price</th><th>Dates</th><th>Emails</th><th>Replies</th><th>Interested</th><th>Sales</th><th>Close rate</th><th>Revenue</th><th>Revenue/email</th><th>Status</th><th></th></tr></thead>
      <tbody>${experiments.map((experiment) => {
        const closeRate = experiment.sent_count ? (Number(experiment.close_count || 0) / Number(experiment.sent_count)) * 100 : 0;
        const revenueEmail = experiment.sent_count ? Number(experiment.revenue || 0) / Number(experiment.sent_count) : 0;
        return `<tr>
          <td data-label="Experiment">${primaryCell(experiment.name, experiment.id === winner?.id ? "Revenue leader" : "")}</td>
          <td data-label="Price"><strong>${formatCurrency(experiment.offer_amount)}</strong></td>
          <td data-label="Dates">${primaryCell(formatDate(experiment.started_at), experiment.ended_at ? `to ${formatDate(experiment.ended_at)}` : "ongoing")}</td>
          <td data-label="Emails">${formatNumber(experiment.sent_count)}</td>
          <td data-label="Replies">${formatNumber(experiment.reply_count)}</td>
          <td data-label="Interested">${formatNumber(experiment.interested_count || experiment.reply_count || 0)}</td>
          <td data-label="Sales">${formatNumber(experiment.close_count)}</td>
          <td data-label="Close rate">${closeRate.toFixed(1)}%</td>
          <td data-label="Revenue"><strong>${formatCurrency(experiment.revenue)}</strong></td>
          <td data-label="Revenue/email">${formatCurrency(revenueEmail, 2)}</td>
          <td data-label="Status">${badge(experiment.status, statusLabel(experiment.status))}</td>
          <td data-label="Action"><button class="button button--ghost" data-action="edit-pricing" data-id="${experiment.id}">Edit</button></td>
        </tr>`;
      }).join("") || tableEmpty(12, "No pricing experiments", "Create a controlled offer test.")}</tbody>
    </table></div></section>
  `;
}

export function renderCosts() {
  const { data, routeParams } = getState();
  const { gross, profit, costs } = revenueSummary(data);
  const view = routeParams.view || "expenses";
  const aiSpend = sum(data.aiUsage, (item) => item.cost);
  const costToday = sum(data.expenses.filter((item) => new Date(`${item.occurred_on}T12:00:00`).toDateString() === new Date().toDateString()), (item) => item.amount)
    + sum(data.aiUsage.filter((item) => new Date(item.occurred_at).toDateString() === new Date().toDateString()), (item) => item.cost);
  const expenseGroups = Object.entries(groupBy(data.expenses, (item) => item.category)).map(([label, items]) => ({ label: statusLabel(label), value: sum(items, (item) => item.amount) }));
  return `
    ${pageHead("Costs", "Operating expenses and AI usage together, with lead and client association ready.", view === "expenses" ? button("Add expense", { action: "new-expense", iconName: "plus", variant: "primary" }) : "")}
    <section class="grid grid--4 metric-grid-mobile">
      ${metricCard({ label: "Cost today", value: formatCurrency(costToday, 2), iconName: "circle-dollar-sign", foot: "Recorded today", tone: "yellow" })}
      ${metricCard({ label: "Operating cost", value: formatCurrency(costs, 2), iconName: "wallet-cards", foot: "Expenses + AI", tone: "red" })}
      ${metricCard({ label: "AI spend", value: formatCurrency(aiSpend, 2), iconName: "sparkles", foot: `${sum(data.aiUsage, (item) => item.request_count)} requests`, tone: "purple" })}
      ${metricCard({ label: "Net profit", value: formatCurrency(profit), iconName: "trending-up", foot: `${gross ? ((profit / gross) * 100).toFixed(1) : "0.0"}% margin`, tone: profit >= 0 ? "green" : "red" })}
    </section>
    <section class="kpi-strip kpi-strip--compact">
      ${compactMetric("Cost / lead", formatCurrency(data.leads.length ? costs / data.leads.length : 0, 2), `${data.leads.length} leads`)}
      ${compactMetric("Cost / demo", formatCurrency(data.demos.length ? costs / data.demos.length : 0, 2), `${data.demos.length} demos`)}
      ${compactMetric("Cost / customer", formatCurrency(data.clients.length ? costs / data.clients.length : 0, 2), `${data.clients.length} clients`)}
      ${compactMetric("API + AI", formatCurrency(sum(data.expenses.filter((item) => item.category === "apis"), (item) => item.amount) + aiSpend, 2), "variable tooling")}
    </section>
    <div class="toolbar"><div class="tabs"><button class="tab ${view === "expenses" ? "is-active" : ""}" data-action="route-filter" data-key="view" data-value="expenses">Expenses</button><button class="tab ${view === "ai" ? "is-active" : ""}" data-action="route-filter" data-key="view" data-value="ai">AI usage</button></div></div>
    ${view === "expenses" ? `<section class="grid grid--wide">
      <section class="card"><div class="table-wrap"><table class="data-table responsive-table">
        <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th>Lead / client</th><th>Amount</th><th></th></tr></thead>
        <tbody>${data.expenses.map((expense) => `<tr>
          <td data-label="Date">${formatDate(expense.occurred_on, { year: "numeric" })}</td><td data-label="Category">${badge("active", statusLabel(expense.category))}</td><td data-label="Vendor">${escapeHtml(expense.vendor || "—")}</td><td data-label="Description">${escapeHtml(expense.description || "—")}</td><td data-label="Association">${escapeHtml(expense.lead_id ? leadName(data, expense.lead_id) : expense.client_id ? clientName(data, byId(data.clients, expense.client_id)) : "Operations")}</td><td data-label="Amount"><strong>${formatCurrency(expense.amount, 2)}</strong></td><td data-label="Action"><button class="button button--ghost" data-action="edit-expense" data-id="${expense.id}">Edit</button></td>
        </tr>`).join("") || tableEmpty(7, "No expenses", "Record operating costs to see true profit.")}</tbody>
      </table></div></section>
      ${sectionCard("Cost composition", "Recorded expenses by category", expenseGroups.length ? horizontalBars(expenseGroups, { valueFormatter: (value) => formatCurrency(value, 2) }) : `<p class="muted-copy">No expense composition yet.</p>`)}
    </section>` : `<section class="card"><div class="table-wrap"><table class="data-table responsive-table">
      <thead><tr><th>Provider</th><th>Model</th><th>Task</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th><th>Lead / client</th><th>Cost</th><th>Date</th></tr></thead>
      <tbody>${data.aiUsage.map((usage) => `<tr>
        <td data-label="Provider">${escapeHtml(usage.provider)}</td><td data-label="Model">${escapeHtml(usage.model)}</td><td data-label="Task">${escapeHtml(usage.task)}</td><td data-label="Requests">${formatNumber(usage.request_count)}</td><td data-label="Input">${formatNumber(usage.input_tokens)}</td><td data-label="Output">${formatNumber(usage.output_tokens)}</td><td data-label="Association">${escapeHtml(usage.lead_id ? leadName(data, usage.lead_id) : usage.client_id ? clientName(data, byId(data.clients, usage.client_id)) : "Operations")}</td><td data-label="Cost"><strong>${formatCurrency(usage.cost, 4)}</strong></td><td data-label="Date">${formatDate(usage.occurred_at)}</td>
      </tr>`).join("") || tableEmpty(9, "No AI usage", "Provider usage records will appear when AI integrations are connected.")}</tbody>
    </table></div></section>`}
  `;
}
