/**
 * Deterministic operations layer.
 *
 * Every meaningful business action lives here exactly once. The UI calls these,
 * the automation engine calls these, and the AI tool registry is a thin wrapper
 * around these — so an assistant, a keyboard shortcut and the batch runner can
 * never drift apart.
 */
import { CONFIG, PIPELINE_STAGES } from "../config.js";
import { getState } from "../core/state.js";
import { daysSince, isSameMonth, isToday, slugify, sum } from "../core/utils.js";
import {
  createRecord,
  findRecord,
  logActivity,
  preferences,
  updateRecord,
} from "./data.js";
import { TEMPLATE_CATALOG } from "../data/site-templates.js";
import { draftFollowUp, draftOutreach, sendEmail } from "./email/outreach.js";
import { NotConnectedError } from "./integrations.js";
import { buildBundleForLead, catalogForRecord, chooseTemplate } from "./sites/bundle.js";
import { publishBundle } from "./sites/publish.js";

const OPEN_STATUSES = ["new", "qualified", "demo_ready"];
const CLOSED_STATUSES = ["won", "lost"];

function data() {
  return getState().data;
}

export function leadById(id) {
  return findRecord("leads", id);
}

export function demoForLead(leadId) {
  return data().demos.find((demo) => String(demo.lead_id) === String(leadId)) || null;
}

export function draftsForLead(leadId) {
  return data().drafts.filter((draft) => String(draft.lead_id) === String(leadId));
}

export function hasBeenContacted(lead) {
  if (!lead) return false;
  if (lead.last_contacted_at) return true;
  if (!OPEN_STATUSES.includes(lead.status)) return true;
  return draftsForLead(lead.id).some((draft) => draft.status === "sent");
}

/** The next best lead to work: highest score, oldest first, never contacted. */
export function getNextLead({ niche = "", location = "", skipIds = [] } = {}) {
  const skip = new Set(skipIds.map(String));
  const nicheValue = niche.trim().toLowerCase();
  const locationValue = location.trim().toLowerCase();

  const candidates = data().leads.filter((lead) => {
    if (skip.has(String(lead.id))) return false;
    if (!OPEN_STATUSES.includes(lead.status)) return false;
    if (hasBeenContacted(lead)) return false;
    if (lead.has_website) return false;
    if (nicheValue && !`${lead.category || ""} ${(lead.tags || []).join(" ")}`.toLowerCase().includes(nicheValue)) return false;
    if (locationValue && !`${lead.city || ""} ${lead.region || ""} ${lead.address || ""}`.toLowerCase().includes(locationValue)) return false;
    return true;
  });

  return candidates.sort((a, b) => (
    Number(b.lead_score || 0) - Number(a.lead_score || 0)
    || new Date(a.discovered_at || a.created_at || 0) - new Date(b.discovered_at || b.created_at || 0)
  ))[0] || null;
}

export function searchLeads({ query = "", status = "", limit = 25 } = {}) {
  const value = query.trim().toLowerCase();
  return data().leads
    .filter((lead) => (!status || lead.status === status)
      && (!value || `${lead.business_name} ${lead.category} ${lead.city} ${lead.region} ${lead.phone} ${lead.email}`.toLowerCase().includes(value)))
    .slice(0, limit);
}

/* ---------- templates ---------- */

/** Creates the catalogue templates the first time they are needed. */
export async function ensureTemplateRecords() {
  const existing = data().templates;
  if (existing.length) return existing;
  for (const entry of TEMPLATE_CATALOG) {
    await createRecord("templates", {
      name: entry.name,
      category: entry.category,
      description: entry.description,
      layout_key: entry.key,
      accent_color: entry.theme.accent,
      status: "active",
      is_active: true,
      use_count: 0,
    });
  }
  return data().templates;
}

export async function pickTemplateForLead(leadOrId) {
  const lead = typeof leadOrId === "object" ? leadOrId : leadById(leadOrId);
  await ensureTemplateRecords();
  const choice = chooseTemplate(lead, data().templates);
  if (!choice.record) throw new Error("No templates available.");
  return choice;
}

/* ---------- demos ---------- */

function demoName(lead) {
  return `${lead.business_name} website`;
}

/**
 * Builds (or rebuilds) the real site bundle for a lead and stores it on the
 * demo record.
 */
