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
import { NotConnectedError, integrationList, outlookBlocker } from "../integrations.js";
import {
  attentionItems,
  classifyReply,
  completeTask,
  createCalendarEvent,
  createFollowUp,
  createLead,
  createNote,
  createOrUpdateDemo,
  createOutreachDraft,
  createTask,
  getClients,
  getInbox,
  getNextLead,
  getPayments,
  getTasks,
  leadById,
  overdueFollowUps,
  pickTemplateForLead,
  publishDemo,
  recordExpense,
  recordPayment,
  replyToThread,
  revenueSummary,
  saveDemoFiles,
  searchLeads,
  sendDirectEmail,
  sendDraft,
  todayStats,
  updateLead,
  updatePipeline,
} from "../operations.js";
import { researchBusiness } from "../research/research.js";
import { findRecord, preferences, saveDiscoveryCandidates } from "../data.js";
import { discoverAndSaveLeads, runDiscoverySearch } from "../discovery.js";
import { syncInbox } from "../email/inbox.js";

const registry = new Map();

export const AI_PERMISSION_MODES = Object.freeze([
  {
    id: "view",
    label: "View only",
    shortLabel: "View",
    description: "Read workspace data. No records change and nothing leaves the app.",
    kinds: ["read"],
  },
  {
    id: "work",
    label: "Work in workspace",
    shortLabel: "Work",
    description: "Read and update workspace records. Sending, publishing, research and outreach stay blocked.",
    kinds: ["read", "write"],
  },
  {
    id: "full",
    label: "Full control",
    shortLabel: "Full",
    description: "Use every connected tool, including sending email, publishing demos and running automation.",
    kinds: ["read", "write", "external"],
  },
]);

export function aiPermissionMode() {
  const configured = String(preferences().ai_permission_mode || "work");
  return AI_PERMISSION_MODES.some((mode) => mode.id === configured) ? configured : "work";
}

export function permissionDefinition(mode = aiPermissionMode()) {
  return AI_PERMISSION_MODES.find((entry) => entry.id === mode) || AI_PERMISSION_MODES[1];
}

export function permissionAllows(toolOrName, mode = aiPermissionMode()) {
  const tool = typeof toolOrName === "string" ? registry.get(toolOrName) : toolOrName;
  if (!tool) return false;
  return permissionDefinition(mode).kinds.includes(tool.kind || "read");
}

function define(definition) {
  registry.set(definition.name, { params: [], kind: "read", group: "General", ...definition });
}

export function listTools() {
  return [...registry.values()];
}

export function toolGroups(mode = null) {
  const groups = new Map();
  listTools().filter((tool) => !mode || permissionAllows(tool, mode)).forEach((tool) => {
    if (!groups.has(tool.group)) groups.set(tool.group, []);
    groups.get(tool.group).push(tool);
  });
  return [...groups.entries()];
}

export function getTool(name) {
  return registry.get(name) || null;
}

function propertySchema(param) {
  const type = param.type || "string";
  return {
    type,
    ...(type === "array" ? { items: { type: param.itemType || "string" } } : {}),
    ...(type === "object" ? { additionalProperties: true } : {}),
    description: param.description || "",
  };
}

/** Tool schema in the shape a model API expects. */
export function toolSchema(mode = null) {
  return listTools().filter((tool) => !mode || permissionAllows(tool, mode)).map((tool) => ({
    name: tool.name,
    description: tool.summary,
    input_schema: {
      type: "object",
      properties: Object.fromEntries(tool.params.map((param) => [param.name, propertySchema(param)])),
      required: tool.params.filter((param) => param.required).map((param) => param.name),
    },
  }));
}

