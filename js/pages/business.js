/** Payments, Analytics, Costs and Pricing Experiments. */
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber, groupBy, isSameMonth, statusLabel, sum } from "../core/utils.js";
import { bars, btn, empty, lineChart, notice, pageHeader, pill, section, stats, table, td } from "../components/ui.js";
import { isConnected } from "../services/integrations.js";
import { getPayments, revenueSummary } from "../services/operations.js";
import { isOwner, ownerOnlyNotice } from "../services/permissions.js";
import { byId, clientName, filterSelect, searchInput } from "./shared.js";

function monthlyRevenue(payments, months = 6) {
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (months - 1 - index));
    return { year: date.getFullYear(), month: date.getMonth(), label: date.toLocaleDateString("en-US", { month: "short" }), value: 0 };
  });
  payments.forEach((payment) => {
    const date = new Date(payment.paid_at || payment.created_at);
    const bucket = buckets.find((item) => item.year === date.getFullYear() && item.month === date.getMonth());
    if (bucket) bucket.value += Number(payment.amount || 0);
  });
  return buckets;
}

/** Cash in, recurring service, and real costs without separate finance tabs. */
export function renderMoneyCenter() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const paid = getPayments();
  const activeSubscriptions = data.maintenanceSubscriptions.filter((item) => item.status === "active");
  const outstanding = data.payments.filter((item) => ["pending", "overdue", "failed"].includes(item.status));
  const rowsToShow = data.payments.filter((payment) => (
    !query || `${payment.customer_name} ${payment.external_transaction_id || ""}`.toLowerCase().includes(query)
  ));
  const { gross, profit, costs } = revenueSummary();

  return `<div class="stack crm-center">
    ${pageHeader({
      title: "Finance",
      subtitle: "Collected revenue, outstanding balances, and recurring service. No invented accounting.",
      actions: isOwner() ? btn("Record payment", { action: "payment-new", iconName: "plus", variant: "primary" }) : "",
    })}
    <div class="crm-center__pulse">
      <span><b>${formatCurrency(gross)}</b> collected</span>
      <span><b>${formatCurrency(sum(activeSubscriptions, (item) => item.monthly_amount))}</b> MRR</span>
      <span><b>${formatCurrency(profit)}</b> recorded profit</span>
    </div>

    ${section("Cash position", { body: stats([
      ["This month", formatCurrency(sum(getPayments({ range: "month" }), (payment) => payment.amount))],
      ["Outstanding", formatCurrency(sum(outstanding, (payment) => payment.amount)), `${outstanding.length} payment${outstanding.length === 1 ? "" : "s"}`],
      ["Activation fees", formatCurrency(sum(paid.filter((payment) => payment.payment_type === "setup_fee"), (payment) => payment.amount))],
      ["Monthly payments", formatCurrency(sum(paid.filter((payment) => payment.payment_type === "recurring_subscription"), (payment) => payment.amount))],
      ["Recorded costs", formatCurrency(costs, 2)],
    ]) })}

    ${isConnected("whop") ? notice("Payment updates are automatic", "Signed Whop events update payment and client records; manual entry is only a fallback.", { tone: "success", iconName: "check-circle" }) : notice(
      "Whop is not connected",
      "Payment records can still be entered manually, but automatic receipt and refund updates remain unavailable until the signed webhook is configured.",
      { iconName: "wallet", tone: "warn" },
    )}
    ${isOwner() ? "" : notice("Money administration is owner-only", ownerOnlyNotice("Recording or editing payments and service"), { iconName: "wallet", tone: "warn" })}

    ${outstanding.length ? section("Needs collection", {
      count: outstanding.length,
      body: table({
        columns: ["Customer", "Type", "Balance", "Due", "Status", ""],
        rows: outstanding.map((payment) => `<tr>
          ${td("Customer", `<strong>${escapeHtml(payment.customer_name || clientName(data, byId(data.clients, payment.client_id)))}</strong>`)}
          ${td("Type", escapeHtml(statusLabel(payment.payment_type)))}
          ${td("Balance", `<strong>${formatCurrency(payment.amount)}</strong>`)}
          ${td("Due", formatDate(payment.due_date || payment.created_at, { year: "numeric" }))}
          ${td("Status", pill(payment.status))}
          ${td("", isOwner() ? btn("Update", { action: "payment-open", size: "sm", attrs: `data-id="${payment.id}"` }) : "")}
        </tr>`),
      }),
    }) : ""}

    ${section("Payments", {
      actions: searchInput("Search customer or transaction", routeParams.q || ""),
      body: table({
        columns: ["Customer", "Type", "Amount", "Status", "Date", "Source", ""],
        rows: rowsToShow.map((payment) => `<tr>
          ${td("Customer", `<strong>${escapeHtml(payment.customer_name || clientName(data, byId(data.clients, payment.client_id)))}</strong>`)}
          ${td("Type", escapeHtml(statusLabel(payment.payment_type)))}
          ${td("Amount", `<strong>${formatCurrency(payment.amount)}</strong>`)}
          ${td("Status", pill(payment.status))}
          ${td("Date", formatDate(payment.paid_at || payment.created_at, { year: "numeric" }))}
          ${td("Source", escapeHtml(payment.source || "manual"))}
          ${td("", isOwner() ? btn("Edit", { action: "payment-open", size: "sm", attrs: `data-id="${payment.id}"` }) : "")}
        </tr>`),
        emptyState: empty({ title: "No payments recorded", message: "Activation and recurring payments appear together here." }),
      }),
    })}

    ${section("Ongoing service", {
      actions: isOwner() ? btn("Add monthly service", { action: "subscription-new", iconName: "plus", variant: "primary", size: "sm" }) : "",
      body: table({
        columns: ["Client", "Service", "Monthly", "Next payment", "Status", ""],
        rows: data.maintenanceSubscriptions.map((subscription) => `<tr>
          ${td("Client", `<strong>${escapeHtml(clientName(data, byId(data.clients, subscription.client_id)))}</strong>`)}
          ${td("Service", escapeHtml(subscription.plan_name || "Managed AI receptionist"))}
          ${td("Monthly", `<strong>${formatCurrency(subscription.monthly_amount)}/mo</strong>`)}
          ${td("Next payment", formatDate(subscription.next_charge_on))}
          ${td("Status", pill(subscription.status))}
          ${td("", isOwner() ? btn("Edit", { action: "subscription-open", size: "sm", attrs: `data-id="${subscription.id}"` }) : "")}
        </tr>`),
        emptyState: empty({ title: "No monthly service records", message: "Activate the $997 monthly service when a client goes live." }),
      }),
    })}

    <div class="btn-row crm-center__utilities">
      ${btn("Review costs", { action: "navigate", attrs: 'data-route-target="costs"', size: "sm" })}
      ${btn("Sales analytics", { action: "navigate", attrs: 'data-route-target="analytics"', size: "sm" })}
      ${btn("Commissions", { action: "navigate", attrs: 'data-route-target="commissions"', size: "sm" })}
    </div>
  </div>`;
}