export async function createOrUpdateDemo(leadOrId, { templateRecord, overrides = {}, keepEdits = false } = {}) {
  const lead = typeof leadOrId === "object" ? leadOrId : leadById(leadOrId);
  if (!lead) throw new Error("Lead not found.");

  const choice = templateRecord
    ? { record: templateRecord, entry: catalogForRecord(templateRecord), reason: `Using ${templateRecord.name}.` }
    : await pickTemplateForLead(lead);

  const existing = demoForLead(lead.id);
  const previousSite = existing?.content?.site || {};
  const site = { ...previousSite, ...overrides };
  const built = buildBundleForLead(lead, choice.entry, site);
  const files = keepEdits && existing?.content?.files ? existing.content.files : built.files;

  const payload = {
    lead_id: lead.id,
    template_id: choice.record.id,
    name: existing?.name || demoName(lead),
    slug: existing?.slug || slugify(`${lead.business_name}-${String(lead.city || "").slice(0, 12)}`),
    status: existing?.status && existing.status !== "draft" ? existing.status : "ready",
    business_info: {
      name: built.site.business,
      phone: built.site.phone,
      email: built.site.email,
      address: built.site.address,
      hours: built.site.hours,
      cta: built.site.cta,
    },
    theme: { accent: choice.entry.theme.accent, layout: choice.entry.layout },
    content: {
      site: built.site,
      files,
      layout_key: choice.entry.key,
      publish: existing?.content?.publish || null,
      custom_edited: keepEdits ? Boolean(existing?.content?.custom_edited) : false,
    },
    qa_score: 92,
  };

  const demo = existing
    ? await updateRecord("demos", existing.id, payload)
    : await createRecord("demos", payload);

  if (!existing) {
    await updateRecord("templates", choice.record.id, { use_count: Number(choice.record.use_count || 0) + 1 });
    if (lead.status === "new" || lead.status === "qualified") await updateRecord("leads", lead.id, { status: "demo_ready" });
    await logActivity("demo_created", "Demo built", `${lead.business_name} · ${choice.record.name}`, { lead_id: lead.id });
  }

  return { demo, template: choice.record, reason: choice.reason, site: built.site };
}

export async function saveDemoFiles(demoId, files, { summary = "Manual edit", custom = true } = {}) {
  const demo = findRecord("demos", demoId);
  if (!demo) throw new Error("Demo not found.");
  const updated = await updateRecord("demos", demoId, {
    content: { ...(demo.content || {}), files, custom_edited: custom },
  });
  await createRecord("demoVersions", {
    demo_id: demoId,
    version_number: data().demoVersions.filter((item) => item.demo_id === demoId).length + 1,
    storage_path: `inline/${demo.slug || demoId}`,
    change_summary: summary,
    is_current: true,
  });
  return updated;
}

export async function publishDemo(demoId) {
  const demo = findRecord("demos", demoId);
  if (!demo) throw new Error("Demo not found.");
  const lead = leadById(demo.lead_id);
  const result = await publishBundle({
    demo,
    lead,
    files: demo.content?.files || {},
    previewDomain: preferences().preview_domain,
  });
  const updated = await updateRecord("demos", demoId, {
    preview_url: result.url,
    status: demo.status === "draft" ? "ready" : demo.status,
    content: { ...(demo.content || {}), publish: result },
  });
  await logActivity("demo_published", result.hosted ? "Demo published" : "Demo ready to publish", `${lead?.business_name || demo.name} · ${result.url}`, { lead_id: demo.lead_id });
  return { demo: updated, publish: result };
}

/* ---------- outreach ---------- */

export async function createOutreachDraft(leadOrId, { price, status = "ready", kind = "initial" } = {}) {
  const lead = typeof leadOrId === "object" ? leadOrId : leadById(leadOrId);
  if (!lead) throw new Error("Lead not found.");
  const demo = demoForLead(lead.id);
  const settings = preferences();
  const amount = Number(price) || Number(lead.deal_value) || Number(settings.default_site_price) || CONFIG.defaultPrice;
  const copy = kind === "follow_up"
    ? draftFollowUp({ lead, demo, price: amount, owner: settings.owner_name })
    : draftOutreach({ lead, demo, price: amount, owner: settings.owner_name });

  const existing = draftsForLead(lead.id).find((draft) => draft.kind === kind && ["draft", "ready"].includes(draft.status));
  const payload = { lead_id: lead.id, kind, subject: copy.subject, body: copy.body, status };
  const draft = existing
    ? await updateRecord("drafts", existing.id, payload)
    : await createRecord("drafts", payload);
  return { draft, demo, price: amount };
}

/**
 * Attempts a real send. When Outlook is not connected the draft is left in
 * `ready` and the blocked reason is returned — nothing is marked as sent.
 */
