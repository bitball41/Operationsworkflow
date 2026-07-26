import { pageHead, metricCard } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml, groupBy, relativeTime, sum } from "../core/utils.js";
import {
  activityTimeline,
  badge,
  button,
  byId,
  compactMetric,
  dueLabel,
  entityName,
  formatCurrency,
  formatDate,
  formatNumber,
  horizontalBars,
  icon,
  inCurrentMonth,
  isToday,
  leadName,
  miniLineChart,
  primaryCell,
  revenueSummary,
  sectionCard,
  statusLabel,
  tableEmpty,
} from "./shared.js";

function businessMetrics(data) {
  const { paid, gross, fees, costs, profit } = revenueSummary(data);
  const today = new Date().toDateString();
  const revenueToday = sum(paid.filter((payment) => new Date(payment.paid_at || payment.created_at).toDateString() === today), (item) => item.amount);
  const revenueMonth = sum(paid.filter((payment) => inCurrentMonth(payment.paid_at || payment.created_at)), (item) => item.amount);
  const monthExpenses = sum(data.expenses.filter((item) => inCurrentMonth(item.occurred_on)), (item) => item.amount)
    + sum(data.aiUsage.filter((item) => inCurrentMonth(item.occurred_at)), (item) => item.cost);
  const monthFees = sum(paid.filter((payment) => inCurrentMonth(payment.paid_at || payment.created_at)), (item) => item.fee_amount);
  const activeLeads = data.leads.filter((lead) => !["won", "lost"].includes(lead.status));
  const sent = data.drafts.filter((draft) => draft.status === "sent").length;
  const replies = data.emailThreads.length;
  const positive = data.emailThreads.filter((thread) => ["interested", "needs_changes"].includes(thread.classification)).length;
  const websiteSales = paid.filter((payment) => payment.payment_type === "website_sale").length;
  const mrr = sum(data.maintenanceSubscriptions.filter((item) => item.status === "active"), (item) => item.monthly_amount);
  return {
    gross,
    profit,
    fees,
    costs,
    revenueToday,
    revenueMonth,
    profitMonth: revenueMonth - monthExpenses - monthFees,
    activeClients: data.clients.filter((client) => ["active", "onboarding"].includes(client.status)).length,
    activeLeads: activeLeads.length,
    sent,
    replies,
    positive,
    closeRate: data.leads.length ? (data.leads.filter((lead) => lead.status === "won").length / data.leads.length) * 100 : 0,
    followUpsDue: data.followUps.filter((item) => ["due", "overdue"].includes(item.status) || (new Date(item.due_at) <= new Date() && !["sent", "replied", "completed", "dead", "cancelled"].includes(item.status))).length,
    mrr,
    maintenanceCustomers: data.maintenanceSubscriptions.filter((item) => item.status === "active").length,
    websiteSales,
  };
}

function weeklyRevenue(payments) {
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - (7 - index) * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end, value: 0, label: `${start.getMonth() + 1}/${start.getDate()}` };
  });
  payments.filter((item) => ["paid", "available"].includes(item.status)).forEach((payment) => {
    const date = new Date(payment.paid_at || payment.created_at);
    const bucket = weeks.find((week) => date >= week.start && date <= week.end);
    if (bucket) bucket.value += Number(payment.amount || 0);
  });
  return weeks;
}