/** Runs a tool by name. Never throws for expected outcomes. */
export async function runTool(name, input = {}, { permissionMode = null } = {}) {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `Unknown tool "${name}".` };
  if (permissionMode && !permissionAllows(tool, permissionMode)) {
    const mode = permissionDefinition(permissionMode);
    return {
      ok: false,
      blocked: true,
      permission: true,
      required_kind: tool.kind,
      permission_mode: mode.id,
      error: `${tool.name} is blocked by ${mode.label}. Change AI access to a mode that allows ${tool.kind} tools.`,
    };
  }

  const missing = tool.params.filter((param) => param.required && (input[param.name] === undefined || input[param.name] === ""));
  if (missing.length) {
    return { ok: false, error: `Missing required input: ${missing.map((param) => param.name).join(", ")}.` };
  }

  try {
    const result = await tool.run(input);
    return { ok: true, ...result };
  } catch (error) {
    /* A missing integration is an outcome, not a bug: the model is told what is
       not connected so it can say so instead of retrying forever. */
    if (error instanceof NotConnectedError || error?.blocked) {
      return { ok: false, blocked: true, provider: error.provider || "", error: error.message };
    }
    console.error(`Tool ${name} failed`, error);
    return { ok: false, error: error.message || "Tool failed." };
  }
}

/* ---------- discovery ---------- */

define({
  name: "discover_leads",
  group: "Discovery",
  kind: "external",
  summary: "Search Google Places for local businesses with no real website and add them as leads. This is how new leads enter the system.",
  params: [
    { name: "location", required: true, description: "City, region or address, e.g. \"Austin, TX\"" },
    { name: "business_type", required: true, description: "Niche to search, e.g. plumber, roofer, dentist" },
    { name: "limit", type: "number", description: "How many businesses to keep (default 50, max 250)" },
    { name: "radius_km", type: "number", description: "Search radius in kilometres (default 15)" },
    { name: "min_confidence", type: "number", description: "0-100 confidence that the business has no real website (default 70)" },
    { name: "min_rating", type: "number", description: "Minimum Google rating (default 0, no filter)" },
    { name: "save", type: "boolean", description: "Save the results straight to leads (default true). False leaves them for review on Lead Discovery." },
  ],
  run: async (input) => {
    const query = {
      location: input.location,
      businessType: input.business_type,
      limit: input.limit,
      radiusKm: input.radius_km,
      minConfidence: input.min_confidence,
      minRating: input.min_rating,
    };

    if (input.save === false) {
      const search = await runDiscoverySearch(query);
      return {
        data: { run_id: search.runId, found: search.results.length, scanned: search.summary?.scanned || 0 },
        summary: `${search.results.length} candidate(s) found and left for review on Lead Discovery.`,
      };
    }

    const result = await discoverAndSaveLeads(query);
    return {
      data: {
        run_id: result.runId,
        scanned: result.summary?.scanned || 0,
        found: result.results.length,
        saved: result.saved.map((lead) => ({ id: lead.id, business: lead.business_name, city: lead.city, phone: lead.phone, score: lead.lead_score })),
        duplicates: result.duplicates.length,
      },
      summary: `${result.saved.length} new lead(s) saved from ${result.summary?.scanned || 0} businesses scanned${result.duplicates.length ? `, ${result.duplicates.length} already known` : ""}.`,
    };
  },
});

define({
  name: "save_discovered_leads",
  group: "Discovery",
  kind: "write",
  summary: "Turn pending discovery results into leads.",
  params: [{ name: "result_ids", type: "array", description: "Discovery result ids. Omit to save every pending result." }],
  run: async ({ result_ids: resultIds }) => {
    const pending = getState().data.discoveryResults.filter((item) => item.decision === "pending");
    const ids = Array.isArray(resultIds) && resultIds.length ? resultIds : pending.map((item) => item.id);
    if (!ids.length) return { data: { saved: 0 }, summary: "No pending discovery results to save." };
    const result = await saveDiscoveryCandidates(ids);
    return {
      data: { saved: result.saved.length, duplicates: result.duplicates.length },
      summary: `${result.saved.length} lead(s) saved${result.duplicates.length ? `, ${result.duplicates.length} already known` : ""}.`,
    };
  },
});

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
  name: "create_lead",
  group: "Leads",
  kind: "write",
  summary: "Add a lead by hand — a referral, a walk-in, or a business found outside discovery.",
  params: [
    { name: "business_name", required: true },
    { name: "email", description: "Contact email. Without one, nothing can be sent to this lead." },
    { name: "phone" },
    { name: "city" },
    { name: "category", description: "Niche, e.g. plumbing" },
    { name: "contact_name" },
    { name: "website_url" },
  ],
  run: async (input) => {
    const { lead, created } = await createLead(input);
    return {
      data: lead,
      summary: created ? `${lead.business_name} added as a lead.` : `${lead.business_name} was already a lead.`,
    };
  },
});

