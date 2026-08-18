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

const OPEN_STATUSES = ["new", "ready_to_contact"];
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
 * first. Website presence is useful context for an automation agency, not an
 * exclusion rule; the optional discovery filter is the only place where a
 * no-website constraint belongs.
 */
export function getNextLead({ niche = "", location = "", skipIds = [] } = {}) {
  const skip = new Set(skipIds.map(String));
  const nicheValue = niche.trim().toLowerCase();
  const locationValue = location.trim().toLowerCase();

  const candidates = data().leads.filter((lead) => {
    if (skip.has(String(lead.id))) return false;
    if (!OPEN_STATUSES.includes(lead.status)) return false;
    if (hasBeenContacted(lead)) return false;
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
    if (lead.status === "new") await updateRecord("leads", lead.id, { status: "ready_to_contact", stage_entered_at: new Date().toISOString() });
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
    suggested_text: suggestion || `Check in about the AI receptionist workflow for ${lead.business_name}.`,
  });
  await updateRecord("leads", leadId, { follow_up_at: followUp.due_at });
  return followUp;
}

/* ---------- lead records ---------- */

const LEAD_FIELDS = [
  "business_name", "contact_name", "email", "phone", "address", "city", "region",
  "postal_code", "country", "category", "website_url", "has_website", "notes",
  "deal_value", "asking_price", "lead_score", "priority", "tags", "service_type",
  "assigned_team_member_id", "qualification_status", "opportunity_tags", "opportunity_summary",
  "objections", "pain_points", "current_tools", "quoted_setup_fee", "quoted_monthly_fee",
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
  const updated = await updateRecord("leads", leadId, {
    status,
    ...(lead.status === status ? {} : { stage_entered_at: new Date().toISOString() }),
  });
  await logActivity("pipeline_moved", "Pipeline updated", `${lead.business_name}: ${lead.status} → ${status}`, { lead_id: leadId });
  if (status === "won") await ensureClientForWonLead(updated);
  return updated;
}

export function getNextCallLead({ leadId = "", assigneeId = "" } = {}) {
  if (leadId) return leadById(leadId);
  const now = Date.now();
  return data().leads
    .filter((lead) => !CLOSED_STATUSES.includes(lead.status))
    .filter((lead) => !assigneeId || String(lead.assigned_team_member_id || "") === String(assigneeId))
    .sort((a, b) => {
      const aDue = a.follow_up_at ? new Date(a.follow_up_at).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.follow_up_at ? new Date(b.follow_up_at).getTime() : Number.POSITIVE_INFINITY;
      const aReady = aDue <= now ? 0 : 1;
      const bReady = bDue <= now ? 0 : 1;
      return aReady - bReady
        || aDue - bDue
        || Number(Boolean(b.phone)) - Number(Boolean(a.phone))
        || Number(a.calls_attempted || 0) - Number(b.calls_attempted || 0)
        || Number(b.lead_score || 0) - Number(a.lead_score || 0);
    })[0] || null;
}