export function renderPayments() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const type = routeParams.type || "all";
  const payments = data.payments
    .filter((payment) => (type === "all" || payment.payment_type === type))
    .filter((payment) => !query || `${payment.customer_name} ${payment.external_transaction_id}`.toLowerCase().includes(query));
  const paid = getPayments();

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["Received", formatCurrency(sum(paid, (payment) => payment.amount))],
          ["This month", formatCurrency(sum(getPayments({ range: "month" }), (payment) => payment.amount))],
          ["Activation fees", formatCurrency(sum(paid.filter((payment) => payment.payment_type === "setup_fee"), (payment) => payment.amount))],
          ["Subscriptions", formatCurrency(sum(paid.filter((payment) => payment.payment_type === "recurring_subscription"), (payment) => payment.amount))],
          ["Overages", formatCurrency(sum(paid.filter((payment) => payment.payment_type === "usage_overage"), (payment) => payment.amount))],
          ["Fees", formatCurrency(sum(paid, (payment) => payment.fee_amount), 2)],
        ]),
      })}

      ${isConnected("whop") ? "" : notice(
        "Whop is not connected",
        "Payments arrive automatically after the Whop webhook is configured on the Cloudflare Worker.",
        { iconName: "wallet", tone: "warn" },
      )}

      ${isOwner() ? "" : notice("Payment administration is owner-only", ownerOnlyNotice("Recording or editing payments"), { iconName: "wallet", tone: "warn" })}

      <div class="toolbar">
        ${searchInput("Search customer or transaction", routeParams.q || "")}
        ${filterSelect("type", ["setup_fee", "recurring_subscription", "usage_overage", "custom_invoice", "refund"].map((value) => ({ value, label: statusLabel(value) })), type, "All types")}
        <span class="toolbar__spacer"></span>
        ${isOwner() ? btn("Record payment", { action: "payment-new", iconName: "plus", variant: "primary", size: "sm" }) : pill("warning", "View only")}
      </div>

      ${table({
        columns: ["Customer", "Type", "Amount", "Status", "Date", "Fee", ""],
        rows: payments.map((payment) => `<tr>
          ${td("Customer", `<div class="cell"><strong>${escapeHtml(payment.customer_name || clientName(data, byId(data.clients, payment.client_id)))}</strong><span>${escapeHtml(payment.source || "manual")}</span></div>`)}
          ${td("Type", escapeHtml(statusLabel(payment.payment_type)))}
          ${td("Amount", `<strong>${formatCurrency(payment.amount)}</strong>`)}
          ${td("Status", pill(payment.status))}
          ${td("Date", formatDate(payment.paid_at || payment.created_at, { year: "numeric" }))}
          ${td("Fee", formatCurrency(payment.fee_amount, 2))}
          ${td("", isOwner() ? btn("Edit", { action: "payment-open", size: "sm", attrs: `data-id="${payment.id}"` }) : pill("warning", "View only"))}
        </tr>`),
        emptyState: empty({ title: "No payments recorded", message: "Record a collected activation fee or $997 monthly subscription payment." }),
      })}
    </div>
  `;
}

export function renderAnalytics() {
  const { data } = getState();
  const { gross, profit, costs } = revenueSummary();
  const calls = data.salesCalls.length;
  const contacts = data.salesCalls.filter((call) => !["no_answer", "voicemail", "gatekeeper", "wrong_number"].includes(call.outcome)).length;
  const meetings = data.meetings.length;
  const won = data.leads.filter((lead) => lead.status === "won").length;
  const trend = monthlyRevenue(getPayments());

  const funnel = [
    { label: "Leads", value: data.leads.length },
    { label: "Calls", value: calls },
    { label: "Contacts", value: contacts },
    { label: "Meetings", value: meetings },
    { label: "Proposals", value: data.leads.filter((lead) => ["proposal_sent", "negotiating", "won"].includes(lead.status)).length },
    { label: "Won", value: won },
  ];

  const byNiche = Object.entries(groupBy(data.leads.filter((lead) => lead.status === "won"), (lead) => lead.category || "Unknown"))
    .map(([label, items]) => ({ label, value: items.length }))
    .sort((a, b) => b.value - a.value);

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["Revenue", formatCurrency(gross)],
          ["Profit", formatCurrency(profit)],
          ["Costs", formatCurrency(costs, 2)],
          ["Sales", formatNumber(won)],
          ["Close rate", `${data.leads.length ? ((won / data.leads.length) * 100).toFixed(1) : "0.0"}%`],
          ["Contact rate", `${calls ? ((contacts / calls) * 100).toFixed(1) : "0.0"}%`],
          ["Meeting rate", `${contacts ? ((meetings / contacts) * 100).toFixed(1) : "0.0"}%`],
        ]),
      })}

      ${section("Revenue by month", { body: lineChart(trend.map((item) => item.value), trend.map((item) => item.label)) })}

      <div class="split split--even">
        ${section("Funnel", { body: bars(funnel, formatNumber) })}
        ${section("Wins by niche", {
          body: byNiche.length ? bars(byNiche, formatNumber) : empty({ title: "No wins yet", message: "Niche performance appears after the first sale." }),
        })}
      </div>

      ${section("Per-unit economics", {
        body: stats([
          ["Revenue / lead", formatCurrency(data.leads.length ? gross / data.leads.length : 0, 2)],
          ["Revenue / call", formatCurrency(calls ? gross / calls : 0, 2)],
          ["Cost / lead", formatCurrency(data.leads.length ? costs / data.leads.length : 0, 2)],
          ["Cost / live automation", formatCurrency(data.automations.filter((item) => item.status === "live").length ? costs / data.automations.filter((item) => item.status === "live").length : 0, 2)],
          ["Margin", `${gross ? ((profit / gross) * 100).toFixed(1) : "0.0"}%`],
        ]),
      })}
    </div>
  `;
}

