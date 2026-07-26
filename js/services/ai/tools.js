/**
 * Tool registry.
 *
 * These are the operations an assistant (or an external MCP client) can call.
 * Each one is deterministic, validated, and delegates to the shared operations
 * layer — the model never manipulates records directly.
 */
import { getState } from "../../core/state.js";
import { formatCurrency } from "../../core/utils.js";
import { automationSettings, runOnce, startAutomation, stopAutomation } from "../automation/engine.js";
import { NotConnectedError } from "../integrations.js";
import {
  attentionItems,
  classifyReply,
  createFollowUp,
  createOrUpdateDemo,
  createOutreachDraft,
  getClients,
  getInbox,
  getNextLead,
  getPayments,
  getTasks,
  leadById,
  pickTemplateForLead,
  publishDemo,
  revenueSummary,
  saveDemoFiles,
  searchLeads,
  sendDraft,
  todayStats,
  updatePipeline,
} from "../operations.js";
import { researchBusiness } from "../research/research.js";
import { findRecord } from "../data.js";

const registry = new Map();

function define(definition) {
  registry.set(definition.name, { params: [], kind: "read", group: "General", ...definition });
}

export function listTools() {
  return [...registry.values()];
}

export function toolGroups() {
  const groups = new Map();
  listTools().forEach((tool) => {
    if (!groups.has(tool.group)) groups.set(tool.group, []);
    groups.get(tool.group).push(tool);
  });
  return [...groups.entries()];
}

export function getTool(name) {
  return registry.get(name) || null;
}

/** Tool schema in the shape a model API expects. */
export function toolSchema() {
  return listTools().map((tool) => ({
    name: tool.name,
    description: tool.summary,
    input_schema: {
      type: "object",
      properties: Object.fromEntries(tool.params.map((param) => [param.name, { type: param.type || "string", description: param.description || "" }])),
      required: tool.params.filter((param) => param.required).map((param) => param.name),
    },
  }));
}

/** Runs a tool by name. Never throws for expected outcomes. */
export async function runTool(name, input = {}) {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `Unknown tool "${name}".` };

  const missing = tool.params.filter((param) => param.required && (input[param.name] === undefined || input[param.name] === ""));
  if (missing.length) {
    return { ok: false, error: `Missing required input: ${missing.map((param) => param.name).join(", ")}.` };
  }

  try {
    const result = await tool.run(input);
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof NotConnectedError) {
      return { ok: false, blocked: true, provider: error.provider, error: error.message };
    }
    console.error(`Tool ${name} failed`, error);
    return { ok: false, error: error.message || "Tool failed." };
  }
}

/* ---------- leads ---------- */

define({
  name: "get_next_lead",
  group: "Leads",
  summary: "Pick the best qualified lead that has not been contacted yet.",
  params: [
    { name: "niche", description: "Optional niche filter, e.g. plumbing" },
    { name: "location", description: "Optional city or region filter" },
  ],
  run: ({ niche = "", location = "" }) => {
    const lead = getNextLead({ niche, location });
    return {
      data: lead,
      summary: lead ? `${lead.business_name} · ${lead.category} · score ${lead.lead_score}` : "No uncontacted qualified leads.",
    };
  },
});

define({
  name: "search_leads",
  group: "Leads",
  summary: "Search leads by business name, niche, city, phone or email.",
  params: [
    { name: "query", description: "Free text search" },
    { name: "status", description: "Pipeline stage filter" },
    { name: "limit", type: "number", description: "Maximum results (default 25)" },
  ],
  run: (input) => {
    const results = searchLeads(input);
    return { data: results, summary: `${results.length} lead(s) matched.` };
  },
});

define({
  name: "get_lead",
  group: "Leads",
  summary: "Read one lead with its demo, drafts and follow-ups.",
  params: [{ name: "lead_id", required: true, description: "Lead id" }],
  run: ({ lead_id: leadId }) => {
    const lead = leadById(leadId);
    if (!lead) throw new Error("Lead not found.");
    const { data } = getState();
    return {
      data: {
        lead,
        demo: data.demos.find((demo) => demo.lead_id === lead.id) || null,
        drafts: data.drafts.filter((draft) => draft.lead_id === lead.id),
        followUps: data.followUps.filter((item) => item.lead_id === lead.id),
      },
      summary: `${lead.business_name} · ${lead.status}`,
    };
  },
});

