/** Payments, Analytics, Costs and Pricing Experiments. */
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber, groupBy, isSameMonth, statusLabel, sum } from "../core/utils.js";
import { bars, btn, empty, lineChart, notice, pill, section, stats, table, td } from "../components/ui.js";
import { isConnected } from "../services/integrations.js";
import { getPayments, revenueSummary } from "../services/operations.js";
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
          ["Website sales", formatCurrency(sum(paid.filter((payment) => payment.payment_type === "website_sale"), (payment) => payment.amount))],
          ["Maintenance", formatCurrency(sum(paid.filter((payment) => payment.payment_type === "maintenance"), (payment) => payment.amount))],
          ["Fees", formatCurrency(sum(paid, (payment) => payment.fee_amount), 2)],
        ]),
      })}

      ${isConnected("whop") ? "" : notice(
        "Whop is not connected",
        "Payments here are only the ones entered by hand. Add WHOP_API_KEY to the Cloudflare Worker to import real charges.",
        { iconName: "wallet", tone: "warn" },
      )}

      <div class="toolbar">
        ${searchInput("Search customer or transaction", routeParams.q || "")}
        ${filterSelect("type", [{ value: "website_sale", label: "Website sale" }, { value: "maintenance", label: "Maintenance" }], type, "All types")}
        <span class="toolbar__spacer"></span>
        ${btn("Sync from Whop", {
          action: "whop-sync",
          iconName: "refresh",
          size: "sm",
          attrs: isConnected("whop") ? "" : "disabled",
        })}
        ${btn("Record payment", { action: "payment-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${table({
        columns: ["Customer", "Type", "Amount", "Status", "Date", "Fee"],
        rows: payments.map((payment) => `<tr>
          ${td("Customer", `<div class="cell"><strong>${escapeHtml(payment.customer_name || clientName(data, byId(data.clients, payment.client_id)))}</strong><span>${escapeHtml(payment.source || "manual")}</span></div>`)}
          ${td("Type", escapeHtml(statusLabel(payment.payment_type)))}
          ${td("Amount", `<strong>${formatCurrency(payment.amount)}</strong>`)}
          ${td("Status", pill(payment.status))}
          ${td("Date", formatDate(payment.paid_at || payment.created_at, { year: "numeric" }))}
          ${td("Fee", formatCurrency(payment.fee_amount, 2))}
        </tr>`),
        emptyState: empty({ title: "No payments recorded", message: "Record the first website sale to track revenue." }),
      })}
    </div>
  `;
}

export function renderAnalytics() {
  const { data } = getState();
  const { gross, profit, costs } = revenueSummary();
  const sent = data.drafts.filter((draft) => draft.status === "sent").length;
  const replies = data.emailThreads.length;
  const won = data.leads.filter((lead) => lead.status === "won").length;
  const trend = monthlyRevenue(getPayments());

  const funnel = [
    { label: "Leads", value: data.leads.length },
    { label: "Demos", value: data.demos.length },
    { label: "Emails", value: sent },
    { label: "Replies", value: replies },
    { label: "Interested", value: data.leads.filter((lead) => ["interested", "closing", "won"].includes(lead.status)).length },
    { label: "Sales", value: won },
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
          ["Reply rate", `${sent ? ((replies / sent) * 100).toFixed(1) : "0.0"}%`],
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
          ["Revenue / email", formatCurrency(sent ? gross / sent : 0, 2)],
          ["Cost / lead", formatCurrency(data.leads.length ? costs / data.leads.length : 0, 2)],
          ["Cost / demo", formatCurrency(data.demos.length ? costs / data.demos.length : 0, 2)],
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
          ["AI spend", formatCurrency(sum(data.aiUsage, (usage) => usage.cost), 2), data.aiUsage.length ? "" : "no provider connected"],
          ["Net profit", formatCurrency(profit)],
        ]),
      })}

      <div class="toolbar">
        <span class="toolbar__spacer"></span>
        ${btn("Add expense", { action: "expense-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${table({
        columns: ["Date", "Category", "Vendor", "Description", "Amount", ""],
        rows: data.expenses.map((expense) => `<tr>
          ${td("Date", formatDate(expense.occurred_on, { year: "numeric" }))}
          ${td("Category", escapeHtml(statusLabel(expense.category)))}
          ${td("Vendor", escapeHtml(expense.vendor || "—"))}
          ${td("Description", escapeHtml(expense.description || "—"))}
          ${td("Amount", `<strong>${formatCurrency(expense.amount, 2)}</strong>`)}
          ${td("", btn("Edit", { action: "expense-open", size: "sm", attrs: `data-id="${expense.id}"` }))}
        </tr>`),
        emptyState: empty({ title: "No expenses recorded", message: "Add hosting, domains and API costs to see real profit." }),
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
        emptyState: empty({ title: "No experiments", message: "Test $500 against $700 and compare revenue per email, not just close rate." }),
      })}
    </div>
  `;
}