export function renderCosts() {
  const { data } = getState();
  const { costs, profit } = revenueSummary();
  const monthCosts = sum(data.expenses.filter((expense) => isSameMonth(`${expense.occurred_on}T12:00:00`)), (expense) => expense.amount);
  const byCategory = Object.entries(groupBy(data.expenses, (expense) => expense.category))
    .map(([label, items]) => ({ label: statusLabel(label), value: sum(items, (item) => item.amount) }))
    .sort((a, b) => b.value - a.value);

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["Total costs", formatCurrency(costs, 2)],
          ["This month", formatCurrency(monthCosts, 2)],
          ["AI / LLM spend", formatCurrency(sum(data.aiUsage, (usage) => usage.cost), 2), data.aiUsage.length ? "" : "no usage recorded"],
          ["Net profit", formatCurrency(profit)],
        ]),
      })}

      <div class="toolbar">
        <span class="toolbar__spacer"></span>
        ${btn("Add expense", { action: "expense-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${table({
        columns: ["Date", "Scope", "Client", "Category", "Vendor", "Description", "Amount", ""],
        rows: data.expenses.map((expense) => `<tr>
          ${td("Date", formatDate(expense.occurred_on, { year: "numeric" }))}
          ${td("Scope", escapeHtml(statusLabel(expense.cost_scope || (expense.client_id ? "client" : "overhead"))))}
          ${td("Client", escapeHtml(expense.client_id ? clientName(data, byId(data.clients, expense.client_id)) : "—"))}
          ${td("Category", escapeHtml(statusLabel(expense.category)))}
          ${td("Vendor", escapeHtml(expense.vendor || "—"))}
          ${td("Description", escapeHtml(expense.description || "—"))}
          ${td("Amount", `<strong>${formatCurrency(expense.amount, 2)}</strong>`)}
          ${td("", btn("Edit", { action: "expense-open", size: "sm", attrs: `data-id="${expense.id}"` }))}
        </tr>`),
        emptyState: empty({ title: "No expenses recorded", message: "Add provider usage, phone, SMS, hosting, and overhead costs to estimate margin." }),
      })}

      ${byCategory.length ? section("By category", { body: bars(byCategory, (value) => formatCurrency(value, 2)) }) : ""}
    </div>
  `;
}

export function renderPricing() {
  const { data } = getState();
  const experiments = [...data.pricingExperiments].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  const leader = experiments[0];

  return `
    <div class="stack">
      ${leader ? section("Best performer", {
        body: stats([
          ["Experiment", escapeHtml(leader.name)],
          ["Revenue", formatCurrency(leader.revenue)],
          ["Revenue / email", formatCurrency(leader.sent_count ? Number(leader.revenue) / Number(leader.sent_count) : 0, 2)],
          ["Close rate", `${leader.sent_count ? ((Number(leader.close_count) / Number(leader.sent_count)) * 100).toFixed(1) : "0.0"}%`],
        ]),
      }) : ""}

      <div class="toolbar">
        <span class="toolbar__spacer"></span>
        ${btn("New experiment", { action: "pricing-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${table({
        columns: ["Experiment", "Price", "Emails", "Replies", "Sales", "Revenue", "Revenue / email", "Status", ""],
        rows: experiments.map((experiment) => `<tr>
          ${td("Experiment", `<strong>${escapeHtml(experiment.name)}</strong>`)}
          ${td("Price", formatCurrency(experiment.offer_amount))}
          ${td("Emails", formatNumber(experiment.sent_count))}
          ${td("Replies", formatNumber(experiment.reply_count))}
          ${td("Sales", formatNumber(experiment.close_count))}
          ${td("Revenue", `<strong>${formatCurrency(experiment.revenue)}</strong>`)}
          ${td("Revenue / email", formatCurrency(experiment.sent_count ? Number(experiment.revenue) / Number(experiment.sent_count) : 0, 2))}
          ${td("Status", pill(experiment.status))}
          ${td("", btn("Edit", { action: "pricing-open", size: "sm", attrs: `data-id="${experiment.id}"` }))}
        </tr>`),
        emptyState: empty({ title: "No experiments", message: "Test scripts and positioning while keeping the single $2,500 activation and $997 monthly package unchanged." }),
      })}
    </div>
  `;
}