export async function createMeeting(values = {}) {
  const lead = values.lead_id ? leadById(values.lead_id) : null;
  const title = String(values.title || (lead ? `Discovery meeting · ${lead.business_name}` : "Discovery meeting")).trim();
  const startsAt = new Date(values.starts_at || values.meeting_starts_at || "");
  if (!title) throw new Error("A meeting needs a title.");
  if (Number.isNaN(startsAt.getTime())) throw new Error("A meeting needs a valid start time.");

  const meeting = await createRecord("meetings", {
    title,
    lead_id: values.lead_id || null,
    client_id: values.client_id || null,
    salesperson_id: values.salesperson_id || null,
    starts_at: startsAt.toISOString(),
    ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null,
    outcome: values.outcome || "scheduled",
    attendees: Array.isArray(values.attendees) ? values.attendees : [],
    current_workflow: values.current_workflow || null,
    biggest_pain_point: values.biggest_pain_point || null,
    approximate_volume: values.approximate_volume || null,
    existing_crm: values.existing_crm || null,
    calendar_system: values.calendar_system || null,
    phone_provider: values.phone_provider || null,
    tools_used: Array.isArray(values.tools_used) ? values.tools_used : [],
    automation_proposed: values.automation_proposed || null,
    required_integrations: Array.isArray(values.required_integrations) ? values.required_integrations : [],
    implementation_complexity: values.implementation_complexity || null,
    quoted_setup_fee: values.quoted_setup_fee ?? null,
    quoted_monthly_fee: values.quoted_monthly_fee ?? null,
    usage_allowance: values.usage_allowance || null,
    decision_maker: values.decision_maker || null,
    notes: values.notes || null,
    next_action: values.next_action || null,
  });
  if (lead && !["won", "lost"].includes(lead.status)) {
    await updateRecord("leads", lead.id, {
      status: "meeting_scheduled",
      stage_entered_at: new Date().toISOString(),
      quoted_setup_fee: values.quoted_setup_fee ?? lead.quoted_setup_fee,
      quoted_monthly_fee: values.quoted_monthly_fee ?? lead.quoted_monthly_fee,
    });
  }
  await logActivity("meeting_scheduled", "Meeting scheduled", `${lead?.business_name || title} · ${startsAt.toLocaleString()}`, {
    lead_id: lead?.id || null,
    client_id: values.client_id || null,
    metadata: { meeting_id: meeting.id },
  });
  return meeting;
}

export async function recordSalesCall(leadId, values = {}) {
  const lead = leadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  const outcome = String(values.outcome || "");
  const allowed = ["no_answer", "voicemail", "gatekeeper", "wrong_number", "interested", "meeting_booked", "call_back_later", "not_interested", "already_has_solution", "unqualified"];
  if (!allowed.includes(outcome)) throw new Error("Choose a valid call outcome.");
  const calledAt = values.called_at ? new Date(values.called_at).toISOString() : new Date().toISOString();
  const nextFollowUpAt = values.next_follow_up_at ? new Date(values.next_follow_up_at).toISOString() : null;
  const call = await createRecord("salesCalls", {
    lead_id: leadId,
    salesperson_id: values.salesperson_id || lead.assigned_team_member_id || null,
    outcome,
    notes: values.notes || "",
    objection: values.objection || null,
    pain_point: values.pain_point || null,
    duration_seconds: Number(values.duration_seconds) || null,
    called_at: calledAt,
    next_follow_up_at: nextFollowUpAt,
  });

  const status = {
    interested: "interested",
    meeting_booked: "meeting_scheduled",
    call_back_later: "follow_up_later",
    wrong_number: "lost",
    not_interested: "lost",
    already_has_solution: "lost",
    unqualified: "lost",
  }[outcome] || "contacted";
  const qualificationStatus = outcome === "unqualified"
    ? "unqualified"
    : ["interested", "meeting_booked"].includes(outcome) ? "qualified" : lead.qualification_status === "unreviewed" ? "potential" : lead.qualification_status;
  const objections = [...new Set([...(lead.objections || []), values.objection].filter(Boolean))];
  const painPoints = [...new Set([...(lead.pain_points || []), values.pain_point].filter(Boolean))];
  await updateRecord("leads", leadId, {
    status,
    stage_entered_at: lead.status === status ? lead.stage_entered_at : calledAt,
    qualification_status: qualificationStatus,
    calls_attempted: Number(lead.calls_attempted || 0) + 1,
    last_contacted_at: calledAt,
    follow_up_at: nextFollowUpAt,
    objections,
    pain_points: painPoints,
  });

  if (nextFollowUpAt) {
    const sequence = data().followUps.filter((item) => String(item.lead_id) === String(leadId)).length + 1;
    await createRecord("followUps", {
      lead_id: leadId,
      sequence_number: Math.min(12, sequence),
      due_at: nextFollowUpAt,
      status: "scheduled",
      suggested_text: values.notes || `Follow up after ${outcome.replaceAll("_", " ")}.`,
    });
  }
  if (outcome === "meeting_booked" && values.meeting_starts_at) {
    await createMeeting({
      lead_id: leadId,
      salesperson_id: values.salesperson_id || lead.assigned_team_member_id || null,
      starts_at: values.meeting_starts_at,
      title: `Discovery meeting · ${lead.business_name}`,
    });
  }
  await logActivity("sales_call", "Call recorded", `${lead.business_name} · ${outcome.replaceAll("_", " ")}`, {
    lead_id: leadId,
    metadata: { call_id: call.id, outcome },
  });
  return call;
}