define({
  name: "update_lead",
  group: "Leads",
  kind: "write",
  summary: "Change a lead's details. Use this to add the email address before sending.",
  params: [
    { name: "lead_id", required: true },
    { name: "email" },
    { name: "phone" },
    { name: "contact_name" },
    { name: "notes" },
    { name: "deal_value", type: "number", description: "What this lead is worth, in dollars" },
  ],
  run: async ({ lead_id: leadId, ...patch }) => {
    const lead = await updateLead(leadId, patch);
    return { data: lead, summary: `${lead.business_name} updated.` };
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
  kind: "external",
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
  name: "send_draft",
  group: "Outreach",
  kind: "external",
  summary: "Send a prepared outreach draft to its lead.",
  params: [
    { name: "draft_id", required: true },
    { name: "to", description: "Override the lead's stored address for this one send" },
  ],
  run: async ({ draft_id: draftId, to }) => {
    const result = await sendDraft(draftId, { to });
    return {
      data: result,
      blocked: Boolean(result.blocked),
      summary: result.sent ? `Email sent to ${result.to}.` : result.reason,
    };
  },
});

define({
  name: "send_email",
  group: "Outreach",
  kind: "external",
  summary: "Write and send an email to any address through Outlook — a lead, a client, or someone with no record here at all. Give it the recipient, subject and body.",
  params: [
    { name: "to", required: true, description: "Recipient email address, or several separated by commas" },
    { name: "subject", required: true },
    { name: "body", required: true, description: "Plain text body. Write it in full — it is sent exactly as given." },
    { name: "cc", description: "Optional CC addresses, comma separated" },
    { name: "lead_id", description: "Optional: link this email to a lead and mark them contacted" },
  ],
  run: async ({ to, cc, subject, body, lead_id: leadId }) => {
    const result = await sendDirectEmail({ to, cc, subject, body, leadId: leadId || null });
    return { data: result, summary: `Email sent to ${result.to.join(", ")}.` };
  },
});

define({
  name: "reply_to_thread",
  group: "Outreach",
  kind: "external",
  summary: "Reply inside an existing Outlook conversation from the inbox.",
  params: [
    { name: "thread_id", required: true },
    { name: "body", required: true, description: "Plain text reply, sent as written" },
  ],
  run: async ({ thread_id: threadId, body }) => {
    const result = await replyToThread(threadId, body);
    return { data: result, summary: "Reply sent." };
  },
});

define({
  name: "sync_inbox",
  group: "Outreach",
  kind: "external",
  summary: "Pull new messages from the connected Outlook mailbox into the inbox and match them to leads.",
  run: async () => {
    const result = await syncInbox();
    return {
      data: result,
      summary: result.messages
        ? `${result.messages} new message(s) across ${result.threads} new thread(s).`
        : "No new messages.",
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

define({
  name: "record_payment",
  group: "Business",
  kind: "write",
  summary: "Record a payment that did not come through Whop.",
  params: [
    { name: "customer_name", required: true },
    { name: "amount", type: "number", required: true },
    { name: "payment_type", description: "website_sale (default) or maintenance" },
    { name: "fee_amount", type: "number" },
  ],
  run: async (input) => {
    const payment = await recordPayment(input);
    return { data: payment, summary: `${formatCurrency(payment.amount)} from ${payment.customer_name} recorded.` };
  },
});

define({
  name: "record_expense",
  group: "Business",
  kind: "write",
  summary: "Record a business cost so profit stays accurate.",
  params: [
    { name: "description", required: true },
    { name: "amount", type: "number", required: true },
    { name: "category", description: "hosting, domains, apis, software, payment_fees, ai or other" },
    { name: "vendor" },
  ],
  run: async (input) => {
    const expense = await recordExpense(input);
    return { data: expense, summary: `${formatCurrency(expense.amount)} expense recorded.` };
  },
});

define({
  name: "get_follow_ups",
  group: "Business",
  summary: "Follow-ups that are scheduled or already overdue.",
  params: [{ name: "view", description: "overdue (default) or all" }],
  run: ({ view = "overdue" }) => {
    const items = view === "all" ? getState().data.followUps : overdueFollowUps();
    return {
      data: items.map((item) => ({
        id: item.id,
        lead_id: item.lead_id,
        lead: leadById(item.lead_id)?.business_name || null,
        attempt: item.sequence_number,
        due_at: item.due_at,
        status: item.status,
      })),
      summary: `${items.length} follow-up(s) ${view === "all" ? "total" : "overdue"}.`,
    };
  },
});

define({
  name: "get_integrations",
  group: "Business",
  summary: "Which services are connected, and what is blocking the ones that are not.",
  run: () => {
    const list = integrationList().map((item) => ({ provider: item.provider, name: item.name, status: item.status }));
    const blocker = outlookBlocker();
    return {
      data: { integrations: list, outlook_blocker: blocker || null },
      summary: `${list.filter((item) => item.status === "connected").length} of ${list.length} connected.${blocker ? ` Outlook: ${blocker}` : ""}`,
    };
  },
});

/* ---------- workspace ---------- */

define({
  name: "create_task",
  group: "Workspace",
  kind: "write",
  summary: "Add a task to the workspace.",
  params: [
    { name: "title", required: true },
    { name: "due_at", description: "ISO date, or a number of days from now" },
    { name: "priority", description: "low, normal, high or urgent" },
    { name: "lead_id" },
    { name: "description" },
  ],
  run: async (input) => {
    const task = await createTask({ ...input, created_by: "ai" });
    return { data: task, summary: `Task added: ${task.title}.` };
  },
});

define({
  name: "complete_task",
  group: "Workspace",
  kind: "write",
  summary: "Mark a task as done.",
  params: [{ name: "task_id", required: true }],
  run: async ({ task_id: taskId }) => {
    const task = await completeTask(taskId);
    return { data: task, summary: `Completed: ${task.title}.` };
  },
});

define({
  name: "create_note",
  group: "Workspace",
  kind: "write",
  summary: "Save a note.",
  params: [
    { name: "title", required: true },
    { name: "content" },
    { name: "lead_id" },
  ],
  run: async (input) => {
    const note = await createNote(input);
    return { data: note, summary: `Note saved: ${note.title}.` };
  },
});

define({
  name: "create_calendar_event",
  group: "Workspace",
  kind: "write",
  summary: "Put something on the calendar.",
  params: [
    { name: "title", required: true },
    { name: "starts_at", description: "ISO datetime, or a number of days from now" },
    { name: "event_type", description: "follow_up, call, deadline, launch, maintenance, task or other" },
    { name: "lead_id" },
    { name: "notes" },
  ],
  run: async (input) => {
    const event = await createCalendarEvent(input);
    return { data: event, summary: `${event.title} scheduled.` };
  },
});

define({
  name: "get_activity",
  group: "Workspace",
  summary: "Recent activity across the whole workspace.",
  params: [{ name: "limit", type: "number", description: "Default 25" }],
  run: ({ limit = 25 }) => {
    const items = getState().data.activity.slice(0, Math.min(Number(limit) || 25, 100));
    return {
      data: items.map((item) => ({ type: item.type, title: item.title, detail: item.detail, at: item.created_at })),
      summary: `${items.length} recent event(s).`,
    };
  },
});

/* ---------- automation ---------- */

define({
  name: "start_automation",
  group: "Automation",
  kind: "external",
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
  kind: "external",
  summary: "Run the full sequence once for a single lead.",
  params: [{ name: "lead_id" }],
  run: async ({ lead_id: leadId }) => {
    const result = await runOnce(leadId);
    return { data: result, summary: result.ok ? `Prepared ${result.result.leadName}.` : result.reason };
  },
});
