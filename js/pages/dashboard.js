import { PIPELINE_STAGES } from "../config.js";
import { icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, relativeTime, sum, statusLabel } from "../core/utils.js";
import { badge, button, emptyState, metricCard, pageHead } from "../components/ui.js";

function leadName(id) {
  return getState().data.leads.find((lead) => lead.id === id)?.business_name || "Unknown prospect";
}

function activityFeed(events, limit = 6) {
  if (!events.length) {
    return emptyState({
      iconName: "activity",
      title: "No activity yet",
      message: "Agent and manual workflow events will appear here.",
    });
  }
  return `<div class="timeline">${events.slice(0, limit).map((event) => `
    <div class="timeline-item">
      <span class="timeline-icon">${icon(event.agent_type === "system" ? "activity" : "bot")}</span>
      <div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail || statusLabel(event.event_type))}</p></div>
      <time>${relativeTime(event.created_at)}</time>
    </div>
  `).join("")}</div>`;
}

export function renderCommandCenter() {
  const { data, mode } = getState();
  const activeLeads = data.leads.filter((lead) => !["won", "lost"].includes(lead.status));
  const pendingApprovals = data.approvals.filter((approval) => approval.status === "pending");
  const pipelineValue = sum(activeLeads, (lead) => lead.asking_price);
  const spentToday = sum(data.costEvents.filter((event) => (
    new Date(event.occurred_at).toDateString() === new Date().toDateString()
  )), (event) => event.amount);
  const dailyLimit = Number(data.profile?.preferences?.daily_cost_limit || 5);
  const priority = [...activeLeads]
    .filter((lead) => lead.next_action)
    .sort((a, b) => new Date(a.next_action_at || "2999-01-01") - new Date(b.next_action_at || "2999-01-01"))
    .slice(0, 5);

  if (!data.leads.length) {
    return `
      ${pageHead("Command center", "The operating view for today’s sales and fulfillment work.")}
      <section class="card">
        ${emptyState({
          iconName: "layout-dashboard",
          title: "Your operating system is ready",
          message: "Start with a blank pipeline or load an editable starter workspace to see every workflow in context.",
          action: "seed-workspace",
          actionLabel: "Load starter workspace",
        })}
      </section>
      <div class="grid grid--3" style="margin-top:14px">
        <article class="card"><div class="card__body"><span class="eyebrow">1 · Acquire</span><h3 style="margin-top:8px">Add qualified businesses</h3><p style="margin-top:5px;color:var(--muted);font-size:10px">Manual entry works now. OpenScout plugs into the same lead table later.</p></div></article>
        <article class="card"><div class="card__body"><span class="eyebrow">2 · Fulfill</span><h3 style="margin-top:8px">Select, build, and QA</h3><p style="margin-top:5px;color:var(--muted);font-size:10px">Template and demo records keep every version tied to the prospect.</p></div></article>
        <article class="card"><div class="card__body"><span class="eyebrow">3 · Sell</span><h3 style="margin-top:8px">Approve every external action</h3><p style="margin-top:5px;color:var(--muted);font-size:10px">Email and deployment actions stay blocked until you approve them.</p></div></article>
      </div>
    `;
  }

  const stageRows = PIPELINE_STAGES.map((stage) => {
    const matches = data.leads.filter((lead) => (stage.includes || [stage.id]).includes(lead.status));
    return { ...stage, count: matches.length };
  });
  const maxStage = Math.max(...stageRows.map((row) => row.count), 1);

  return `
    ${pageHead(
      "Command center",
      "Today’s sales and fulfillment pressure points — nothing extra.",
      mode === "preview" ? badge("pending", "Preview data") : badge("connected", "Supabase live"),
    )}
    <section class="grid grid--4 metric-grid-mobile">
      ${metricCard({ label: "Active prospects", value: activeLeads.length, iconName: "users", foot: `${data.leads.filter((lead) => lead.status === "replied").length} replied`, tone: "purple" })}
      ${metricCard({ label: "Needs approval", value: pendingApprovals.length, iconName: "shield-check", foot: pendingApprovals.length ? "Blocking external actions" : "Queue is clear", tone: pendingApprovals.length ? "yellow" : "green" })}
      ${metricCard({ label: "Pipeline value", value: formatCurrency(pipelineValue), iconName: "circle-dollar-sign", foot: "At current offer prices", tone: "green" })}
      ${metricCard({ label: "Cost today", value: formatCurrency(spentToday, 2), iconName: "activity", foot: `of ${formatCurrency(dailyLimit, 2)} guardrail`, tone: spentToday > dailyLimit * 0.8 ? "red" : "blue" })}
    </section>

    <section class="grid grid--wide" style="margin-top:14px">
      <article class="card">
        <header class="card__head">
          <div><h3>Pipeline pressure</h3><p>Where prospects are concentrated right now</p></div>
          ${button("Open pipeline", { action: "navigate", iconName: "arrow-up-right", attrs: 'data-route-target="pipeline"' })}
        </header>
        <div class="card__body">
          <div class="funnel">${stageRows.map((row) => `
            <div class="funnel-row">
              <span>${escapeHtml(row.label)}</span>
              <div class="funnel-bar"><i style="width:${Math.max(4, row.count / maxStage * 100)}%;--bar-color:${row.color}"></i></div>
              <b>${row.count}</b>
            </div>
          `).join("")}</div>
        </div>
      </article>

      <article class="card">
        <header class="card__head">
          <div><h3>Today’s cost guardrail</h3><p>Prospect cost tracking is active from day one</p></div>
          ${badge(spentToday > dailyLimit ? "failed" : "active", spentToday > dailyLimit ? "Over limit" : "On track")}
        </header>
        <div class="card__body">
          <div style="display:flex;align-items:end;justify-content:space-between;gap:14px">
            <div><strong style="font-size:28px;letter-spacing:-.04em">${formatCurrency(spentToday, 2)}</strong><p style="color:var(--muted);font-size:9px;margin-top:4px">${Math.round((spentToday / dailyLimit) * 100)}% of daily limit</p></div>
            <span class="metric-icon" style="--metric-color:var(--blue);--metric-soft:var(--blue-soft)">${icon("activity")}</span>
          </div>
          <div class="progress" style="margin-top:17px"><i style="width:${Math.min(100, (spentToday / dailyLimit) * 100)}%"></i></div>
          <div style="display:grid;gap:8px;margin-top:18px">${["analysis", "design", "writing"].map((category) => {
            const total = sum(data.costEvents.filter((event) => event.category === category), (event) => event.amount);
            return `<div style="display:flex;justify-content:space-between;color:var(--text-soft);font-size:10px"><span style="text-transform:capitalize">${category}</span><strong>${formatCurrency(total, 2)}</strong></div>`;
          }).join("")}</div>
        </div>
      </article>
    </section>

    <section class="grid grid--wide" style="margin-top:14px">
      <article class="card">
        <header class="card__head">
          <div><h3>Next actions</h3><p>Only work that can move a prospect forward</p></div>
          <span class="badge badge--muted">${priority.length} active</span>
        </header>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Prospect</th><th>Next action</th><th>Due</th><th>Stage</th><th></th></tr></thead>
            <tbody>${priority.map((lead) => `
              <tr data-action="open-lead" data-id="${lead.id}">
                <td><div class="cell-primary"><strong>${escapeHtml(lead.business_name)}</strong><span>${escapeHtml(lead.category || "Uncategorized")}</span></div></td>
                <td>${escapeHtml(lead.next_action)}</td>
                <td>${lead.next_action_at ? `<span style="color:${new Date(lead.next_action_at) < new Date() ? "var(--red)" : "inherit"}">${relativeTime(lead.next_action_at)}</span>` : "—"}</td>
                <td>${badge(lead.status)}</td>
                <td>${icon("chevron-right")}</td>
              </tr>
            `).join("")}</tbody>
          </table>
        </div>
      </article>

      <article class="card">
        <header class="card__head">
          <div><h3>System activity</h3><p>Human and agent events</p></div>
          ${button("All activity", { action: "navigate", attrs: 'data-route-target="activity"' })}
        </header>
        <div class="card__body">${activityFeed(data.agentEvents)}</div>
      </article>
    </section>
  `;
}