export async function ensureClientForWonLead(leadOrId) {
  const lead = typeof leadOrId === "object" ? leadOrId : leadById(leadOrId);
  if (!lead) throw new Error("Lead not found.");
  const existing = data().clients.find((client) => String(client.lead_id) === String(lead.id));
  if (existing) return existing;
  const setupFee = Number(lead.quoted_setup_fee ?? lead.deal_value ?? CONFIG.defaultSetupFee);
  const monthlyFee = Number(lead.quoted_monthly_fee ?? CONFIG.defaultMonthlyFee);
  const client = await createRecord("clients", {
    lead_id: lead.id,
    status: "onboarding",
    package_name: CONFIG.packageName,
    contact_name: lead.contact_name || "",
    email: lead.email || null,
    phone: lead.phone || null,
    agreed_price: setupFee,
    amount_received: 0,
    setup_fee: setupFee,
    monthly_fee: monthlyFee,
    payment_status: "pending",
    purchase_date: new Date().toISOString().slice(0, 10),
    primary_team_member_id: lead.assigned_team_member_id || null,
    onboarding_status: "not_started",
    onboarding_progress: 0,
    pricing: { setup_fee: setupFee, monthly_fee: monthlyFee },
  });
  await createRecord("onboardingRecords", {
    client_id: client.id,
    status: "not_started",
    progress: 0,
    business: { business_name: lead.business_name, service_type: lead.service_type || lead.category || "" },
    customer_handling: {},
    technical: { current_tools: lead.current_tools || {} },
    automation_goals: { pain_points: lead.pain_points || [], opportunity_tags: lead.opportunity_tags || [] },
  });
  await createRecord("projects", {
    client_id: client.id,
    owner_id: lead.assigned_team_member_id || null,
    name: `${lead.business_name} · AI receptionist`,
    status: "discovery",
    automation_type: "Unlimited AI receptionist / appointment booking",
    complexity: "standard",
    start_date: new Date().toISOString().slice(0, 10),
    progress: 0,
    requirements: { pain_points: lead.pain_points || [], opportunity_tags: lead.opportunity_tags || [] },
  });
  await logActivity("client_created", "Won lead converted", `${lead.business_name} · onboarding and project created`, {
    lead_id: lead.id,
    client_id: client.id,
  });
  return client;
}

export function commissionAmount(values = {}) {
  const revenue = Math.max(0, Number(values.collected_setup_revenue || 0));
  if (!revenue) return 0;
  return CONFIG.defaultCommission;
}