define({
  name: "research_business",
  group: "Leads",
  summary: "Gather public information about a lead's business.",
  kind: "external",
  params: [{ name: "lead_id", required: true }],
  run: async ({ lead_id: leadId }) => {
    const lead = leadById(leadId);
    if (!lead) throw new Error("Lead not found.");
    const research = await researchBusiness(lead);
    return { data: research, summary: research.note };
  },
});

define({
  name: "update_pipeline",
  group: "Leads",
  kind: "write",
  summary: "Move a lead to another pipeline stage.",
  params: [
    { name: "lead_id", required: true },
    { name: "status", required: true, description: "new, qualified, demo_ready, contacted, replied, interested, closing, won, lost" },
  ],
  run: async ({ lead_id: leadId, status }) => {
    const lead = await updatePipeline(leadId, status);
    return { data: lead, summary: `${lead.business_name} moved to ${status}.` };
  },
});

/* ---------- websites ---------- */

define({
  name: "list_templates",
  group: "Websites",
  summary: "List reusable website templates and their niches.",
  run: () => {
    const templates = getState().data.templates;
    return { data: templates, summary: `${templates.length} template(s).` };
  },
});

define({
  name: "choose_template",
  group: "Websites",
  summary: "Choose the best template for a lead's niche.",
  params: [{ name: "lead_id", required: true }],
  run: async ({ lead_id: leadId }) => {
    const choice = await pickTemplateForLead(leadId);
    return { data: { template: choice.record, reason: choice.reason }, summary: choice.reason };
  },
});

define({
  name: "create_demo",
  group: "Websites",
  kind: "write",
  summary: "Build a demo site for a lead from a template and business data.",
  params: [
    { name: "lead_id", required: true },
    { name: "template_id", description: "Optional; chosen automatically when omitted" },
  ],
  run: async ({ lead_id: leadId, template_id: templateId }) => {
    const templateRecord = templateId ? findRecord("templates", templateId) : null;
    const result = await createOrUpdateDemo(leadId, { templateRecord });
    return { data: result.demo, summary: `Built ${result.demo.name} using ${result.template.name}.` };
  },
});

define({
  name: "update_demo",
  group: "Websites",
  kind: "write",
  summary: "Update a demo — either regenerate it from its template with new business details, or replace bundle files.",
  params: [
    { name: "demo_id", required: true },
    { name: "details", type: "object", description: "Business detail overrides (business, phone, email, address, cta, headline)" },
    { name: "files", type: "object", description: "Replacement file map, e.g. { \"index.html\": \"…\" }" },
  ],
  run: async ({ demo_id: demoId, details, files }) => {
    const demo = findRecord("demos", demoId);
    if (!demo) throw new Error("Demo not found.");
    if (files && Object.keys(files).length) {
      const updated = await saveDemoFiles(demoId, { ...(demo.content?.files || {}), ...files }, { summary: "Updated by tool" });
      return { data: updated, summary: `Replaced ${Object.keys(files).join(", ")}.` };
    }
    const result = await createOrUpdateDemo(demo.lead_id, { overrides: details || {} });
    return { data: result.demo, summary: "Demo regenerated from its template with the new details." };
  },
});

define({
  name: "publish_demo",
  group: "Websites",
  kind: "write",
  summary: "Publish or refresh a demo's preview link.",
  params: [{ name: "demo_id", required: true }],
  run: async ({ demo_id: demoId }) => {
    const result = await publishDemo(demoId);
    return {
      data: result.demo,
      blocked: !result.publish.hosted,
      summary: result.publish.hosted ? `Published to ${result.publish.url}.` : result.publish.note,
    };
  },
});

/* ---------- outreach ---------- */

define({
  name: "draft_email",
  group: "Outreach",
  kind: "write",
  summary: "Draft the outreach email for a lead using the standard offer.",
  params: [
    { name: "lead_id", required: true },
    { name: "price", type: "number", description: "Offer amount; defaults to the configured price" },
  ],
  run: async ({ lead_id: leadId, price }) => {
    const { draft } = await createOutreachDraft(leadId, { price });
    return { data: draft, summary: `Draft ready: "${draft.subject}".` };
  },
});

define({
  name: "send_email",
  group: "Outreach",
  kind: "external",
  summary: "Send a prepared outreach draft.",
  params: [{ name: "draft_id", required: true }],
  run: async ({ draft_id: draftId }) => {
    const result = await sendDraft(draftId);
    return {
      data: result,
      blocked: Boolean(result.blocked),
      summary: result.sent ? "Email sent." : result.reason,
    };
  },
});