export function renderAnalytics() {
  const { data } = getState();
  const sent = data.drafts.filter((draft) => draft.status === "sent").length || data.communications.filter((item) => item.direction === "outbound").length;
  const replies = data.communications.filter((item) => item.direction === "inbound").length;
  const wins = data.leads.filter((lead) => lead.status === "won").length;
  const totalCost = sum(data.costEvents, (event) => event.amount);
  const responseRate = sent ? Math.round(replies / sent * 100) : 0;
  const closeRate = data.leads.length ? Math.round(wins / data.leads.length * 100) : 0;
  const costByCategory = ["discovery", "analysis", "design", "writing", "deployment"].map((category) => ({
    category,
    amount: sum(data.costEvents.filter((item) => item.category === category), (item) => item.amount),
  }));
  const maxCost = Math.max(...costByCategory.map((item) => item.amount), 0.01);
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: data.leads.filter((lead) => (stage.includes || [stage.id]).includes(lead.status)).length,
  }));

  return `
    ${pageHead("Analytics", "Conversion, prospect cost, and pricing evidence — the numbers that change decisions.", button("Export CSV", { action: "export-leads", iconName: "upload" }))}
    <section class="grid grid--4 metric-grid-mobile">
      ${metricCard({ label: "Reply rate", value: `${responseRate}%`, iconName: "inbox", foot: `${replies} replies from ${sent || 0} tracked sends`, tone: "blue" })}
      ${metricCard({ label: "Close rate", value: `${closeRate}%`, iconName: "badge-dollar-sign", foot: `${wins} client${wins === 1 ? "" : "s"} won`, tone: "green" })}
      ${metricCard({ label: "Cost / prospect", value: formatCurrency(data.leads.length ? totalCost / data.leads.length : 0, 2), iconName: "activity", foot: `${formatCurrency(totalCost, 2)} total recorded`, tone: "purple" })}
      ${metricCard({ label: "Revenue", value: formatCurrency(sum(data.clients, (client) => client.agreed_price)), iconName: "circle-dollar-sign", foot: "Closed contract value", tone: "yellow" })}
    </section>

    <section class="grid grid--2" style="margin-top:14px">
      <article class="card">
        <header class="card__head"><div><h3>Pipeline conversion</h3><p>Current count by operating stage</p></div></header>
        <div class="card__body">
          <div class="funnel">${stageCounts.map((row, index) => {
            const max = Math.max(...stageCounts.map((item) => item.count), 1);
            return `<div class="funnel-row"><span>${escapeHtml(row.label)}</span><div class="funnel-bar"><i style="width:${Math.max(3, row.count / max * 100)}%;--bar-color:${row.color}"></i></div><b>${row.count}</b></div>`;
          }).join("")}</div>
        </div>
      </article>
      <article class="card">
        <header class="card__head"><div><h3>Cost by workflow</h3><p>Recorded spend across prospect production</p></div></header>
        <div class="card__body">
          <div class="funnel">${costByCategory.map((row) => `
            <div class="funnel-row">
              <span style="text-transform:capitalize">${row.category}</span>
              <div class="funnel-bar"><i style="width:${Math.max(2, row.amount / maxCost * 100)}%;--bar-color:var(--accent)"></i></div>
              <b>${formatCurrency(row.amount, 2)}</b>
            </div>
          `).join("")}</div>
        </div>
      </article>
    </section>

    <article class="card" style="margin-top:14px">
      <header class="card__head">
        <div><h3>Pricing experiments</h3><p>Compare actual outreach performance before changing the offer</p></div>
        ${button("New experiment", { action: "new-pricing-experiment", iconName: "plus" })}
      </header>
      ${data.pricingExperiments.length ? `
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Experiment</th><th>Offer</th><th>Status</th><th>Sent</th><th>Replies</th><th>Closes</th><th>Revenue</th></tr></thead>
          <tbody>${data.pricingExperiments.map((experiment) => `
            <tr>
              <td><div class="cell-primary"><strong>${escapeHtml(experiment.name)}</strong><span>${experiment.started_at ? `Started ${formatDate(experiment.started_at)}` : "Not started"}</span></div></td>
              <td>${formatCurrency(experiment.offer_amount)}</td>
              <td>${badge(experiment.status)}</td>
              <td>${experiment.sent_count}</td><td>${experiment.reply_count}</td><td>${experiment.close_count}</td>
              <td>${formatCurrency(experiment.revenue)}</td>
            </tr>
          `).join("")}</tbody>
        </table></div>
      ` : emptyState({ iconName: "chart-no-axes-combined", title: "No pricing experiments", message: "Create one before changing your baseline offer." })}
    </article>
  `;
}

