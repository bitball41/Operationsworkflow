/**
 * Context adapter.
 *
 * Turns the whole application state into a compact, structured snapshot an
 * assistant can reason over: what is on screen, what is selected, what the
 * automation is doing, and slim projections of every collection.
 */
import { getState } from "../../core/state.js";
import { formatCurrency } from "../../core/utils.js";
import { automationSettings } from "../automation/engine.js";
import { integrationList } from "../integrations.js";
import {
  attentionItems,
  demoForLead,
  emailsSentToday,
  getPayments,
  getTasks,
  pipelineCounts,
  revenueSummary,
  todayStats,
} from "../operations.js";
import { estimateTokens } from "./provider.js";

const LIMITS = {
  leads: 60,
  demos: 30,
  drafts: 30,
  threads: 30,
  followUps: 30,
  clients: 30,
  projects: 20,
  payments: 40,
  expenses: 30,
  tasks: 40,
  calendar: 30,
  notes: 20,
  activity: 40,
  deployments: 20,
  discovery: 20,
};

function lead(item) {
  return {
    id: item.id,
    business: item.business_name,
    category: item.category,
    city: item.city,
    region: item.region,
    phone: item.phone || null,
    email: item.email || null,
    has_website: Boolean(item.has_website),
    score: item.lead_score,
    status: item.status,
    value: item.deal_value || item.asking_price,
    last_contacted_at: item.last_contacted_at,
    follow_up_at: item.follow_up_at,
    demo_id: demoForLead(item.id)?.id || null,
  };
}

export function buildContext({ full = false } = {}) {
  const state = getState();
  const { data, route, routeParams } = state;
  const limit = (items, key) => (full ? items : items.slice(0, LIMITS[key] || 25));
  const revenue = revenueSummary();

  return {
    generated_at: new Date().toISOString(),
    owner: data.profile?.full_name || "Connor",
    storage: state.storage,
    view: {
      route,
      params: routeParams,
      selected_lead: routeParams.lead || routeParams.id || null,
      selected_demo: routeParams.demo || null,
      selected_client: routeParams.client || null,
    },
    automation: {
      status: state.automation.status,
      current_lead: state.automation.currentLeadName || null,
      current_step: state.automation.currentStep || null,
      processed: state.automation.processed,
      sent: state.automation.sent,
      failures: state.automation.failures.length,
      settings: automationSettings(),
      recent_events: state.automation.events.slice(0, 10),
    },
    today: todayStats(),
    attention: attentionItems().map((item) => ({ title: item.title, detail: item.detail, route: item.route })),
    money: {
      revenue_all_time: revenue.gross,
      profit_all_time: revenue.profit,
      revenue_this_week: getPayments({ range: "week" }).reduce((total, payment) => total + Number(payment.amount || 0), 0),
      revenue_this_month: getPayments({ range: "month" }).reduce((total, payment) => total + Number(payment.amount || 0), 0),
      costs_all_time: revenue.costs,
      emails_sent_today: emailsSentToday(),
    },
    pipeline: pipelineCounts().map(({ id, label, count }) => ({ stage: id, label, count })),
    leads: limit(data.leads, "leads").map(lead),
    discovery: {
      runs: limit(data.discoveryRuns, "discovery").map((run) => ({
        id: run.id, query: run.query, status: run.status, results: run.result_count, saved: run.saved_count, at: run.created_at,
      })),
      pending_results: data.discoveryResults.filter((item) => item.decision === "pending").length,
    },
    templates: data.templates.map((item) => ({
      id: item.id, name: item.name, niche: item.category, layout: item.layout_key, status: item.status, used: item.use_count,
    })),
    demos: limit(data.demos, "demos").map((item) => ({
      id: item.id, lead_id: item.lead_id, name: item.name, status: item.status, preview_url: item.preview_url,
      hosted: Boolean(item.content?.publish?.hosted), template_id: item.template_id,
    })),
    outreach: limit(data.drafts, "drafts").map((item) => ({
      id: item.id, lead_id: item.lead_id, kind: item.kind, subject: item.subject, status: item.status, sent_at: item.sent_at,
    })),
    inbox: limit(data.emailThreads, "threads").map((item) => ({
      id: item.id, lead_id: item.lead_id, from: item.sender_name, subject: item.subject,
      classification: item.classification, unread: item.is_unread, at: item.last_message_at,
    })),
    follow_ups: limit(data.followUps, "followUps").map((item) => ({
      id: item.id, lead_id: item.lead_id, attempt: item.sequence_number, due_at: item.due_at, status: item.status,
    })),
    clients: limit(data.clients, "clients").map((item) => ({
      id: item.id, lead_id: item.lead_id, status: item.status, price: item.agreed_price, received: item.amount_received,
      domain: item.domain, maintenance: item.maintenance_status,
    })),
    projects: limit(data.projects, "projects").map((item) => ({
      id: item.id, client_id: item.client_id, name: item.name, status: item.status, progress: item.progress, deadline: item.deadline,
    })),
    deployments: limit(data.deployments, "deployments").map((item) => ({
      id: item.id, domain: item.domain, status: item.status, health: item.hosting_health, last_deployed_at: item.last_deployed_at,
    })),
    payments: limit(data.payments, "payments").map((item) => ({
      id: item.id, type: item.payment_type, amount: item.amount, status: item.status, at: item.paid_at || item.created_at,
    })),
    expenses: limit(data.expenses, "expenses").map((item) => ({
      id: item.id, category: item.category, vendor: item.vendor, amount: item.amount, on: item.occurred_on,
    })),
    tasks: limit(getTasks({ view: "open" }), "tasks").map((item) => ({
      id: item.id, title: item.title, due_at: item.due_at, priority: item.priority, status: item.status,
    })),
    calendar: limit(data.calendarEvents, "calendar").map((item) => ({
      id: item.id, title: item.title, type: item.event_type, starts_at: item.starts_at,
    })),
    notes: limit(data.notes.filter((note) => !note.is_archived), "notes").map((item) => ({
      id: item.id, title: item.title, category: item.category, pinned: item.is_pinned,
    })),
    activity: limit(data.activity, "activity").map((item) => ({
      type: item.type, title: item.title, detail: item.detail, actor: item.actor_type, at: item.created_at,
    })),
    integrations: integrationList().map((item) => ({ provider: item.provider, status: item.status })),
  };
}

/** Rows for the context indicator in the assistant. */
export function contextSections() {
  const context = buildContext();
  return [
    ["Current view", context.view.route],
    ["Leads", context.leads.length],
    ["Pipeline stages", context.pipeline.length],
    ["Templates", context.templates.length],
    ["Demos", context.demos.length],
    ["Outreach drafts", context.outreach.length],
    ["Inbox threads", context.inbox.length],
    ["Follow-ups", context.follow_ups.length],
    ["Clients", context.clients.length],
    ["Projects", context.projects.length],
    ["Deployments", context.deployments.length],
    ["Payments", context.payments.length],
    ["Expenses", context.expenses.length],
    ["Tasks", context.tasks.length],
    ["Calendar", context.calendar.length],
    ["Notes", context.notes.length],
    ["Activity", context.activity.length],
    ["Integrations", context.integrations.length],
  ];
}

export function contextSummary() {
  const context = buildContext();
  const parts = [
    `${context.leads.length} leads`,
    `${context.today.sent}/${context.today.target} sent today`,
    `${context.attention.length} needing attention`,
    `${formatCurrency(context.money.revenue_this_month)} this month`,
  ];
  return parts.join(" · ");
}

export function contextTokenEstimate() {
  return estimateTokens(buildContext());
}