define({
  name: "create_followup",
  group: "Outreach",
  kind: "write",
  summary: "Schedule a follow-up for a lead.",
  params: [
    { name: "lead_id", required: true },
    { name: "days", type: "number", description: "Days from now (defaults to the configured cadence)" },
  ],
  run: async ({ lead_id: leadId, days }) => {
    const followUp = await createFollowUp(leadId, { days });
    return { data: followUp, summary: `Follow-up #${followUp.sequence_number} scheduled.` };
  },
});

define({
  name: "get_inbox",
  group: "Outreach",
  summary: "List inbox threads, optionally only unread ones.",
  params: [{ name: "unread_only", type: "boolean" }],
  run: ({ unread_only: unreadOnly }) => {
    const threads = getInbox({ unreadOnly: Boolean(unreadOnly) });
    return { data: threads, summary: `${threads.length} thread(s).` };
  },
});

define({
  name: "classify_reply",
  group: "Outreach",
  kind: "write",
  summary: "Classify a reply and move the lead accordingly.",
  params: [
    { name: "thread_id", required: true },
    { name: "classification", required: true, description: "interested, maybe, needs_changes, price_objection, follow_up_later, not_interested, wrong_person, other" },
  ],
  run: async ({ thread_id: threadId, classification }) => {
    const thread = await classifyReply(threadId, classification);
    return { data: thread, summary: `Thread classified as ${classification}.` };
  },
});

/* ---------- business ---------- */

define({
  name: "get_clients",
  group: "Business",
  summary: "List clients and their fulfilment status.",
  params: [{ name: "status" }],
  run: ({ status }) => {
    const clients = getClients({ status });
    return { data: clients, summary: `${clients.length} client(s).` };
  },
});

define({
  name: "get_payments",
  group: "Business",
  summary: "List received payments for a period.",
  params: [{ name: "range", description: "today, week, month or all" }],
  run: ({ range = "all" }) => {
    const payments = getPayments({ range });
    const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return { data: { payments, total }, summary: `${formatCurrency(total)} across ${payments.length} payment(s).` };
  },
});

define({
  name: "get_revenue",
  group: "Business",
  summary: "Revenue, costs and profit summary.",
  run: () => {
    const summary = revenueSummary();
    return {
      data: summary,
      summary: `${formatCurrency(summary.gross)} revenue, ${formatCurrency(summary.profit)} profit.`,
    };
  },
});

define({
  name: "get_tasks",
  group: "Business",
  summary: "List tasks by view: open, today, overdue or completed.",
  params: [{ name: "view" }],
  run: ({ view = "open" }) => {
    const tasks = getTasks({ view });
    return { data: tasks, summary: `${tasks.length} task(s).` };
  },
});

define({
  name: "get_status",
  group: "Business",
  summary: "What needs attention right now, plus today's numbers.",
  run: () => {
    const attention = attentionItems();
    const today = todayStats();
    return {
      data: { attention, today, automation: getState().automation.status },
      summary: `${attention.length} item(s) need attention · ${today.sent}/${today.target} sent today.`,
    };
  },
});

/* ---------- automation ---------- */

define({
  name: "start_automation",
  group: "Automation",
  kind: "write",
  summary: "Start the outreach batch: pick leads, build demos, publish, draft and send.",
  params: [
    { name: "batchTarget", type: "number", description: "How many leads to process" },
    { name: "niche" },
    { name: "location" },
  ],
  run: async (input) => {
    const overrides = {};
    if (input.batchTarget) overrides.batchTarget = Number(input.batchTarget);
    if (input.niche) overrides.niche = input.niche;
    if (input.location) overrides.location = input.location;
    const result = await startAutomation(overrides);
    return { data: result, summary: result.ok ? `Automation started, target ${automationSettings().batchTarget}.` : result.reason };
  },
});

define({
  name: "stop_automation",
  group: "Automation",
  kind: "write",
  summary: "Stop the automation after the current lead.",
  run: () => {
    const result = stopAutomation("Stopped by assistant.");
    return { data: result, summary: result.ok ? "Stopping after the current lead." : result.reason };
  },
});

define({
  name: "run_one_lead",
  group: "Automation",
  kind: "write",
  summary: "Run the full sequence once for a single lead.",
  params: [{ name: "lead_id" }],
  run: async ({ lead_id: leadId }) => {
    const result = await runOnce(leadId);
    return { data: result, summary: result.ok ? `Prepared ${result.result.leadName}.` : result.reason };
  },
});