export function renderHome() {
  const { data, mode } = getState();
  const metrics = businessMetrics(data);
  const weeks = weeklyRevenue(data.payments);
  const activeRun = data.agentRuns.find((run) => ["running", "paused", "waiting_approval", "queued"].includes(run.status)) || data.agentRuns[0];
  const funnel = [
    ["Leads", data.leads.length, "#748095"],
    ["Demos", data.demos.length, "#8f75ff"],
    ["Emails", data.drafts.filter((draft) => draft.status === "sent").length, "#4c8dff"],
    ["Replies", data.emailThreads.length, "#43c9d7"],
    ["Interested", data.leads.filter((lead) => ["interested", "closing", "won"].includes(lead.status)).length, "#f1bf5a"],
    ["Sales", data.leads.filter((lead) => lead.status === "won").length, "#37d690"],
  ];
  const warnings = [
    ...data.followUps.filter((item) => item.status === "overdue").map((item) => ({
      tone: "warning",
      title: `Follow-up overdue · ${leadName(data, item.lead_id)}`,
      detail: dueLabel(item.due_at),
      route: "follow-ups",
    })),
    ...data.deployments.filter((item) => item.status === "failed").map((item) => ({
      tone: "error",
      title: "Deployment needs attention",
      detail: item.domain || "Open deployment logs",
      route: "deployments",
    })),
    ...(data.approvals.filter((item) => item.status === "pending").length ? [{
      tone: "approval",
      title: `${data.approvals.filter((item) => item.status === "pending").length} approvals waiting`,
      detail: "Outbound or production actions remain blocked.",
      action: "open-approvals",
    }] : []),
  ];
  const dueTasks = data.tasks
    .filter((task) => !["completed", "cancelled"].includes(task.status))
    .sort((a, b) => new Date(a.due_at || "2999") - new Date(b.due_at || "2999"))
    .slice(0, 5);

  return `
    ${pageHead(
      "Business command center",
      "Live operating context across sales, fulfillment, revenue, and maintenance.",
      mode === "preview" && !data.leads.length ? button("Load demo workspace", { action: "seed-workspace", iconName: "sparkles", variant: "primary" }) : "",
    )}
    <section class="grid grid--4 metric-grid-mobile">
      ${metricCard({ label: "Revenue today", value: formatCurrency(metrics.revenueToday), iconName: "wallet-cards", foot: "Recorded payments", tone: "green" })}
      ${metricCard({ label: "Revenue this month", value: formatCurrency(metrics.revenueMonth), iconName: "trending-up", foot: `${metrics.websiteSales} website sales recorded`, tone: "blue" })}
      ${metricCard({ label: "Profit this month", value: formatCurrency(metrics.profitMonth), iconName: "circle-dollar-sign", foot: "After recorded fees and costs", tone: metrics.profitMonth >= 0 ? "purple" : "red" })}
      ${metricCard({ label: "Maintenance MRR", value: formatCurrency(metrics.mrr), iconName: "refresh-cw", foot: `${metrics.maintenanceCustomers} active customers`, tone: "yellow" })}
    </section>
    <section class="kpi-strip">
      ${compactMetric("Active clients", metrics.activeClients, "fulfillment + live")}
      ${compactMetric("Pipeline", metrics.activeLeads, "open leads")}
      ${compactMetric("Emails sent", metrics.sent, "recorded")}
      ${compactMetric("Replies", metrics.replies, `${metrics.positive} positive`)}
      ${compactMetric("Close rate", `${metrics.closeRate.toFixed(1)}%`, "lead → won")}
      ${compactMetric("Follow-ups due", metrics.followUpsDue, metrics.followUpsDue ? "needs attention" : "clear", metrics.followUpsDue ? "warning" : "success")}
    </section>
    <section class="grid grid--wide">
      ${sectionCard(
        "Revenue performance",
        "Recorded payment revenue by trailing week",
        `<div class="chart-summary">
          <div><strong>${formatCurrency(metrics.gross)}</strong><span>all recorded revenue</span></div>
          <div><strong>${formatCurrency(metrics.profit)}</strong><span>recorded net contribution</span></div>
        </div>${miniLineChart(weeks.map((week) => week.value), { labels: weeks.map((week) => week.label) })}`,
        `<button class="text-link" data-action="navigate" data-route-target="analytics">Full analytics ${icon("arrow-up-right")}</button>`,
      )}
      ${sectionCard(
        "Sales funnel",
        "Current workspace conversion",
        horizontalBars(funnel.map(([label, value, color]) => ({ label, value, color }))),
      )}
    </section>
    <section class="grid grid--wide">
      ${sectionCard(
        "Recent activity",
        "Most recent business and system events",
        activityTimeline(data.activity, 7),
        `<button class="text-link" data-action="navigate" data-route-target="activity">View activity</button>`,
      )}
      <div class="section-stack">
        ${sectionCard(
          "Business alerts",
          warnings.length ? `${warnings.length} item${warnings.length === 1 ? "" : "s"} need attention` : "No urgent warnings",
          warnings.length ? `<div class="alert-list">${warnings.slice(0, 5).map((warning) => `
            <button class="alert-row alert-row--${warning.tone}" type="button" data-action="${warning.action || "navigate"}" ${warning.route ? `data-route-target="${warning.route}"` : ""}>
              <span>${icon(warning.tone === "error" ? "circle-alert" : warning.tone === "approval" ? "shield-check" : "clock")}</span>
              <span><strong>${escapeHtml(warning.title)}</strong><small>${escapeHtml(warning.detail)}</small></span>
              ${icon("chevron-right")}
            </button>
          `).join("")}</div>` : `<div class="healthy-state">${icon("check-circle-2")}<div><strong>Everything looks clear</strong><span>Approvals and due work are under control.</span></div></div>`,
        )}
        ${sectionCard(
          "Orchestration status",
          "Persistent manual control plane",
          `<div class="run-summary">
            <div class="run-summary__head"><span class="agent-orb"><i></i></span><div><strong>${escapeHtml(activeRun?.objective || "No current objective")}</strong><span>${escapeHtml(activeRun?.current_step || "Idle and ready")}</span></div>${badge(activeRun?.status || "active", activeRun ? statusLabel(activeRun.status) : "Idle")}</div>
            <div class="progress"><i style="width:${Number(activeRun?.progress || 0)}%"></i></div>
            <footer><span>${Number(activeRun?.progress || 0)}% complete</span><button class="text-link" data-action="open-orchestrator">Open control</button></footer>
          </div>`,
        )}
      </div>
    </section>
    ${sectionCard(
      "Tasks due soon",
      "The next operational commitments",
      `<div class="task-list">${dueTasks.map((task) => `
        <article class="task-row">
          <button class="task-check ${task.status === "completed" ? "is-complete" : ""}" data-action="toggle-task" data-id="${task.id}" aria-label="Toggle task">${task.status === "completed" ? icon("check") : ""}</button>
          <div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(entityName(data, task))} · ${escapeHtml(dueLabel(task.due_at))}</span></div>
          ${badge(task.priority, statusLabel(task.priority))}
          <button class="icon-button icon-button--small" data-action="open-task" data-id="${task.id}" aria-label="Edit task">${icon("chevron-right")}</button>
        </article>
      `).join("") || `<div class="healthy-state">${icon("check-circle-2")}<div><strong>No open tasks</strong><span>Create a task when there is something to move forward.</span></div></div>`}</div>`,
      button("New task", { action: "new-task", iconName: "plus", variant: "secondary" }),
    )}
  `;
}