export function renderFinance() {
  const { data, routeParams } = getState();
  const scope = routeParams.scope === "personal" ? "personal" : "business";
  const transactions = data.financeTransactions.filter((item) => item.scope === scope);
  const income = sum(transactions.filter((item) => item.kind === "income"), (item) => item.amount);
  const expenses = sum(transactions.filter((item) => item.kind === "expense"), (item) => item.amount);
  const goals = data.financeGoals;

  return `
    ${pageHead(
      "Finance",
      "Business cash flow and personal goals live together without turning the OS into accounting software.",
      `<div class="tabs"><button class="tab ${scope === "business" ? "is-active" : ""}" data-action="finance-scope" data-scope="business">Business</button><button class="tab ${scope === "personal" ? "is-active" : ""}" data-action="finance-scope" data-scope="personal">Personal</button></div>${button("Add transaction", { action: "new-transaction", iconName: "plus", variant: "primary" })}`,
    )}
    <section class="grid grid--3">
      ${metricCard({ label: scope === "business" ? "Revenue" : "Money in", value: formatCurrency(income, 2), iconName: "trending-up", foot: "Recorded transactions", tone: "green" })}
      ${metricCard({ label: "Expenses", value: formatCurrency(expenses, 2), iconName: "wallet-cards", foot: "Recorded transactions", tone: "red" })}
      ${metricCard({ label: "Net cash flow", value: formatCurrency(income - expenses, 2), iconName: "circle-dollar-sign", foot: scope === "business" ? "Before tax treatment" : "Available after tracked spending", tone: income - expenses >= 0 ? "purple" : "red" })}
    </section>

    <section class="grid ${scope === "personal" ? "grid--wide" : "grid--2"}" style="margin-top:14px">
      <article class="card">
        <header class="card__head"><div><h3>${scope === "business" ? "Business ledger" : "Personal activity"}</h3><p>Manual now; Whop events can feed this later</p></div></header>
        ${transactions.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Description</th><th>Category</th><th>Date</th><th>Type</th><th>Amount</th></tr></thead>
          <tbody>${transactions.map((item) => `
            <tr>
              <td><div class="cell-primary"><strong>${escapeHtml(item.description)}</strong><span>${escapeHtml(item.source || "manual")}</span></div></td>
              <td>${escapeHtml(item.category)}</td>
              <td>${formatDate(item.occurred_on)}</td>
              <td>${badge(item.kind === "income" ? "active" : item.kind === "expense" ? "rejected" : "pending", item.kind)}</td>
              <td style="color:${item.kind === "income" ? "var(--green)" : item.kind === "expense" ? "var(--red)" : "var(--text-soft)"}">${item.kind === "expense" ? "−" : item.kind === "income" ? "+" : ""}${formatCurrency(item.amount, 2)}</td>
            </tr>
          `).join("")}</tbody>
        </table></div>` : emptyState({ iconName: "wallet-cards", title: "No transactions", message: `Add the first ${scope} transaction manually.` })}
      </article>

      ${scope === "personal" ? `
        <article class="card">
          <header class="card__head"><div><h3>Savings goals</h3><p>Wishlist priorities with actual progress</p></div>${button("Add goal", { action: "new-finance-goal", iconName: "plus" })}</header>
          <div class="card__body" style="display:grid;gap:16px">${goals.map((goal) => {
            const progress = Math.min(100, Number(goal.current_amount) / Number(goal.target_amount) * 100);
            return `<div>
              <div style="display:flex;justify-content:space-between;gap:12px"><div><strong style="font-size:10px">${escapeHtml(goal.name)}</strong><p style="color:var(--muted);font-size:8px;margin-top:2px">${formatCurrency(goal.current_amount)} of ${formatCurrency(goal.target_amount)}</p></div><b style="font-size:10px;color:${goal.color}">${Math.round(progress)}%</b></div>
              <div class="progress" style="margin-top:8px"><i style="width:${progress}%;background:${goal.color}"></i></div>
            </div>`;
          }).join("") || `<p style="color:var(--muted);font-size:10px">No savings goals yet.</p>`}</div>
        </article>
      ` : `
        <article class="card">
          <header class="card__head"><div><h3>Business snapshot</h3><p>Sales and operating spend reconciled</p></div></header>
          <div class="card__body">
            <div class="settings-list">
              <div class="settings-row"><div><strong>Contracted revenue</strong><p>Sum of agreed client prices</p></div><b>${formatCurrency(sum(data.clients, (item) => item.agreed_price))}</b></div>
              <div class="settings-row"><div><strong>Cash received</strong><p>Recorded client payments</p></div><b>${formatCurrency(sum(data.clients, (item) => item.amount_received))}</b></div>
              <div class="settings-row"><div><strong>AI and production cost</strong><p>Prospect-level cost events</p></div><b>${formatCurrency(sum(data.costEvents, (item) => item.amount), 2)}</b></div>
              <div class="settings-row"><div><strong>Whop connection</strong><p>Ready for future payment-event sync</p></div>${badge("pending", "Not connected")}</div>
            </div>
          </div>
        </article>
      `}
    </section>
  `;
}