export async function syncCommissionForPayment(payment) {
  if (!payment) return null;
  let collectedSetup = 0;
  let client = null;
  if (payment.client_id) {
    client = findRecord("clients", payment.client_id);
    if (client) {
      collectedSetup = sum(data().payments.filter((item) => (
        String(item.client_id || "") === String(payment.client_id)
        && item.payment_type === "setup_fee"
        && ["paid", "available"].includes(item.status)
      )), (item) => item.amount);
      const contractedSetup = Number(client.setup_fee || client.agreed_price || 0);
      await updateRecord("clients", client.id, {
        amount_received: collectedSetup,
        payment_status: contractedSetup > 0 && collectedSetup >= contractedSetup ? "paid" : collectedSetup > 0 ? "partial" : "pending",
      });
    }
  }
  const existing = data().commissions.find((item) => String(item.payment_id) === String(payment.id));
  if (payment.status === "refunded") {
    const activationFee = Number(client?.setup_fee || client?.agreed_price || CONFIG.defaultSetupFee);
    const earned = data().commissions.find((item) => (
      String(item.client_id || "") === String(payment.client_id || "") && item.status !== "reversed"
    ));
    if (!earned || collectedSetup >= activationFee) return earned || null;
    return updateRecord("commissions", earned.id, { status: "reversed", reversed_at: new Date().toISOString() });
  }
  if (payment.payment_type !== "setup_fee" || !["paid", "available"].includes(payment.status) || !payment.client_id) return null;
  const activationFee = Number(client?.setup_fee || client?.agreed_price || CONFIG.defaultSetupFee);
  if (collectedSetup < activationFee) return null;
  const existingForClient = data().commissions.find((item) => (
    String(item.client_id || "") === String(payment.client_id) && item.status !== "reversed"
  ));
  if (existingForClient) return existingForClient;
  const lead = client?.lead_id ? leadById(client.lead_id) : null;
  const salesperson = data().teamMembers.find((item) => String(item.id) === String(lead?.assigned_team_member_id || client?.primary_team_member_id || ""));
  const commission = await createRecord("commissions", {
    salesperson_id: salesperson?.id || null,
    client_id: payment.client_id,
    lead_id: lead?.id || null,
    payment_id: payment.id,
    collected_setup_revenue: collectedSetup,
    commission_rate: CONFIG.defaultCommission / CONFIG.defaultSetupFee,
    commission_min: CONFIG.defaultCommission,
    commission_max: CONFIG.defaultCommission,
    status: "earned",
    earned_at: payment.paid_at || new Date().toISOString(),
  });
  await logActivity("commission_earned", "Commission earned", `${salesperson?.full_name || "Unassigned salesperson"} · ${commissionAmount(commission)}`, {
    lead_id: lead?.id || null,
    client_id: payment.client_id,
    metadata: { commission_id: commission.id, payment_id: payment.id },
  });
  return commission;
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
    price_objection: "negotiating",
    maybe: "interested",
    follow_up_later: "follow_up_later",
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

export async function createTask({
  title,
  description = "",
  priority = "normal",
  due_at: dueAt,
  lead_id: leadId = null,
  client_id: clientId = null,
  project_id: projectId = null,
  automation_id: automationId = null,
  created_by: createdBy = "user",
} = {}) {
  const value = String(title || "").trim();
  if (!value) throw new Error("A task needs a title.");
  return createRecord("tasks", {
    title: value,
    description,
    priority: TASK_PRIORITIES.includes(priority) ? priority : "normal",
    due_at: futureDate(dueAt),
    status: "pending",
    lead_id: leadId,
    client_id: clientId,
    project_id: projectId,
    automation_id: automationId,
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

export async function recordPayment({ customer_name: customerName, amount, payment_type: paymentType = "setup_fee", fee_amount: feeAmount = 0, status = "paid", client_id: clientId = null, project_id: projectId = null, due_date: dueDate = null } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("A payment needs a positive amount.");
  const name = String(customerName || "").trim();
  if (!name) throw new Error("A payment needs a customer name.");
  const payment = await createRecord("payments", {
    customer_name: name,
    amount: value,
    fee_amount: Math.max(0, Number(feeAmount) || 0),
    payment_type: ["setup_fee", "recurring_subscription", "usage_overage", "custom_invoice", "refund", "website_sale", "maintenance"].includes(paymentType) ? paymentType : "setup_fee",
    status: ["pending", "paid", "available", "overdue", "failed", "refunded"].includes(status) ? status : "paid",
    source: "manual",
    client_id: clientId,
    project_id: projectId,
    due_date: dueDate,
    paid_at: ["paid", "available", "refunded"].includes(status) ? new Date().toISOString() : null,
  });
  await logActivity("payment_received", "Payment recorded", `${name} · ${value}`, { client_id: clientId });
  await syncCommissionForPayment(payment);
  return payment;
}

const EXPENSE_CATEGORIES = ["hosting", "domains", "apis", "software", "payment_fees", "ai", "other"];

export async function recordExpense({
  description,
  amount,
  category = "other",
  vendor = "",
  client_id: clientId = null,
  project_id: projectId = null,
  automation_id: automationId = null,
  cost_scope: costScope = "overhead",
  recurring = false,
} = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("An expense needs a positive amount.");
  const text = String(description || "").trim();
  if (!text) throw new Error("An expense needs a description.");
  return createRecord("expenses", {
    description: text,
    amount: value,
    category: EXPENSE_CATEGORIES.includes(category) ? category : "other",
    vendor,
    client_id: clientId,
    project_id: projectId,
    automation_id: automationId,
    cost_scope: clientId ? "client" : (["overhead", "client"].includes(costScope) ? costScope : "overhead"),
    recurring: Boolean(recurring),
    occurred_on: new Date().toISOString().slice(0, 10),
  });
}

/* ---------- read models ---------- */

export function getClients({ status = "" } = {}) {
  return data().clients.filter((client) => !status || client.status === status);
}

const CLIENT_LIFECYCLE_STAGES = Object.freeze([
  ["lead", "Lead"],
  ["demo", "Demo / call"],
  ["closed", "Closed"],
  ["payment", "Payment"],
  ["onboarding", "Onboarding"],
  ["agent", "Agent setup"],
  ["deployment", "Deployment"],
  ["service", "Ongoing service"],
]);

/**
 * A client lifecycle is calculated from records that already exist. Nobody has
 * to maintain a second status board: payment receipts, onboarding, provider
 * agents, deployments, and subscriptions move this view automatically.
 */
export function clientLifecycle(client, workspace = data()) {
  if (!client) return null;
  const same = (left, right) => String(left || "") === String(right || "");
  const records = (key) => Array.isArray(workspace[key]) ? workspace[key] : [];
  const lead = records("leads").find((item) => same(item.id, client.lead_id)) || null;
  const salesCalls = records("salesCalls").filter((item) => same(item.lead_id, lead?.id));
  const meetings = records("meetings").filter((item) => same(item.lead_id, lead?.id) || same(item.client_id, client.id));
  const demos = records("demos").filter((item) => same(item.lead_id, lead?.id));
  const onboarding = records("onboardingRecords").find((item) => same(item.client_id, client.id)) || null;
  const project = records("projects").find((item) => same(item.client_id, client.id)) || null;
  const automation = records("automations").find((item) => same(item.client_id, client.id)) || null;
  const agent = records("voiceAgents").find((item) => (
    same(item.client_id, client.id) && item.provider_deleted_at == null && item.status !== "archived"
  )) || null;
  const deployment = records("deployments").find((item) => same(item.client_id, client.id)) || null;
  const subscription = records("maintenanceSubscriptions").find((item) => same(item.client_id, client.id)) || null;
  const paidSetup = sum(records("payments").filter((item) => (
    same(item.client_id, client.id)
    && item.payment_type === "setup_fee"
    && ["paid", "available"].includes(item.status)
  )), (item) => item.amount);
  const setupFee = Math.max(0, Number(client.setup_fee || client.agreed_price || 0));
  const amountReceived = Math.max(Number(client.amount_received || 0), paidSetup);
  const paymentComplete = setupFee <= 0 || amountReceived >= setupFee || client.payment_status === "paid";
  const onboardingComplete = onboarding?.status === "complete" || client.onboarding_status === "complete";
  const agentReady = Boolean(agent?.provider_agent_id && !agent.last_error && agent.status !== "error");
  const deploymentComplete = deployment?.status === "production"
    || automation?.status === "live"
    || project?.deployment_status === "production";
  const serviceActive = subscription?.status === "active"
    || (deploymentComplete && ["active", "maintenance", "completed"].includes(client.status));

  const evidence = {
    lead: Boolean(lead),
    demo: Boolean(salesCalls.length || meetings.length || demos.length),
    closed: true,
    payment: paymentComplete,
    onboarding: onboardingComplete,
    agent: agentReady,
    deployment: deploymentComplete,
    service: serviceActive,
  };
  const stages = CLIENT_LIFECYCLE_STAGES.map(([id, label]) => ({ id, label, complete: evidence[id] }));

  let currentStage = "service";
  let nextAction = "Review client health and the latest call records";
  let action = { label: "Open client", action: "client-open", attrs: `data-id="${client.id}"` };
  let tone = "green";

  if (!paymentComplete) {
    const balance = Math.max(0, setupFee - amountReceived);
    currentStage = "payment";
    nextAction = balance ? `Collect ${balance.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} activation balance` : "Confirm the activation payment";
    action = { label: "Record payment", action: "payment-new", attrs: `data-client-id="${client.id}"` };
    tone = "amber";
  } else if (!onboardingComplete) {
    currentStage = "onboarding";
    nextAction = onboarding?.status === "blocked"
      ? "Unblock onboarding with the client"
      : `${onboarding ? "Finish" : "Start"} the client rulebook and call flow`;
    action = {
      label: onboarding ? "Continue onboarding" : "Start onboarding",
      action: "onboarding-open",
      attrs: `data-client-id="${client.id}"${onboarding ? ` data-id="${onboarding.id}"` : ""}`,
    };
    tone = onboarding?.status === "blocked" ? "red" : "amber";
  } else if (!agentReady) {
    currentStage = "agent";
    nextAction = agent?.last_error ? "Resolve the ElevenLabs agent error" : agent ? "Finish and verify the ElevenLabs agent" : "Create the ElevenLabs agent";
    action = agent
      ? { label: "Configure agent", action: "voice-agent-open", attrs: `data-id="${agent.id}"` }
      : { label: "Create agent", action: "voice-agent-new", attrs: `data-client-id="${client.id}"` };
    tone = agent?.last_error ? "red" : "amber";
  } else if (!deploymentComplete) {
    currentStage = "deployment";
    nextAction = "Finish testing, phone routing, and the real end-to-end call";
    action = project
      ? { label: "Open delivery", action: "project-open", attrs: `data-id="${project.id}"` }
      : { label: "Open client", action: "client-open", attrs: `data-id="${client.id}"` };
    tone = deployment?.status === "failed" || automation?.last_error ? "red" : "amber";
  } else if (!serviceActive) {
    currentStage = "service";
    nextAction = "Activate the ongoing monthly service";
    action = subscription
      ? { label: "Review service", action: "subscription-open", attrs: `data-id="${subscription.id}"` }
      : { label: "Start service", action: "subscription-new", attrs: `data-client-id="${client.id}"` };
    tone = subscription?.status === "past_due" ? "red" : "amber";
  }

  const deliveryComplete = [paymentComplete, onboardingComplete, agentReady, deploymentComplete, serviceActive].filter(Boolean).length;
  return {
    client,
    lead,
    onboarding,
    project,
    automation,
    agent,
    deployment,
    subscription,
    stages,
    currentStage,
    currentLabel: CLIENT_LIFECYCLE_STAGES.find(([id]) => id === currentStage)?.[1] || "Client",
    nextAction,
    action,
    tone,
    progress: Math.round((deliveryComplete / 5) * 100),
    setupFee,
    amountReceived,
    setupBalance: Math.max(0, setupFee - amountReceived),
    paymentComplete,
    onboardingComplete,
    agentReady,
    deploymentComplete,
    serviceActive,
    conversations: records("voiceConversations").filter((item) => same(item.client_id, client.id)),
  };
}

export function clientLifecycleRows(workspace = data()) {
  return (Array.isArray(workspace.clients) ? workspace.clients : [])
    .map((client) => clientLifecycle(client, workspace))
    .filter(Boolean)
    .sort((left, right) => (
      Number(left.serviceActive) - Number(right.serviceActive)
      || Number(right.tone === "red") - Number(left.tone === "red")
      || String(left.lead?.business_name || "").localeCompare(String(right.lead?.business_name || ""))
    ));
}

export function getPayments({ range = "all" } = {}) {
  const paid = data().payments
    .filter((payment) => ["paid", "available"].includes(payment.status))
    .map((payment) => payment.payment_type === "refund" ? { ...payment, amount: -Math.abs(Number(payment.amount || 0)) } : payment);
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

/** Compact agency metrics used by Home and the assistant. */
export function agencySummary() {
  const workspace = data();
  const paid = getPayments();
  const paidThisMonth = getPayments({ range: "month" });
  const activeSubscriptions = workspace.maintenanceSubscriptions.filter((item) => item.status === "active");
  const openStages = new Set(PIPELINE_STAGES.map((stage) => stage.id).filter((stage) => !["won", "lost"].includes(stage)));
  const closedLeads = workspace.leads.filter((lead) => ["won", "lost"].includes(lead.status));
  const wonLeads = workspace.leads.filter((lead) => lead.status === "won");
  const monthCosts = sum(
    workspace.expenses.filter((expense) => isSameMonth(expense.occurred_on || expense.created_at)),
    (expense) => expense.amount,
  ) + sum(
    workspace.aiUsage.filter((usage) => isSameMonth(usage.occurred_at || usage.created_at)),
    (usage) => usage.cost,
  );
  const monthRevenue = sum(paidThisMonth, (payment) => payment.amount);
  const automationAttention = workspace.automations.filter((item) => item.last_error || ["failed", "offline"].includes(item.status));
  const outstandingPayments = workspace.payments.filter((payment) => ["pending", "overdue", "failed"].includes(payment.status));
  const scheduledMeetings = workspace.meetings.filter((meeting) => (
    new Date(meeting.starts_at).getTime() >= Date.now()
    && !["cancelled", "lost"].includes(meeting.outcome)
  ));

  return {
    totalRevenue: sum(paid, (payment) => payment.amount),
    monthlyRecurringRevenue: sum(activeSubscriptions, (item) => item.monthly_amount),
    setupRevenueThisMonth: sum(paidThisMonth.filter((payment) => payment.payment_type === "setup_fee"), (payment) => payment.amount),
    activeClients: workspace.clients.filter((client) => client.status === "active").length,
    automationsLive: workspace.automations.filter((item) => item.status === "live").length,
    automationsRequiringAttention: automationAttention.length,
    leadsInPipeline: workspace.leads.filter((lead) => openStages.has(lead.status)).length,
    meetingsScheduled: scheduledMeetings.length,
    dealsWon: wonLeads.length,
    dealsWonThisMonth: wonLeads.filter((lead) => isSameMonth(lead.stage_entered_at || lead.updated_at)).length,
    salesConversionRate: closedLeads.length ? (wonLeads.length / closedLeads.length) * 100 : 0,
    upcomingTasks: getTasks({ view: "open" }).filter((task) => task.due_at && new Date(task.due_at).getTime() >= Date.now()).length,
    outstandingPayments: sum(outstandingPayments, (payment) => payment.amount),
    usageCostsThisMonth: monthCosts,
    estimatedGrossMargin: monthRevenue ? ((monthRevenue - monthCosts) / monthRevenue) * 100 : null,
  };
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

  const automationErrors = data().automations.filter((item) => item.last_error);
  if (automationErrors.length) {
    items.push({
      id: "automation-record-errors",
      weight: 0,
      tone: "red",
      iconName: "alert",
      title: `${automationErrors.length} client automation${automationErrors.length === 1 ? "" : "s"} reporting errors`,
      detail: automationErrors.slice(0, 3).map((item) => item.name).join(", "),
      route: "automation-studio",
      params: { status: "all" },
    });
  }

  const overduePayments = data().payments.filter((payment) => payment.status === "overdue");
  if (overduePayments.length) {
    items.push({
      id: "overdue-payments",
      weight: 1,
      tone: "amber",
      iconName: "dollar",
      title: `${overduePayments.length} overdue payment${overduePayments.length === 1 ? "" : "s"}`,
      detail: `${sum(overduePayments, (payment) => payment.amount)} outstanding`,
      route: "payments",
    });
  }

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
      detail: failed.map((item) => item.version || item.domain || "Automation deployment").join(", "),
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
      route: "automation-studio",
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