export function renderActivity() {
  const { data, routeParams } = getState();
  const type = routeParams.type || "all";
  const actor = routeParams.actor || "all";
  const search = (routeParams.q || "").toLowerCase();
  const types = [...new Set(data.activity.map((item) => item.type))];
  const rows = data.activity.filter((item) => (
    (type === "all" || item.type === type)
    && (actor === "all" || item.actor_type === actor)
    && (!search || `${item.title} ${item.detail} ${entityName(data, item)}`.toLowerCase().includes(search))
  ));

  return `
    ${pageHead("Activity", "A durable audit trail of operator, system, and orchestrator work.")}
    <div class="toolbar">
      <div class="toolbar__group">
        <button class="filter-button ${type === "all" ? "is-active" : ""}" data-action="route-filter" data-key="type" data-value="all">All events</button>
        ${types.slice(0, 5).map((value) => `<button class="filter-button ${type === value ? "is-active" : ""}" data-action="route-filter" data-key="type" data-value="${escapeHtml(value)}">${escapeHtml(statusLabel(value))}</button>`).join("")}
      </div>
      <div class="toolbar__group">
        <label class="inline-search">${icon("search")}<input data-route-search placeholder="Search activity" value="${escapeHtml(routeParams.q || "")}"></label>
        <select class="compact-select" data-action="route-select" data-key="actor">
          ${["all", "user", "system", "orchestrator"].map((value) => `<option value="${value}" ${actor === value ? "selected" : ""}>${value === "all" ? "All actors" : statusLabel(value)}</option>`).join("")}
        </select>
      </div>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table class="data-table responsive-table">
          <thead><tr><th>Event</th><th>Entity</th><th>Actor</th><th>Date</th></tr></thead>
          <tbody>${rows.map((item) => `
            <tr>
              <td data-label="Event">${primaryCell(item.title, item.detail)}</td>
              <td data-label="Entity">${escapeHtml(entityName(data, item))}</td>
              <td data-label="Actor">${badge(item.actor_type === "orchestrator" ? "running" : "active", statusLabel(item.actor_type))}</td>
              <td data-label="Date"><span title="${escapeHtml(new Date(item.created_at).toLocaleString())}">${relativeTime(item.created_at)}</span></td>
            </tr>
          `).join("") || tableEmpty(4, "No matching activity", "Adjust the activity filters.")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function taskView(task, view) {
  if (view === "completed") return task.status === "completed";
  if (task.status === "completed" || task.status === "cancelled") return false;
  if (!task.due_at) return view === "upcoming";
  const due = new Date(task.due_at);
  if (view === "today") return isToday(due);
  if (view === "overdue") return due < new Date() && !isToday(due);
  return due > new Date() && !isToday(due);
}

export function renderTasks() {
  const { data, routeParams } = getState();
  const view = routeParams.view || "today";
  const query = (routeParams.q || "").toLowerCase();
  const rows = data.tasks
    .filter((task) => taskView(task, view) && (!query || `${task.title} ${task.description}`.toLowerCase().includes(query)))
    .sort((a, b) => new Date(a.due_at || "2999") - new Date(b.due_at || "2999"));
  const counts = Object.fromEntries(["today", "overdue", "upcoming", "completed"].map((key) => [key, data.tasks.filter((task) => taskView(task, key)).length]));

  return `
    ${pageHead("Tasks", "Business commitments linked directly to leads, clients, and projects.", button("New task", { action: "new-task", iconName: "plus", variant: "primary" }))}
    <div class="toolbar">
      <div class="tabs">${["today", "overdue", "upcoming", "completed"].map((key) => `<button class="tab ${view === key ? "is-active" : ""}" data-action="route-filter" data-key="view" data-value="${key}">${statusLabel(key)} · ${counts[key]}</button>`).join("")}</div>
      <label class="inline-search">${icon("search")}<input data-route-search placeholder="Search tasks" value="${escapeHtml(routeParams.q || "")}"></label>
    </div>
    <section class="card">
      <div class="task-list task-list--large">${rows.map((task) => `
        <article class="task-row">
          <button class="task-check ${task.status === "completed" ? "is-complete" : ""}" data-action="toggle-task" data-id="${task.id}" aria-label="Toggle task">${task.status === "completed" ? icon("check") : ""}</button>
          <div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.description || entityName(data, task))}</span></div>
          <span class="task-due ${view === "overdue" ? "is-overdue" : ""}">${escapeHtml(dueLabel(task.due_at))}</span>
          ${badge(task.priority, statusLabel(task.priority))}
          <button class="button button--ghost" data-action="open-task" data-id="${task.id}">Edit</button>
        </article>
      `).join("") || `<div class="healthy-state healthy-state--large">${icon("check-circle-2")}<div><strong>No ${escapeHtml(view)} tasks</strong><span>This view is clear.</span></div></div>`}</div>
    </section>
  `;
}

function calendarModel(data, monthValue) {
  const selected = /^\d{4}-\d{2}$/.test(monthValue || "") ? new Date(`${monthValue}-01T12:00:00`) : new Date();
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const entries = [
    ...data.calendarEvents.map((event) => ({ ...event, calendarType: event.event_type })),
    ...data.tasks.filter((task) => task.due_at && task.status !== "completed").map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      starts_at: task.due_at,
      calendarType: "task",
      lead_id: task.lead_id,
      client_id: task.client_id,
    })),
    ...data.followUps.filter((item) => !["completed", "sent", "replied", "dead", "cancelled"].includes(item.status)).map((item) => ({
      id: `followup-${item.id}`,
      title: `Follow-up · ${leadName(data, item.lead_id)}`,
      starts_at: item.due_at,
      calendarType: "follow_up",
      lead_id: item.lead_id,
    })),
  ];
  const grouped = groupBy(entries, (item) => new Date(item.starts_at).toISOString().slice(0, 10));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, events: grouped[date.toISOString().slice(0, 10)] || [] };
  });
  return { selected, days, entries };
}

export function renderCalendar() {
  const { data, routeParams } = getState();
  const model = calendarModel(data, routeParams.month);
  const monthKey = `${model.selected.getFullYear()}-${String(model.selected.getMonth() + 1).padStart(2, "0")}`;
  const upcoming = model.entries
    .filter((item) => new Date(item.starts_at) >= new Date())
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    .slice(0, 7);

  return `
    ${pageHead("Calendar", "Follow-ups, calls, deadlines, launches, maintenance, and tasks in one lightweight view.", button("New event", { action: "new-calendar-event", iconName: "plus", variant: "primary" }))}
    <section class="grid grid--sidebar">
      <div class="card calendar-card">
        <header class="calendar-toolbar">
          <div>
            <button class="icon-button icon-button--small" data-action="shift-calendar" data-direction="-1" aria-label="Previous month">${icon("chevron-right")}<span class="visually-hidden">Previous</span></button>
            <button class="button button--ghost" data-action="calendar-today">Today</button>
            <button class="icon-button icon-button--small" data-action="shift-calendar" data-direction="1" aria-label="Next month">${icon("chevron-right")}</button>
          </div>
          <h2>${escapeHtml(model.selected.toLocaleDateString("en-US", { month: "long", year: "numeric" }))}</h2>
          <span>${escapeHtml(monthKey)}</span>
        </header>
        <div class="calendar-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("")}</div>
        <div class="calendar-grid">${model.days.map(({ date, events }) => {
          const outside = date.getMonth() !== model.selected.getMonth();
          return `<button class="calendar-day ${outside ? "is-outside" : ""} ${isToday(date) ? "is-today" : ""}" data-action="calendar-day" data-date="${date.toISOString().slice(0, 10)}">
            <span>${date.getDate()}</span>
            <div>${events.slice(0, 3).map((event) => `<i class="calendar-event calendar-event--${event.calendarType}">${escapeHtml(event.title)}</i>`).join("")}${events.length > 3 ? `<small>+${events.length - 3} more</small>` : ""}</div>
          </button>`;
        }).join("")}</div>
      </div>
      ${sectionCard(
        "Upcoming",
        "Next across the business",
        `<div class="agenda-list">${upcoming.map((item) => `
          <article>
            <time><strong>${new Date(item.starts_at).getDate()}</strong><span>${new Date(item.starts_at).toLocaleDateString("en-US", { month: "short" })}</span></time>
            <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(entityName(data, item))} · ${formatDate(item.starts_at, { hour: "numeric", minute: "2-digit" })}</span></div>
            ${badge(item.calendarType === "follow_up" ? "due" : "active", statusLabel(item.calendarType))}
          </article>
        `).join("") || `<div class="healthy-state">${icon("check-circle-2")}<div><strong>No upcoming events</strong><span>Your calendar is clear.</span></div></div>`}</div>`,
      )}
    </section>
  `;
}