export async function sendDraft(draftId) {
  const draft = findRecord("drafts", draftId);
  if (!draft) throw new Error("Draft not found.");
  const lead = leadById(draft.lead_id);

  try {
    const result = await sendEmail({ to: lead?.email, subject: draft.subject, body: draft.body });
    const sentAt = new Date().toISOString();
    const sent = await updateRecord("drafts", draftId, {
      status: "sent",
      sent_at: sentAt,
      external_message_id: result?.id || null,
      error_message: null,
    });
    await markContacted(lead.id, sentAt);
    await logActivity("email_sent", "Outreach sent", `${lead?.business_name} · ${draft.subject}`, { lead_id: lead?.id });
    return { sent: true, draft: sent };
  } catch (error) {
    if (error instanceof NotConnectedError) {
      await updateRecord("drafts", draftId, { status: "ready", error_message: error.message });
      return { sent: false, blocked: true, reason: error.message, provider: error.provider };
    }
    await updateRecord("drafts", draftId, { status: "failed", error_message: error.message });
    throw error;
  }
}

export async function markContacted(leadId, when = new Date().toISOString()) {
  const lead = leadById(leadId);
  if (!lead) return null;
  return updateRecord("leads", leadId, {
    status: CLOSED_STATUSES.includes(lead.status) ? lead.status : "contacted",
    last_contacted_at: when,
  });
}

export async function createFollowUp(leadId, { days, attempt, draftId = null, suggestion = "" } = {}) {
  const lead = leadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  const settings = preferences();
  const sequence = Number(attempt) || data().followUps.filter((item) => String(item.lead_id) === String(leadId)).length + 1;
  const offsetDays = Number(days) || (settings.follow_up_days || [3, 7, 14])[Math.min(sequence - 1, 2)] || 3;
  const due = new Date();
  due.setDate(due.getDate() + offsetDays);

  const followUp = await createRecord("followUps", {
    lead_id: leadId,
    draft_id: draftId,
    sequence_number: Math.min(12, sequence),
    due_at: due.toISOString(),
    status: "scheduled",
    suggested_text: suggestion || `Check in on the website preview for ${lead.business_name}.`,
  });
  await updateRecord("leads", leadId, { follow_up_at: followUp.due_at });
  return followUp;
}

export async function updatePipeline(leadId, status) {
  if (!PIPELINE_STAGES.some((stage) => stage.id === status)) throw new Error(`Unknown pipeline stage "${status}".`);
  const lead = leadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  const updated = await updateRecord("leads", leadId, { status });
  await logActivity("pipeline_moved", "Pipeline updated", `${lead.business_name}: ${lead.status} → ${status}`, { lead_id: leadId });
  return updated;
}

/* ---------- inbox ---------- */

export function getInbox({ unreadOnly = false, limit = 25 } = {}) {
  return data().emailThreads
    .filter((thread) => (!unreadOnly || thread.is_unread))
    .slice(0, limit);
}

export async function classifyReply(threadId, classification) {
  const thread = findRecord("emailThreads", threadId);
  if (!thread) throw new Error("Thread not found.");
  const updated = await updateRecord("emailThreads", threadId, {
    classification,
    intent: classification,
    is_unread: false,
  });
  const leadStatus = {
    interested: "interested",
    needs_changes: "interested",
    price_objection: "replied",
    maybe: "replied",
    follow_up_later: "replied",
    not_interested: "lost",
    wrong_person: "lost",
  }[classification];
  if (leadStatus && thread.lead_id) await updateRecord("leads", thread.lead_id, { status: leadStatus });
  return updated;
}

/* ---------- read models ---------- */

export function getClients({ status = "" } = {}) {
  return data().clients.filter((client) => !status || client.status === status);
}

export function getPayments({ range = "all" } = {}) {
  const paid = data().payments.filter((payment) => ["paid", "available"].includes(payment.status));
  if (range === "today") return paid.filter((payment) => isToday(payment.paid_at || payment.created_at));
  if (range === "week") {
    const since = Date.now() - 7 * 86_400_000;
    return paid.filter((payment) => new Date(payment.paid_at || payment.created_at).getTime() >= since);
  }
  if (range === "month") return paid.filter((payment) => isSameMonth(payment.paid_at || payment.created_at));
  return paid;
}

export function getTasks({ view = "open" } = {}) {
  const tasks = data().tasks;
  if (view === "today") return tasks.filter((task) => task.status !== "completed" && isToday(task.due_at));
  if (view === "overdue") return tasks.filter((task) => task.status !== "completed" && task.due_at && new Date(task.due_at) < new Date() && !isToday(task.due_at));
  if (view === "completed") return tasks.filter((task) => task.status === "completed");
  return tasks.filter((task) => !["completed", "cancelled"].includes(task.status));
}

export function revenueSummary() {
  const paid = getPayments();
  const gross = sum(paid, (payment) => payment.amount);
  const fees = sum(paid, (payment) => payment.fee_amount);
  const costs = sum(data().expenses, (expense) => expense.amount) + sum(data().aiUsage, (usage) => usage.cost);
  return { paid, gross, fees, costs, profit: gross - fees - costs };
}

