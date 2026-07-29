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
import { draftFollowUp, draftOutreach, isEmailAddress, replyToMessage, sendEmail } from "./email/outreach.js";
import { NotConnectedError } from "./integrations.js";
import { buildBundleForTemplateRecord, catalogForRecord, chooseTemplate } from "./sites/bundle.js";
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

/**
 * The next best lead to work: email-ready first, then highest score and oldest
 * first. Phone-only leads remain eligible as a fallback instead of disappearing
 * from the workspace, but the email outreach loop does not waste its first
 * builds on leads it cannot yet contact.
 */
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
    Number(Boolean(b.email)) - Number(Boolean(a.email))
    || Number(b.lead_score || 0) - Number(a.lead_score || 0)
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
  const installed = new Set(
    existing
      .filter((template) => template.source_kind !== "custom")
      .map((template) => template.layout_key),
  );
  for (const entry of TEMPLATE_CATALOG) {
    if (installed.has(entry.key)) continue;
    await createRecord("templates", {
      name: entry.name,
      category: entry.category,
      description: entry.description,
      source_kind: "catalog",
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
  const built = buildBundleForTemplateRecord(lead, choice.record, site);
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
      assets: choice.record.asset_manifest || [],
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
 * Attempts a real send. When Outlook is not connected — or the lead has no
 * email address at all, which is the normal state of a freshly discovered
 * business — the draft is left in `ready` and the blocked reason is returned.
 * Nothing is marked as sent, and the automation loop does not count it as a
 * failure, because there is nothing wrong that retrying would fix.
 *
 * `to` overrides the lead's stored address for a one-off send.
 */
export async function sendDraft(draftId, { to } = {}) {
  const draft = findRecord("drafts", draftId);
  if (!draft) throw new Error("Draft not found.");
  const lead = leadById(draft.lead_id);
  const recipient = String(to || lead?.email || "").trim();

  if (!recipient) {
    const reason = `${lead?.business_name || "This lead"} has no email address, so nothing was sent. Add one on the lead, or send to an address directly.`;
    await updateRecord("drafts", draftId, { status: "ready", error_message: reason });
    return { sent: false, blocked: true, reason, provider: "outlook", needsRecipient: true };
  }

  try {
    const result = await sendEmail({ to: recipient, subject: draft.subject, body: draft.body });
    const sentAt = new Date().toISOString();
    const sent = await updateRecord("drafts", draftId, {
      status: "sent",
      sent_at: sentAt,
      external_message_id: result?.id || null,
      error_message: null,
    });
    if (lead) await markContacted(lead.id, sentAt);
    await recordOutboundEmail({ to: recipient, subject: draft.subject, body: draft.body, leadId: lead?.id || null });
    await logActivity("email_sent", "Outreach sent", `${lead?.business_name || recipient} · ${draft.subject}`, { lead_id: lead?.id });
    return { sent: true, draft: sent, to: recipient };
  } catch (error) {
    if (error instanceof NotConnectedError) {
      await updateRecord("drafts", draftId, { status: "ready", error_message: error.message });
      return { sent: false, blocked: true, reason: error.message, provider: error.provider };
    }
    await updateRecord("drafts", draftId, { status: "failed", error_message: error.message });
    throw error;
  }
}

/** Keeps a copy of everything that left the mailbox, so Inbox shows both sides. */
async function recordOutboundEmail({ to, subject, body, leadId = null }) {
  try {
    await createRecord("emails", {
      lead_id: leadId,
      direction: "outbound",
      sender: preferences().default_email || null,
      recipients: Array.isArray(to) ? to : [to],
      subject,
      body,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Could not record the outbound email", error);
  }
}

/**
 * Sends an email to any address, lead or not.
 *
 * The outreach path is deliberately narrow — a lead, a demo, the standard offer
 * — but plenty of real work is a one-off message to a supplier, a client, or
 * someone who has not been added to the pipeline at all. This is that path, and
 * it is the same transport, so it is subject to the same connection check.
 */
export async function sendDirectEmail({ to, cc, subject, body, leadId = null }) {
  const result = await sendEmail({ to, cc, subject, body });
  const recipients = Array.isArray(result?.to) && result.to.length ? result.to : [String(to)];
  await recordOutboundEmail({ to: recipients, subject, body, leadId });
  if (leadId) await markContacted(leadId);
  await logActivity(
    "email_sent",
    "Email sent",
    `${recipients.join(", ")} · ${subject}`,
    leadId ? { lead_id: leadId } : {},
  );
  return { sent: true, to: recipients, subject };
}

/** Replies inside an existing Outlook conversation and marks the thread read. */
export async function replyToThread(threadId, body) {
  const thread = findRecord("emailThreads", threadId);
  if (!thread) throw new Error("Thread not found.");
  if (!thread.external_thread_id) {
    throw new Error("This thread did not come from Outlook, so there is nothing to reply to.");
  }

  const message = data().emails
    .filter((email) => String(email.thread_id) === String(threadId) && email.direction === "inbound" && email.external_message_id)
    .sort((a, b) => new Date(b.received_at || b.created_at || 0) - new Date(a.received_at || a.created_at || 0))[0];
  if (!message) throw new Error("No Outlook message to reply to on this thread. Sync the inbox first.");

  await replyToMessage({ messageId: message.external_message_id, body });
  await updateRecord("emailThreads", threadId, { is_unread: false, last_message_at: new Date().toISOString() });
  await createRecord("emails", {
    thread_id: threadId,
    lead_id: thread.lead_id || null,
    direction: "outbound",
    recipients: [thread.sender_email].filter(Boolean),
    subject: `Re: ${thread.subject}`,
    body,
    status: "sent",
    sent_at: new Date().toISOString(),
  });
  await logActivity("email_sent", "Reply sent", `${thread.sender_email || thread.sender_name} · ${thread.subject}`, { lead_id: thread.lead_id });
  return { sent: true, thread_id: threadId };
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

/* ---------- lead records ---------- */

const LEAD_FIELDS = [
  "business_name", "contact_name", "email", "phone", "address", "city", "region",
  "postal_code", "country", "category", "website_url", "has_website", "notes",
  "deal_value", "asking_price", "lead_score", "priority", "tags",
];

function pickLeadFields(values = {}) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => LEAD_FIELDS.includes(key)));
}

/** Adds a lead by hand — the ones that arrive by referral, not by search. */
export async function createLead(values = {}) {
  const businessName = String(values.business_name || "").trim();
  if (!businessName) throw new Error("A lead needs a business name.");
  if (values.email && !isEmailAddress(values.email)) throw new Error(`"${values.email}" is not a valid email address.`);

  const existing = data().leads.find((lead) => (
    lead.business_name.toLowerCase() === businessName.toLowerCase()
    && String(lead.city || "").toLowerCase() === String(values.city || "").toLowerCase()
  ));
  if (existing) return { lead: existing, created: false };

  const lead = await createRecord("leads", {
    ...pickLeadFields(values),
    business_name: businessName,
    source: values.source || "manual",
    status: "new",
    discovered_at: new Date().toISOString(),
  });
  await logActivity("lead_saved", "Lead added", businessName, { lead_id: lead.id });
  return { lead, created: true };
}

/**
 * Edits a lead. Adding the email address is the single most common one — a
 * discovered business never comes with one, and without it nothing can be sent.
 */
export async function updateLead(leadId, patch = {}) {
  const lead = leadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (patch.email && !isEmailAddress(patch.email)) throw new Error(`"${patch.email}" is not a valid email address.`);

  const fields = pickLeadFields(patch);
  if (!Object.keys(fields).length) throw new Error("Nothing to update on this lead.");
  return updateRecord("leads", leadId, fields);
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

/* ---------- workspace records ---------- */

function futureDate(value, { fallbackDays = null } = {}) {
  if (value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    /* "3" or "3 days" reads as an offset, which is how these are usually said. */
    const days = Number(String(value).match(/-?\d+(\.\d+)?/)?.[0]);
    if (Number.isFinite(days)) {
      const due = new Date();
      due.setDate(due.getDate() + days);
      return due.toISOString();
    }
    throw new Error(`"${value}" is not a date this can understand.`);
  }
  if (fallbackDays === null) return null;
  const due = new Date();
  due.setDate(due.getDate() + fallbackDays);
  return due.toISOString();
}

const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];

export async function createTask({ title, description = "", priority = "normal", due_at: dueAt, lead_id: leadId = null, created_by: createdBy = "user" } = {}) {
  const value = String(title || "").trim();
  if (!value) throw new Error("A task needs a title.");
  return createRecord("tasks", {
    title: value,
    description,
    priority: TASK_PRIORITIES.includes(priority) ? priority : "normal",
    due_at: futureDate(dueAt),
    status: "pending",
    lead_id: leadId,
    created_by: createdBy,
  });
}

export async function completeTask(taskId) {
  const task = findRecord("tasks", taskId);
  if (!task) throw new Error("Task not found.");
  return updateRecord("tasks", taskId, { status: "completed" });
}

export async function createNote({ title, content = "", category = "general", lead_id: leadId = null, pinned = false } = {}) {
  const value = String(title || "").trim();
  if (!value) throw new Error("A note needs a title.");
  return createRecord("notes", {
    title: value,
    content: String(content || ""),
    category,
    lead_id: leadId,
    is_pinned: Boolean(pinned),
    is_archived: false,
  });
}

const EVENT_TYPES = ["follow_up", "call", "deadline", "launch", "maintenance", "task", "other"];

export async function createCalendarEvent({ title, starts_at: startsAt, event_type: eventType = "other", notes = "", lead_id: leadId = null } = {}) {
  const value = String(title || "").trim();
  if (!value) throw new Error("An event needs a title.");
  const start = futureDate(startsAt, { fallbackDays: 1 });
  return createRecord("calendarEvents", {
    title: value,
    event_type: EVENT_TYPES.includes(eventType) ? eventType : "other",
    starts_at: start,
    notes,
    lead_id: leadId,
    all_day: false,
  });
}

export async function recordPayment({ customer_name: customerName, amount, payment_type: paymentType = "website_sale", fee_amount: feeAmount = 0, status = "paid", client_id: clientId = null } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("A payment needs a positive amount.");
  const name = String(customerName || "").trim();
  if (!name) throw new Error("A payment needs a customer name.");
  const payment = await createRecord("payments", {
    customer_name: name,
    amount: value,
    fee_amount: Math.max(0, Number(feeAmount) || 0),
    payment_type: paymentType === "maintenance" ? "maintenance" : "website_sale",
    status: ["pending", "paid", "available", "failed", "refunded"].includes(status) ? status : "paid",
    source: "manual",
    client_id: clientId,
    paid_at: new Date().toISOString(),
  });
  await logActivity("payment_received", "Payment recorded", `${name} · ${value}`, { client_id: clientId });
  return payment;
}

const EXPENSE_CATEGORIES = ["hosting", "domains", "apis", "software", "payment_fees", "ai", "other"];

export async function recordExpense({ description, amount, category = "other", vendor = "" } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("An expense needs a positive amount.");
  const text = String(description || "").trim();
  if (!text) throw new Error("An expense needs a description.");
  return createRecord("expenses", {
    description: text,
    amount: value,
    category: EXPENSE_CATEGORIES.includes(category) ? category : "other",
    vendor,
    occurred_on: new Date().toISOString().slice(0, 10),
  });
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