export function emailsSentToday() {
  return data().drafts.filter((draft) => draft.status === "sent" && isToday(draft.sent_at || draft.updated_at)).length;
}

export function overdueFollowUps() {
  return data().followUps.filter((item) => (
    !["sent", "replied", "completed", "dead", "skipped", "cancelled"].includes(item.status)
    && item.due_at && new Date(item.due_at) < new Date()
  ));
}

export function failedDeployments() {
  return data().deployments.filter((item) => item.status === "failed" || item.hosting_health === "error");
}

export function unreadReplies() {
  return data().emailThreads.filter((thread) => thread.is_unread);
}

/** Everything that genuinely needs a human right now, most urgent first. */
export function attentionItems() {
  const items = [];

  unreadReplies().forEach((thread) => {
    const lead = thread.lead_id ? leadById(thread.lead_id) : null;
    items.push({
      id: `reply-${thread.id}`,
      weight: thread.classification === "interested" ? 0 : 1,
      tone: thread.classification === "interested" ? "green" : "amber",
      iconName: "mail",
      title: `${lead?.business_name || thread.sender_name || "Someone"} replied`,
      detail: thread.subject || "New reply",
      at: thread.last_message_at,
      route: "inbox",
      params: { thread: thread.id },
    });
  });

  const overdue = overdueFollowUps();
  if (overdue.length) {
    items.push({
      id: "followups",
      weight: 2,
      tone: "amber",
      iconName: "timer",
      title: `${overdue.length} follow-up${overdue.length === 1 ? "" : "s"} overdue`,
      detail: overdue.slice(0, 3).map((item) => leadById(item.lead_id)?.business_name || "Lead").join(", "),
      route: "follow-ups",
      params: { view: "overdue" },
    });
  }

  const failed = failedDeployments();
  if (failed.length) {
    items.push({
      id: "deployments",
      weight: 3,
      tone: "red",
      iconName: "globe",
      title: failed.length === 1 ? "A deployment needs attention" : `${failed.length} deployments need attention`,
      detail: failed.map((item) => item.domain || "Client site").join(", "),
      route: "deployments",
    });
  }

  const automation = getState().automation;
  if (automation.failures.length) {
    items.push({
      id: "automation-failures",
      weight: 2,
      tone: "amber",
      iconName: "alert",
      title: `${automation.failures.length} automation item${automation.failures.length === 1 ? "" : "s"} failed`,
      detail: automation.failures[0]?.reason || "Open Automation for details",
      route: "automation",
    });
  }

  const dueTasks = getTasks({ view: "overdue" });
  if (dueTasks.length) {
    items.push({
      id: "tasks",
      weight: 4,
      tone: "amber",
      iconName: "check-square",
      title: `${dueTasks.length} task${dueTasks.length === 1 ? "" : "s"} overdue`,
      detail: dueTasks.slice(0, 2).map((task) => task.title).join(", "),
      route: "tasks",
      params: { view: "overdue" },
    });
  }

  const stale = data().leads.filter((lead) => lead.status === "contacted" && !data().followUps.some((item) => String(item.lead_id) === String(lead.id) && !["sent", "completed", "dead"].includes(item.status)) && daysSince(lead.last_contacted_at) >= 4);
  if (stale.length) {
    items.push({
      id: "stale",
      weight: 5,
      tone: "",
      iconName: "user",
      title: `${stale.length} contacted lead${stale.length === 1 ? "" : "s"} with no follow-up`,
      detail: stale.slice(0, 3).map((lead) => lead.business_name).join(", "),
      route: "leads",
      params: { stage: "contacted" },
    });
  }

  return items.sort((a, b) => a.weight - b.weight);
}

export function todayStats() {
  const settings = preferences();
  const sent = emailsSentToday();
  const replies = data().emailThreads.filter((thread) => isToday(thread.last_message_at));
  return {
    target: Number(getState().automationSettings?.batchTarget || settings.batch_target || CONFIG.defaultBatchTarget),
    sent,
    replies: replies.length,
    interested: replies.filter((thread) => ["interested", "needs_changes"].includes(thread.classification)).length,
    revenue: sum(getPayments({ range: "today" }), (payment) => payment.amount),
    demos: data().demos.filter((demo) => isToday(demo.created_at)).length,
    newLeads: data().leads.filter((lead) => isToday(lead.discovered_at || lead.created_at)).length,
  };
}

export function pipelineCounts() {
  return PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: data().leads.filter((lead) => lead.status === stage.id).length,
  }));
}

export { OPEN_STATUSES, CLOSED_STATUSES };
