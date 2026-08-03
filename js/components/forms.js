/* Modal forms and detail views. One pattern, no nested cards. */
import { CONFIG, PIPELINE_STAGES, PROJECT_STAGES, REPLY_CLASSIFICATIONS } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, isSameMonth, relativeTime, statusLabel } from "../core/utils.js";
import {
  btn,
  checkbox,
  externalLink,
  field,
  input,
  notice,
  openModal,
  pill,
  row,
  rows,
  score,
  select,
  textarea,
} from "./ui.js";
import { outlookBlocker } from "../services/integrations.js";

function localDateTime(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function localDate(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function footer(formId, label = "Save", extra = "") {
  return `${extra}${btn("Cancel", { action: "close-modal", variant: "quiet" })}<button class="btn btn--primary" type="submit" form="${formId}">${escapeHtml(label)}</button>`;
}

function leadOptions(leads) {
  return leads.map((lead) => ({ value: lead.id, label: lead.business_name }));
}

function clientOptions(data) {
  return data.clients.map((client) => ({
    value: client.id,
    label: data.leads.find((lead) => lead.id === client.lead_id)?.business_name || "Client",
  }));
}

function memberOptions(data) {
  return data.teamMembers
    .filter((member) => member.status !== "inactive")
    .map((member) => ({ value: member.id, label: `${member.full_name} · ${statusLabel(member.role)}` }));
}

/* ---------- leads ---------- */

export function openLeadForm(lead = null) {
  const { data } = getState();
  openModal({
    title: lead ? "Edit lead" : "Add lead",
    wide: true,
    body: `
      <form id="lead-form" data-form="lead"${lead ? ` data-id="${lead.id}"` : ""}>
        <div class="field-grid">
          ${field("Business name", input("business_name", lead?.business_name || "", { required: true }))}
          ${field("Owner / contact", input("contact_name", lead?.contact_name || ""))}
          ${field("Email", input("email", lead?.email || "", { type: "email" }))}
          ${field("Phone", input("phone", lead?.phone || ""))}
          ${field("Niche", input("category", lead?.category || "", { placeholder: "Tree Service" }))}
          ${field("Service type", input("service_type", lead?.service_type || lead?.category || ""))}
          ${field("City", input("city", lead?.city || ""))}
          ${field("State", input("region", lead?.region || ""))}
          ${field("Stage", select("status", PIPELINE_STAGES.map((stage) => ({ value: stage.id, label: stage.label })), lead?.status || "new"))}
          ${field("Qualification", select("qualification_status", ["unreviewed", "potential", "qualified", "unqualified"].map((value) => ({ value, label: statusLabel(value) })), lead?.qualification_status || "unreviewed"))}
          ${field("Salesperson", select("assigned_team_member_id", memberOptions(data), lead?.assigned_team_member_id || "", { placeholder: "Unassigned" }))}
          ${field("Fit score", input("lead_score", lead?.lead_score ?? 80, { type: "number", attrs: 'min="0" max="100"' }))}
          ${field("Activation value", input("deal_value", lead?.deal_value ?? CONFIG.defaultSetupFee, { type: "number", attrs: 'min="0" step="50"' }))}
          ${field("Activation fee", input("quoted_setup_fee", lead?.quoted_setup_fee ?? CONFIG.defaultSetupFee, { type: "number", attrs: 'min="0" step="50"' }))}
          ${field("Monthly service", input("quoted_monthly_fee", lead?.quoted_monthly_fee ?? CONFIG.defaultMonthlyFee, { type: "number", attrs: 'min="0" step="1"' }))}
        </div>
        ${field("Address", input("address", lead?.address || ""))}
        ${field("Opportunity tags", input("opportunity_tags", (lead?.opportunity_tags || []).join(", "), { placeholder: "missed_call, booking, lead_follow_up" }), { hint: "comma separated; inferred tags must be verified during outreach" })}
        <div class="field-grid">
          ${field("Pain points", textarea("pain_points", (lead?.pain_points || []).join("\n"), { attrs: 'rows="3"' }), { hint: "one per line" })}
          ${field("Objections", textarea("objections", (lead?.objections || []).join("\n"), { attrs: 'rows="3"' }), { hint: "one per line" })}
        </div>
        ${field("Notes", textarea("notes", lead?.notes || "", { attrs: 'rows="3"' }))}
        ${checkbox("has_website", "This business already has a real website", Boolean(lead?.has_website))}
      </form>
    `,
    footer: footer("lead-form", lead ? "Save lead" : "Add lead", lead
      ? btn("Delete", { action: "lead-delete", variant: "danger", attrs: `data-id="${lead.id}"` })
      : ""),
  });
}

/* ---------- agency workflow ---------- */

export function openMeetingForm(meeting = null, presetLeadId = "") {
  const { data } = getState();
  openModal({
    title: meeting ? "Meeting details" : "New meeting",
    wide: true,
    body: `<form id="meeting-form" data-form="meeting"${meeting ? ` data-id="${meeting.id}"` : ""}>
      <div class="field-grid">
        ${field("Title", input("title", meeting?.title || "Discovery meeting", { required: true }))}
        ${field("Lead", select("lead_id", leadOptions(data.leads), meeting?.lead_id || presetLeadId, { placeholder: "Not linked to a lead" }))}
        ${field("Client", select("client_id", clientOptions(data), meeting?.client_id || "", { placeholder: "Not linked to a client" }))}
        ${field("Salesperson", select("salesperson_id", memberOptions(data), meeting?.salesperson_id || "", { placeholder: "Unassigned" }))}
        ${field("Starts", input("starts_at", localDateTime(meeting?.starts_at || new Date(Date.now() + 86_400_000)), { type: "datetime-local", required: true }))}
        ${field("Ends", input("ends_at", meeting?.ends_at ? localDateTime(meeting.ends_at) : "", { type: "datetime-local" }))}
        ${field("Outcome", select("outcome", ["scheduled", "proposal_needed", "follow_up", "won", "lost", "technical_discovery_required", "cancelled"].map((value) => ({ value, label: statusLabel(value) })), meeting?.outcome || "scheduled"))}
        ${field("Complexity", select("implementation_complexity", ["low", "medium", "high", "custom"].map((value) => ({ value, label: statusLabel(value) })), meeting?.implementation_complexity || "", { placeholder: "Not assessed" }))}
        ${field("Activation fee", input("quoted_setup_fee", meeting?.quoted_setup_fee ?? CONFIG.defaultSetupFee, { type: "number", attrs: 'min="0" step="50"' }))}
        ${field("Monthly service", input("quoted_monthly_fee", meeting?.quoted_monthly_fee ?? CONFIG.defaultMonthlyFee, { type: "number", attrs: 'min="0" step="1"' }))}
      </div>
      <div class="field-grid">
        ${field("Current workflow", textarea("current_workflow", meeting?.current_workflow || "", { attrs: 'rows="3"' }))}
        ${field("Biggest pain point", textarea("biggest_pain_point", meeting?.biggest_pain_point || "", { attrs: 'rows="3"' }))}
        ${field("Approximate lead / call volume", input("approximate_volume", meeting?.approximate_volume || ""))}
        ${field("Decision maker", input("decision_maker", meeting?.decision_maker || ""))}
        ${field("CRM", input("existing_crm", meeting?.existing_crm || ""))}
        ${field("Calendar", input("calendar_system", meeting?.calendar_system || ""))}
        ${field("Phone provider", input("phone_provider", meeting?.phone_provider || ""))}
        ${field("Usage allowance", input("usage_allowance", meeting?.usage_allowance || ""))}
      </div>
      ${field("Automation proposed", textarea("automation_proposed", meeting?.automation_proposed || "", { attrs: 'rows="3"' }))}
      <div class="field-grid">
        ${field("Tools used", textarea("tools_used", (meeting?.tools_used || []).join("\n"), { attrs: 'rows="3"' }), { hint: "one per line" })}
        ${field("Required integrations", textarea("required_integrations", (meeting?.required_integrations || []).join("\n"), { attrs: 'rows="3"' }), { hint: "one per line" })}
      </div>
      ${field("Meeting notes", textarea("notes", meeting?.notes || "", { attrs: 'rows="5"' }))}
      ${field("Next action", input("next_action", meeting?.next_action || ""))}
    </form>`,
    footer: footer("meeting-form", meeting ? "Save meeting" : "Create meeting"),
  });
}

export function openOnboardingForm(record, client) {
  const business = record?.business || {};
  const handling = record?.customer_handling || {};
  const technical = record?.technical || {};
  const goals = record?.automation_goals || {};
  openModal({
    title: "Client onboarding",
    subtitle: client?.contact_name || client?.email || "Structured workflow discovery",
    wide: true,
    body: `<form id="onboarding-form" data-form="onboarding" data-client-id="${client.id}"${record ? ` data-id="${record.id}"` : ""}>
      <div class="field-grid">
        ${field("Status", select("status", ["not_started", "in_progress", "blocked", "complete"].map((value) => ({ value, label: statusLabel(value) })), record?.status || "not_started"))}
        ${field("Progress", input("progress", record?.progress ?? 0, { type: "number", attrs: 'min="0" max="100"' }))}
      </div>
      <h3>Business</h3>
      <div class="field-grid">
        ${field("Services", textarea("business_services", (business.services || []).join("\n"), { attrs: 'rows="3"' }), { hint: "one per line" })}
        ${field("Service area", textarea("business_service_area", (business.service_area || []).join("\n"), { attrs: 'rows="3"' }))}
        ${field("Hours", textarea("business_hours", business.hours || "", { attrs: 'rows="3"' }))}
        ${field("Locations / staff", textarea("business_staff", business.staff || "", { attrs: 'rows="3"' }))}
      </div>
      <h3>Customer handling</h3>
      <div class="field-grid">
        ${field("Common questions", textarea("handling_common_questions", (handling.common_questions || []).join("\n"), { attrs: 'rows="4"' }))}
        ${field("Qualification criteria", textarea("handling_qualification", (handling.qualification_criteria || []).join("\n"), { attrs: 'rows="4"' }))}
        ${field("Allowed guidance", textarea("handling_allowed", (handling.allowed_guidance || []).join("\n"), { attrs: 'rows="4"' }))}
        ${field("Never say / do", textarea("handling_forbidden", (handling.forbidden_behavior || []).join("\n"), { attrs: 'rows="4"' }))}
        ${field("Escalation and emergency rules", textarea("handling_escalation", handling.escalation_rules || "", { attrs: 'rows="4"' }))}
        ${field("Booking / cancellation / refund rules", textarea("handling_appointment_rules", handling.appointment_rules || "", { attrs: 'rows="4"' }))}
      </div>
      <h3>Technical</h3>
      <div class="field-grid">
        ${field("Phone system", input("technical_phone", technical.phone_system || ""))}
        ${field("CRM", input("technical_crm", technical.crm || ""))}
        ${field("Calendar", input("technical_calendar", technical.calendar || ""))}
        ${field("Email / SMS", input("technical_messaging", technical.messaging || ""))}
        ${field("Website / internal tools", textarea("technical_tools", technical.tools || "", { attrs: 'rows="3"' }))}
      </div>
      <h3>Automation goals</h3>
      <div class="field-grid">
        ${field("Current problem", textarea("goals_problem", goals.current_problem || "", { attrs: 'rows="3"' }))}
        ${field("Desired outcome", textarea("goals_outcome", goals.desired_outcome || "", { attrs: 'rows="3"' }))}
        ${field("Current workflow", textarea("goals_current_workflow", goals.current_workflow || "", { attrs: 'rows="4"' }))}
        ${field("Proposed workflow", textarea("goals_proposed_workflow", goals.proposed_workflow || "", { attrs: 'rows="4"' }))}
        ${field("Success metric", input("goals_success_metric", goals.success_metric || ""))}
      </div>
    </form>`,
    footer: footer("onboarding-form", "Save onboarding"),
  });
}

export function openAutomationRecordForm(automation = null) {
  const { data } = getState();
  openModal({
    title: automation ? "Automation configuration" : "New automation",
    wide: true,
    body: `<form id="automation-record-form" data-form="automation-record"${automation ? ` data-id="${automation.id}"` : ""}>
      <div class="field-grid">
        ${field("Name", input("name", automation?.name || "", { required: true }))}
        ${field("Client", select("client_id", clientOptions(data), automation?.client_id || "", { placeholder: "Select a client", required: true }))}
        ${field("Type", input("automation_type", automation?.automation_type || "voice agent", { required: true }), { hint: "extensible, e.g. voice agent, chatbot, workflow" })}
        ${field("Provider", input("provider", automation?.provider || "", { placeholder: "Retell, Vapi, n8n…" }))}
        ${field("Status", select("status", ["designing", "building", "testing", "limited_launch", "live", "maintenance", "paused", "archived"].map((value) => ({ value, label: statusLabel(value) })), automation?.status || "designing"))}
        ${field("Environment", select("environment", ["development", "staging", "production"].map((value) => ({ value, label: statusLabel(value) })), automation?.environment || "development"))}
        ${field("Development version", input("development_version", automation?.development_version || ""))}
        ${field("Deployed version", input("deployed_version", automation?.deployed_version || ""))}
      </div>
      ${field("System / rulebook prompt", textarea("system_prompt", automation?.system_prompt || "", { attrs: 'rows="8"' }))}
      <div class="field-grid">
        ${field("Configuration", textarea("configuration", JSON.stringify(automation?.configuration || {}, null, 2), { attrs: 'rows="8"' }), { hint: "JSON metadata only; never paste credentials" })}
        ${field("Escalation behavior", textarea("escalation_behavior", JSON.stringify(automation?.escalation_behavior || {}, null, 2), { attrs: 'rows="8"' }), { hint: "JSON rules and destinations without secrets" })}
      </div>
    </form>`,
    footer: footer("automation-record-form", "Save automation"),
  });
}

export function openSubscriptionForm(subscription = null) {
  const { data } = getState();
  openModal({
    title: subscription ? "Edit subscription" : "Add subscription",
    body: `<form id="subscription-form" data-form="subscription"${subscription ? ` data-id="${subscription.id}"` : ""}>
      ${field("Client", select("client_id", clientOptions(data), subscription?.client_id || "", { placeholder: "Select a client", required: true }))}
      <div class="field-grid">
        ${field("Plan", input("plan_name", subscription?.plan_name || CONFIG.packageName))}
        ${field("Monthly amount", input("monthly_amount", subscription?.monthly_amount ?? CONFIG.defaultMonthlyFee, { type: "number", attrs: 'min="0" step="0.01"' }))}
        ${field("Status", select("status", ["active", "inactive", "past_due", "cancelled"].map((value) => ({ value, label: statusLabel(value) })), subscription?.status || "active"))}
        ${field("Next payment", input("next_charge_on", subscription?.next_charge_on || localDate(new Date(Date.now() + 30 * 86_400_000)), { type: "date" }))}
        ${field("Billing day", input("billing_day", subscription?.billing_day ?? "", { type: "number", attrs: 'min="1" max="28"' }))}
        ${field("Included usage", input("included_usage", subscription?.included_usage ?? "", { type: "number", attrs: 'min="0" step="0.01"' }))}
        ${field("Usage unit", input("usage_unit", subscription?.usage_unit || "minutes"))}
        ${field("Overage rate", input("overage_rate", subscription?.overage_rate ?? "", { type: "number", attrs: 'min="0" step="0.0001"' }))}
        ${field("Cancellation", select("cancellation_status", ["none", "requested", "scheduled", "cancelled"].map((value) => ({ value, label: statusLabel(value) })), subscription?.cancellation_status || "none"))}
      </div>
    </form>`,
    footer: footer("subscription-form", "Save subscription"),
  });
}

export function openTeamMemberForm(member = null) {
  openModal({
    title: member ? "Edit team member" : "Add team member",
    body: `<form id="team-member-form" data-form="team-member"${member ? ` data-id="${member.id}"` : ""}>
      <div class="field-grid">
        ${field("Name", input("full_name", member?.full_name || "", { required: true }))}
        ${field("Cloudflare Access email", input("access_email", member?.access_email || "", { type: "email" }), { hint: "identity mapping is activated only after Worker permission tests" })}
        ${field("Role", select("role", ["owner", "admin", "salesperson", "sales_manager", "account_manager", "automation_engineer", "support"].map((value) => ({ value, label: statusLabel(value) })), member?.role || "salesperson"))}
        ${field("Status", select("status", ["active", "inactive"].map((value) => ({ value, label: statusLabel(value) })), member?.status || "active"))}
        ${field("Activation commission", input("commission_display", formatCurrency(CONFIG.defaultCommission), { attrs: "disabled" }), { hint: "earned when the client's activation payment is collected" })}
      </div>
    </form>`,
    footer: footer("team-member-form", "Save team member"),
  });
}

export function openCommissionForm(commission) {
  openModal({
    title: "Update commission",
    body: `<form id="commission-form" data-form="commission" data-id="${commission.id}">
      <dl class="detail-list">
        <div><dt>Activation revenue collected</dt><dd>${formatCurrency(commission.collected_setup_revenue)}</dd></div>
        <div><dt>Calculated commission</dt><dd>${formatCurrency(commission.calculated_commission || 0)}</dd></div>
      </dl>
      ${field("Status", select("status", ["pending", "earned", "paid", "reversed"].map((value) => ({ value, label: statusLabel(value) })), commission.status))}
      ${field("Notes", textarea("notes", commission.notes || "", { attrs: 'rows="3"' }))}
    </form>`,
    footer: footer("commission-form", "Save commission"),
  });
}

export function openLeadDetails(lead) {
  const { data } = getState();
  const member = data.teamMembers.find((item) => String(item.id) === String(lead.assigned_team_member_id));
  const source = lead.source_metadata?.openscout || {};
  const events = [
    {
      id: `import-${lead.id}`,
      at: lead.discovered_at || lead.created_at,
      title: "Lead imported",
      detail: lead.source || "Manual entry",
      iconName: "building",
    },
    ...data.salesCalls.filter((item) => String(item.lead_id) === String(lead.id)).map((call) => ({
      id: `call-${call.id}`,
      at: call.called_at || call.created_at,
      title: `Call · ${statusLabel(call.outcome)}`,
      detail: [call.notes, call.objection ? `Objection: ${call.objection}` : "", call.pain_point ? `Pain: ${call.pain_point}` : ""].filter(Boolean).join(" · "),
      iconName: "phone",
    })),
    ...data.meetings.filter((item) => String(item.lead_id) === String(lead.id)).map((meeting) => ({
      id: `meeting-${meeting.id}`,
      at: meeting.starts_at || meeting.created_at,
      title: meeting.title || "Meeting",
      detail: [statusLabel(meeting.outcome), meeting.next_action].filter(Boolean).join(" · "),
      iconName: "calendar",
    })),
    ...data.emailThreads.filter((item) => String(item.lead_id) === String(lead.id)).map((thread) => ({
      id: `thread-${thread.id}`,
      at: thread.last_message_at || thread.created_at,
      title: thread.subject || "Email reply",
      detail: statusLabel(thread.classification || "reply"),
      iconName: "mail",
    })),
    ...data.activity.filter((item) => String(item.lead_id || "") === String(lead.id)).map((item) => ({
      id: `activity-${item.id}`,
      at: item.created_at,
      title: item.title,
      detail: item.detail,
      iconName: item.type?.includes("pipeline") ? "columns" : "activity",
    })),
  ].filter((item) => item.at).sort((a, b) => new Date(b.at) - new Date(a.at));
  const opportunity = (lead.opportunity_tags || []).map(statusLabel).join(" · ");

  openModal({
    title: lead.business_name,
    subtitle: [lead.category, [lead.city, lead.region].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
    wide: true,
    body: `
      <div class="btn-row">
        ${pill(lead.status)}
        ${pill(lead.qualification_status || "unreviewed")}
        ${score(lead.lead_score)}
        ${source.rating ? `<span class="faint">${source.rating}★ (${source.ratingCount || 0})</span>` : ""}
      </div>

      <dl class="detail-list">
        <div><dt>Contact</dt><dd>${escapeHtml(lead.contact_name || "—")}</dd></div>
        <div><dt>Phone</dt><dd>${escapeHtml(lead.phone || "—")}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(lead.email || "—")}</dd></div>
        <div><dt>Salesperson</dt><dd>${escapeHtml(member?.full_name || "Unassigned")}</dd></div>
        <div><dt>Calls attempted</dt><dd>${Number(lead.calls_attempted || 0)}</dd></div>
        <div><dt>Setup quote</dt><dd>${formatCurrency(lead.quoted_setup_fee || lead.deal_value || 0)}</dd></div>
        <div><dt>Monthly quote</dt><dd>${formatCurrency(lead.quoted_monthly_fee || 0)}/mo</dd></div>
        <div><dt>Last contact</dt><dd>${lead.last_contacted_at ? relativeTime(lead.last_contacted_at) : "Never"}</dd></div>
        <div><dt>Follow-up</dt><dd>${lead.follow_up_at ? relativeTime(lead.follow_up_at) : "—"}</dd></div>
        <div><dt>Website</dt><dd>${lead.website_url || lead.website ? externalLink(lead.website_url || lead.website, "Open website") : "Not recorded"}</dd></div>
        <div><dt>Listing</dt><dd>${lead.listing_url ? externalLink(lead.listing_url, "Source listing") : "—"}</dd></div>
        <div><dt>Found</dt><dd>${formatDate(lead.discovered_at || lead.created_at, { year: "numeric" })}</dd></div>
      </dl>

      ${opportunity || lead.opportunity_summary ? `<div class="email-preview"><strong>Automation opportunity</strong><p>${escapeHtml(opportunity || "Needs qualification")}</p><p>${escapeHtml(lead.opportunity_summary || "")}</p></div>` : ""}
      ${(lead.pain_points || []).length || (lead.objections || []).length ? `<div class="split split--even"><div><h3>Pain points</h3><div class="tag-list">${(lead.pain_points || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("") || '<span class="faint">None recorded</span>'}</div></div><div><h3>Objections</h3><div class="tag-list">${(lead.objections || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("") || '<span class="faint">None recorded</span>'}</div></div></div>` : ""}
      ${lead.notes ? `<div class="email-preview"><strong>Notes</strong><p>${escapeHtml(lead.notes)}</p></div>` : ""}

      <h3>Chronological activity</h3>
      ${events.length ? rows(events.map((event) => row({ main: event.title, sub: event.detail || "Recorded", iconName: event.iconName, side: `<span class="faint">${relativeTime(event.at)}</span>` }))) : rows([row({ main: "Lead imported", sub: "No later activity is recorded", iconName: "building" })])}
    `,
    footer: `
      ${btn("Edit", { action: "lead-edit", variant: "quiet", attrs: `data-id="${lead.id}"` })}
      ${btn("Move stage", { action: "lead-stage", attrs: `data-id="${lead.id}"` })}
      ${btn("Schedule meeting", { action: "meeting-new", attrs: `data-lead-id="${lead.id}"` })}
      ${btn("Open in Calling", { action: "navigate", variant: "primary", iconName: "phone", attrs: `data-route-target="calling" data-route-params='${escapeHtml(JSON.stringify({ lead: lead.id }))}'` })}
    `,
  });
}

export function openStageForm(lead) {
  openModal({
    title: "Move lead",
    subtitle: lead.business_name,
    body: `<form id="stage-form" data-form="lead-stage" data-id="${lead.id}">
      ${field("Stage", select("status", PIPELINE_STAGES.map((stage) => ({ value: stage.id, label: stage.label })), lead.status))}
    </form>`,
    footer: footer("stage-form", "Move"),
  });
}

/* ---------- outreach ---------- */

export function openDraftForm(draft) {
  const { data } = getState();
  const lead = data.leads.find((item) => String(item.id) === String(draft.lead_id));
  openModal({
    title: "Outreach email",
    subtitle: lead?.business_name || "",
    wide: true,
    body: `
      ${draft.error_message && draft.status !== "sent" ? notice("Last send attempt", draft.error_message, { tone: "warn", iconName: "mail" }) : ""}
      <form id="draft-form" data-form="draft" data-id="${draft.id}">
        ${field("Subject", input("subject", draft.subject, { required: true }))}
        ${field("Body", textarea("body", draft.body, { required: true, attrs: 'rows="16"' }))}
      </form>
    `,
    footer: `
      ${btn("Cancel", { action: "close-modal", variant: "quiet" })}
      <button class="btn" type="submit" form="draft-form" data-mode="draft">Save draft</button>
      <button class="btn" type="submit" form="draft-form" data-mode="ready">Mark ready</button>
      <button class="btn btn--primary" type="submit" form="draft-form" data-mode="send">Send</button>
    `,
  });
}

/**
 * A free-form email to any address.
 *
 * The outreach composer only ever addresses a lead, which left no way at all to
 * email a client, a supplier or anyone who is not in the pipeline. Selecting a
 * lead here is optional and only decides what the email gets filed against.
 */
export function openDirectEmailForm({ to = "", subject = "", body = "", leadId = "" } = {}) {
  const { data } = getState();
  const blocker = outlookBlocker();
  openModal({
    title: "New email",
    subtitle: "Sends through the connected Outlook mailbox",
    wide: true,
    body: `
      ${blocker ? notice("This cannot send yet", blocker, { tone: "warn", iconName: "mail" }) : ""}
      <form id="direct-email-form" data-form="direct-email">
        <div class="field-grid">
          ${field("To", input("to", to, { type: "email", required: true, placeholder: "someone@example.com" }))}
          ${field("CC", input("cc", "", { placeholder: "optional, comma separated" }))}
        </div>
        ${field("Subject", input("subject", subject, { required: true }))}
        ${field("Body", textarea("body", body, { required: true, attrs: 'rows="14"' }))}
        ${field("File against a lead", select("lead_id", leadOptions(data.leads), leadId, { placeholder: "Not linked to a lead" }), { hint: "optional" })}
      </form>
    `,
    footer: `
      ${btn("Cancel", { action: "close-modal", variant: "quiet" })}
      <button class="btn btn--primary" type="submit" form="direct-email-form"${blocker ? " disabled" : ""}>Send</button>
    `,
  });
}

export function openFollowUpForm(followUp = null) {
  const { data } = getState();
  openModal({
    title: followUp ? "Edit follow-up" : "Schedule follow-up",
    body: `<form id="followup-form" data-form="followup"${followUp ? ` data-id="${followUp.id}"` : ""}>
      ${field("Lead", select("lead_id", leadOptions(data.leads), followUp?.lead_id, { placeholder: "Select a lead" }))}
      <div class="field-grid">
        ${field("Attempt", input("sequence_number", followUp?.sequence_number || 1, { type: "number", attrs: 'min="1" max="12"' }))}
        ${field("Due", input("due_at", localDateTime(followUp?.due_at || new Date(Date.now() + 3 * 86_400_000)), { type: "datetime-local", required: true }))}
      </div>
      ${field("Note to self", textarea("suggested_text", followUp?.suggested_text || "", { attrs: 'rows="3"' }))}
    </form>`,
    footer: footer("followup-form", "Save"),
  });
}

/* ---------- clients ---------- */

export function openClientForm(client = null, presetLeadId = "") {
  const { data } = getState();
  const eligible = data.leads.filter((lead) => !data.clients.some((item) => item.lead_id === lead.id && item.id !== client?.id));
  openModal({
    title: client ? "Edit client" : "New client",
    wide: true,
    body: `<form id="client-form" data-form="client"${client ? ` data-id="${client.id}"` : ""}>
      ${field("Lead", select("lead_id", leadOptions(eligible), client?.lead_id || presetLeadId, { placeholder: "Select the won lead" }))}
      <div class="field-grid">
        ${field("Contact", input("contact_name", client?.contact_name || ""))}
        ${field("Email", input("email", client?.email || "", { type: "email" }))}
        ${field("Phone", input("phone", client?.phone || ""))}
        ${field("Offer", input("package_name", client?.package_name || CONFIG.packageName))}
        ${field("Activation fee", input("setup_fee", client?.setup_fee ?? client?.agreed_price ?? CONFIG.defaultSetupFee, { type: "number", attrs: 'min="0" step="50"' }))}
        ${field("Monthly service", input("monthly_fee", client?.monthly_fee ?? CONFIG.defaultMonthlyFee, { type: "number", attrs: 'min="0" step="1"' }))}
        ${field("Received", input("amount_received", client?.amount_received ?? 0, { type: "number", attrs: 'min="0"' }))}
        ${field("Status", select("status", ["onboarding", "active", "paused", "completed"].map((value) => ({ value, label: statusLabel(value) })), client?.status || "onboarding"))}
        ${field("Purchase date", input("purchase_date", client?.purchase_date || localDate(), { type: "date" }))}
        ${field("Billing contact", input("billing_contact_name", client?.billing_contact_name || ""))}
        ${field("Billing email", input("billing_email", client?.billing_email || "", { type: "email" }))}
        ${field("Onboarding", select("onboarding_status", ["not_started", "in_progress", "blocked", "complete"].map((value) => ({ value, label: statusLabel(value) })), client?.onboarding_status || "not_started"))}
      </div>
      ${field("Notes", textarea("notes", client?.notes || "", { attrs: 'rows="3"' }))}
    </form>`,
    footer: footer("client-form", client ? "Save client" : "Create client"),
  });
}

export function openClientDetails(client) {
  const { data } = getState();
  const lead = data.leads.find((item) => item.id === client.lead_id);
  const projects = data.projects.filter((item) => String(item.client_id) === String(client.id));
  const automations = data.automations.filter((item) => String(item.client_id) === String(client.id));
  const onboarding = data.onboardingRecords.find((item) => String(item.client_id) === String(client.id));
  const maintenance = data.maintenanceSubscriptions.find((item) => String(item.client_id) === String(client.id));
  const payments = data.payments.filter((item) => String(item.client_id) === String(client.id));
  const directCosts = data.expenses.filter((item) => String(item.client_id || "") === String(client.id));
  const monthlyRevenue = Number(maintenance?.monthly_amount || client.monthly_fee || 0);
  const monthlyCosts = directCosts
    .filter((expense) => expense.recurring || isSameMonth(expense.occurred_on || expense.created_at))
    .reduce((total, expense) => total + Number(expense.amount || 0), 0);

  openModal({
    title: lead?.business_name || "Client",
    subtitle: client.contact_name || client.email || "",
    wide: true,
    body: `
      <dl class="detail-list">
        <div><dt>Status</dt><dd>${pill(client.status)}</dd></div>
        <div><dt>Activation fee</dt><dd>${formatCurrency(client.setup_fee || client.agreed_price)}</dd></div>
        <div><dt>Monthly fee</dt><dd>${formatCurrency(client.monthly_fee)}/mo</dd></div>
        <div><dt>Received</dt><dd>${formatCurrency(client.amount_received)}</dd></div>
        <div><dt>Onboarding</dt><dd>${pill(onboarding?.status || client.onboarding_status || "not_started")}</dd></div>
        <div><dt>Support</dt><dd>${pill(client.support_status || "normal")}</dd></div>
        <div><dt>Stored monthly cost</dt><dd>${formatCurrency(monthlyCosts, 2)}</dd></div>
        <div><dt>Estimated monthly gross</dt><dd>${formatCurrency(monthlyRevenue - monthlyCosts, 2)}</dd></div>
      </dl>
      ${rows([
        row({ main: onboarding ? "Structured onboarding" : "Onboarding not started", sub: onboarding ? `${onboarding.progress || 0}% complete · updated ${formatDate(onboarding.updated_at)}` : "Capture business, customer handling, technical details, and automation goals", iconName: "check-square", side: onboarding ? pill(onboarding.status) : btn("Start onboarding", { action: "onboarding-open", size: "sm", attrs: `data-client-id="${client.id}"` }) }),
        ...projects.map((project) => row({ main: project.name, sub: `${project.automation_type || "Automation"} · ${project.progress || 0}% · target ${formatDate(project.target_launch || project.deadline)}`, iconName: "tool", side: pill(project.status) })),
        ...automations.map((automation) => row({ main: automation.name, sub: `${statusLabel(automation.automation_type)} · ${automation.provider || "provider not selected"}${automation.last_error ? ` · ${automation.last_error}` : ""}`, iconName: "bolt", tone: automation.last_error ? "red" : "", side: pill(automation.status) })),
        ...(!projects.length ? [row({ main: "No automation project", sub: "Create a project to track delivery", iconName: "check-square", side: btn("New project", { action: "project-new", size: "sm" }) })] : []),
        row({ main: maintenance ? maintenance.plan_name : "No management subscription", sub: maintenance ? `${formatCurrency(maintenance.monthly_amount)}/mo · next ${formatDate(maintenance.next_charge_on)}` : "Add recurring management after launch", iconName: "refresh", side: maintenance ? pill(maintenance.status) : btn("Add subscription", { action: "subscription-new", size: "sm" }) }),
        ...payments.map((payment) => row({ main: formatCurrency(payment.amount), sub: `${statusLabel(payment.payment_type)} · ${formatDate(payment.paid_at)}`, iconName: "wallet", side: pill(payment.status) })),
      ])}
      ${client.notes ? `<p class="email-preview">${escapeHtml(client.notes)}</p>` : ""}
    `,
    footer: `${btn("Close", { action: "close-modal", variant: "quiet" })}${btn("Edit client", { action: "client-edit", variant: "primary", attrs: `data-id="${client.id}"` })}`,
  });
}

export function openProjectForm(project = null) {
  const { data } = getState();
  openModal({
    title: project ? "Edit project" : "New project",
    body: `<form id="project-form" data-form="project"${project ? ` data-id="${project.id}"` : ""}>
      ${field("Client", select("client_id", clientOptions(data), project?.client_id, { placeholder: "Select a client" }))}
      ${field("Name", input("name", project?.name || "", { required: true }))}
      <div class="field-grid">
        ${field("Stage", select("status", PROJECT_STAGES.map((value) => ({ value, label: statusLabel(value) })), project?.status || "discovery"))}
        ${field("Automation type", input("automation_type", project?.automation_type || "AI receptionist / lead booking"))}
        ${field("Owner", select("owner_id", memberOptions(data), project?.owner_id || "", { placeholder: "Unassigned" }))}
        ${field("Complexity", select("complexity", ["simple", "standard", "complex", "custom"].map((value) => ({ value, label: statusLabel(value) })), project?.complexity || "standard"))}
        ${field("Start date", input("start_date", project?.start_date || localDate(), { type: "date" }))}
        ${field("Target launch", input("target_launch", project?.target_launch || project?.deadline || localDate(new Date(Date.now() + 14 * 86_400_000)), { type: "date" }))}
        ${field("Progress", input("progress", project?.progress ?? 0, { type: "number", attrs: 'min="0" max="100"' }))}
        ${field("Testing", select("testing_status", ["not_started", "in_progress", "passed", "failed", "blocked"].map((value) => ({ value, label: statusLabel(value) })), project?.testing_status || "not_started"))}
        ${field("Deployment", select("deployment_status", ["not_deployed", "staging", "limited_rollout", "production", "paused", "failed"].map((value) => ({ value, label: statusLabel(value) })), project?.deployment_status || "not_deployed"))}
        ${field("Current version", input("current_version", project?.current_version || ""))}
      </div>
      ${field("Requirements", textarea("requirements", JSON.stringify(project?.requirements || {}, null, 2), { attrs: 'rows="6"' }), { hint: "structured JSON; do not include credentials" })}
      ${field("Notes", textarea("notes", project?.notes || "", { attrs: 'rows="2"' }))}
    </form>`,
    footer: footer("project-form", "Save project"),
  });
}

export function openMaintenanceForm(subscription = null) {
  const { data } = getState();
  openModal({
    title: subscription ? "Edit plan" : "Add maintenance plan",
    body: `<form id="maintenance-form" data-form="maintenance"${subscription ? ` data-id="${subscription.id}"` : ""}>
      ${field("Client", select("client_id", clientOptions(data), subscription?.client_id, { placeholder: "Select a client" }))}
      <div class="field-grid">
        ${field("Plan", input("plan_name", subscription?.plan_name || "Website Maintenance"))}
        ${field("Monthly", input("monthly_amount", subscription?.monthly_amount ?? 50, { type: "number", attrs: 'min="0"' }))}
        ${field("Status", select("status", ["active", "inactive", "past_due", "cancelled"].map((value) => ({ value, label: statusLabel(value) })), subscription?.status || "active"))}
        ${field("Next charge", input("next_charge_on", subscription?.next_charge_on || localDate(new Date(Date.now() + 30 * 86_400_000)), { type: "date" }))}
      </div>
      ${checkbox("hosting_included", "Hosting included", subscription?.hosting_included !== false)}
      ${checkbox("domain_managed", "Domain managed by me", Boolean(subscription?.domain_managed))}
    </form>`,
    footer: footer("maintenance-form", "Save plan"),
  });
}

/* ---------- money ---------- */

export function openPaymentForm(payment = null) {
  const { data } = getState();
  openModal({
    title: payment ? "Edit payment" : "Record payment",
    body: `<form id="payment-form" data-form="payment"${payment ? ` data-id="${payment.id}"` : ""}>
      ${field("Customer", input("customer_name", payment?.customer_name || "", { required: true }))}
      ${field("Client", select("client_id", clientOptions(data), payment?.client_id, { placeholder: "Not linked" }))}
      ${field("Project", select("project_id", data.projects.map((project) => ({ value: project.id, label: project.name })), payment?.project_id, { placeholder: "Not linked" }))}
      <div class="field-grid">
        ${field("Type", select("payment_type", ["setup_fee", "recurring_subscription", "usage_overage", "custom_invoice", "refund"].map((value) => ({ value, label: statusLabel(value) })), payment?.payment_type || "setup_fee"))}
        ${field("Status", select("status", ["paid", "available", "pending", "overdue", "failed", "refunded"].map((value) => ({ value, label: statusLabel(value) })), payment?.status || "paid"))}
        ${field("Amount", input("amount", payment?.amount ?? 2500, { type: "number", required: true, attrs: 'min="0" step="0.01"' }))}
        ${field("Fee", input("fee_amount", payment?.fee_amount ?? 0, { type: "number", attrs: 'min="0" step="0.01"' }))}
        ${field("Date", input("paid_at", localDateTime(payment?.paid_at || new Date()), { type: "datetime-local" }))}
        ${field("Due date", input("due_date", payment?.due_date || "", { type: "date" }))}
      </div>
    </form>`,
    footer: footer("payment-form", "Save payment"),
  });
}

export function openExpenseForm(expense = null) {
  const { data } = getState();
  openModal({
    title: expense ? "Edit expense" : "Add expense",
    body: `<form id="expense-form" data-form="expense"${expense ? ` data-id="${expense.id}"` : ""}>
      <div class="field-grid">
        ${field("Scope", select("cost_scope", ["overhead", "client"].map((value) => ({ value, label: statusLabel(value) })), expense?.cost_scope || (expense?.client_id ? "client" : "overhead")))}
        ${field("Client", select("client_id", clientOptions(data), expense?.client_id || "", { placeholder: "Agency overhead" }))}
        ${field("Project", select("project_id", data.projects.map((project) => ({ value: project.id, label: project.name })), expense?.project_id || "", { placeholder: "Not linked" }))}
        ${field("Automation", select("automation_id", data.automations.map((automation) => ({ value: automation.id, label: automation.name })), expense?.automation_id || "", { placeholder: "Not linked" }))}
        ${field("Category", select("category", ["hosting", "domains", "apis", "software", "payment_fees", "ai", "other"].map((value) => ({ value, label: statusLabel(value) })), expense?.category || "software"))}
        ${field("Date", input("occurred_on", expense?.occurred_on || localDate(), { type: "date" }))}
        ${field("Vendor", input("vendor", expense?.vendor || ""))}
        ${field("Amount", input("amount", expense?.amount ?? 0, { type: "number", required: true, attrs: 'min="0" step="0.01"' }))}
      </div>
      ${checkbox("recurring", "Recurring cost", Boolean(expense?.recurring))}
      ${field("Description", input("description", expense?.description || "", { required: true }))}
    </form>`,
    footer: footer("expense-form", "Save expense", expense
      ? btn("Delete", { action: "expense-delete", variant: "danger", attrs: `data-id="${expense.id}"` })
      : ""),
  });
}

export function openPricingForm(experiment = null) {
  openModal({
    title: experiment ? "Edit experiment" : "New pricing experiment",
    body: `<form id="pricing-form" data-form="pricing"${experiment ? ` data-id="${experiment.id}"` : ""}>
      ${field("Name", input("name", experiment?.name || "", { required: true, placeholder: "Missed-call opener" }))}
      <div class="field-grid">
        ${field("Activation fee", input("offer_amount", experiment?.offer_amount ?? CONFIG.defaultSetupFee, { type: "number", attrs: 'min="2500" max="2500" step="50" readonly' }))}
        ${field("Status", select("status", ["draft", "active", "paused", "complete"].map((value) => ({ value, label: statusLabel(value) })), experiment?.status || "draft"))}
        ${field("Emails", input("sent_count", experiment?.sent_count ?? 0, { type: "number", attrs: 'min="0"' }))}
        ${field("Replies", input("reply_count", experiment?.reply_count ?? 0, { type: "number", attrs: 'min="0"' }))}
        ${field("Sales", input("close_count", experiment?.close_count ?? 0, { type: "number", attrs: 'min="0"' }))}
        ${field("Revenue", input("revenue", experiment?.revenue ?? 0, { type: "number", attrs: 'min="0"' }))}
      </div>
    </form>`,
    footer: footer("pricing-form", "Save experiment"),
  });
}

/* ---------- workspace ---------- */

export function openTaskForm(task = null) {
  const { data } = getState();
  openModal({
    title: task ? "Edit task" : "New task",
    body: `<form id="task-form" data-form="task"${task ? ` data-id="${task.id}"` : ""}>
      ${field("Title", input("title", task?.title || "", { required: true }))}
      <div class="field-grid">
        ${field("Priority", select("priority", ["low", "normal", "high", "urgent"].map((value) => ({ value, label: statusLabel(value) })), task?.priority || "normal"))}
        ${field("Due", input("due_at", localDateTime(task?.due_at || new Date(Date.now() + 86_400_000)), { type: "datetime-local" }))}
        ${field("Lead", select("lead_id", leadOptions(data.leads), task?.lead_id, { placeholder: "None" }))}
        ${field("Client", select("client_id", clientOptions(data), task?.client_id, { placeholder: "None" }))}
      </div>
      ${field("Detail", textarea("description", task?.description || "", { attrs: 'rows="3"' }))}
    </form>`,
    footer: footer("task-form", "Save task", task
      ? btn("Delete", { action: "task-delete", variant: "danger", attrs: `data-id="${task.id}"` })
      : ""),
  });
}

export function openNoteForm(note = null) {
  openModal({
    title: note ? "Edit note" : "New note",
    wide: true,
    body: `<form id="note-form" data-form="note"${note ? ` data-id="${note.id}"` : ""}>
      ${field("Title", input("title", note?.title || "", { required: true }))}
      <div class="field-grid">
        ${field("Category", select("category", ["sales", "research", "lessons", "procedure", "strategy", "other"].map((value) => ({ value, label: statusLabel(value) })), note?.category || "sales"))}
        ${field("Tags", input("tags", (note?.tags || []).join(", ")), { hint: "comma separated" })}
      </div>
      ${field("Content", textarea("content", note?.content || "", { required: true, attrs: 'rows="12"' }))}
      ${checkbox("is_pinned", "Pin this note", Boolean(note?.is_pinned))}
    </form>`,
    footer: footer("note-form", "Save note", note
      ? btn("Delete", { action: "note-delete", variant: "danger", attrs: `data-id="${note.id}"` })
      : ""),
  });
}

export function openCalendarForm(date = "", event = null) {
  const { data } = getState();
  const starts = event?.starts_at || (date ? `${date}T09:00:00` : new Date(Date.now() + 3_600_000));
  openModal({
    title: event ? "Edit event" : "New event",
    body: `<form id="calendar-form" data-form="calendar"${event ? ` data-id="${event.id}"` : ""}>
      ${field("Title", input("title", event?.title || "", { required: true }))}
      <div class="field-grid">
        ${field("Type", select("event_type", ["call", "follow_up", "deadline", "launch", "maintenance", "other"].map((value) => ({ value, label: statusLabel(value) })), event?.event_type || "call"))}
        ${field("Starts", input("starts_at", localDateTime(starts), { type: "datetime-local", required: true }))}
        ${field("Lead", select("lead_id", leadOptions(data.leads), event?.lead_id, { placeholder: "None" }))}
      </div>
      ${field("Notes", textarea("notes", event?.notes || "", { attrs: 'rows="2"' }))}
    </form>`,
    footer: footer("calendar-form", "Save event"),
  });
}

/* ---------- detail views ---------- */

export function openDiscoveryDetails(result) {
  const lead = result.normalized_data || {};
  const source = result.raw_source_metadata?.openscout || {};
  const presence = result.raw_source_metadata?.web_presence || lead.source_metadata?.web_presence || {};
  openModal({
    title: result.business_name,
    subtitle: "From the OpenScout search",
    wide: true,
    body: `
      <dl class="detail-list">
        <div><dt>Niche</dt><dd>${escapeHtml(lead.category || "—")}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml([lead.city, lead.region].filter(Boolean).join(", ") || "—")}</dd></div>
        <div><dt>Phone</dt><dd>${escapeHtml(lead.phone || "—")}</dd></div>
        <div><dt>Rating</dt><dd>${source.rating ? `${source.rating} (${source.ratingCount || 0})` : "—"}</dd></div>
        <div><dt>Website</dt><dd>${escapeHtml(result.website_status || "—")}</dd></div>
        <div><dt>Web check</dt><dd>${escapeHtml(statusLabel(presence.status || "not checked"))}</dd></div>
        <div><dt>Web evidence</dt><dd>${escapeHtml(presence.evidence || presence.reason || "—")}</dd></div>
        <div><dt>Web search</dt><dd>${externalLink(presence.searched_url, "Open search evidence")}</dd></div>
        <div><dt>Score</dt><dd>${score(result.lead_score)}</dd></div>
        <div><dt>Listing</dt><dd>${externalLink(lead.listing_url, "Google listing")}</dd></div>
        <div><dt>Decision</dt><dd>${pill(result.decision)}</dd></div>
      </dl>
      ${presence.status === "unknown" ? notice(
        "Website check uncertain",
        presence.reason || "A plausible website could not be confirmed. Review this business before outreach.",
        { tone: "warn", iconName: "alert" },
      ) : ""}
      ${(source.reasons || []).length ? `<div class="tag-list">${source.reasons.map((reason) => `<span class="tag">${escapeHtml(reason)}</span>`).join("")}</div>` : ""}
      <details class="advanced"><summary>Raw source data</summary><div class="advanced__body"><pre class="code-block">${escapeHtml(JSON.stringify(result.raw_source_metadata || {}, null, 2))}</pre></div></details>
    `,
    footer: `${btn("Close", { action: "close-modal", variant: "quiet" })}${result.decision === "pending"
      ? `${btn("Reject", { action: "discovery-reject", variant: "danger", attrs: `data-id="${result.id}"` })}${btn("Save to leads", { action: "discovery-save", variant: "primary", attrs: `data-id="${result.id}"` })}`
      : ""}`,
  });
}

export function openDeploymentLogs(deployment) {
  openModal({
    title: `${deployment.domain || "Deployment"} logs`,
    subtitle: `${statusLabel(deployment.status)} · version ${deployment.version || "—"}`,
    body: (deployment.logs || []).length
      ? `<pre class="code-block">${escapeHtml((deployment.logs || []).map((entry) => `${formatDate(entry.at, { hour: "numeric", minute: "2-digit" })}  ${entry.message}`).join("\n"))}</pre>`
      : `<p class="faint">No logs recorded.</p>`,
    footer: btn("Close", { action: "close-modal", variant: "primary" }),
  });
}

export function openTemplateUploadForm() {
  openModal({
    title: "Upload template",
    subtitle: "Portable source files plus original image assets",
    wide: true,
    body: `<form id="template-upload-form" data-form="template-upload">
      <div class="field-grid">
        ${field("Name", input("name", "", { required: true, placeholder: "Northstar Plumbing" }))}
        ${field("Niche", input("category", "", { required: true, placeholder: "Plumbing" }))}
      </div>
      ${field("Description", textarea("description", "", { attrs: 'rows="2"', placeholder: "What this template is best at" }))}
      <div class="field-grid">
        ${field("index.html", '<input name="html_file" type="file" accept=".html,text/html" required>')}
        ${field("style.css", '<input name="css_file" type="file" accept=".css,text/css" required>')}
        ${field("script.js", '<input name="js_file" type="file" accept=".js,text/javascript,application/javascript">')}
        ${field("Images", '<input name="assets" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml" multiple>', { hint: "original bytes, up to 15 MB each" })}
      </div>
      ${notice(
        "Use portable paths",
        "Reference images as assets/filename.png. Asset filenames and matching paths are normalized to lowercase hyphens. Available placeholders include {{business}}, {{city}}, {{region}}, {{phone}}, {{email}}, {{address}}, {{category}}, {{cta}}, {{hours}}, and {{accent}}.",
        { iconName: "code" },
      )}
    </form>`,
    footer: footer("template-upload-form", "Upload template"),
  });
}

export function openTemplatePreview(template, document_) {
  openModal({
    title: template.name,
    subtitle: `${template.category} · used ${template.use_count || 0}×`,
    wide: true,
    body: `<div class="frame" style="height:min(70dvh,700px)"><iframe title="${escapeHtml(template.name)} preview" sandbox="allow-scripts" srcdoc="${escapeHtml(document_)}"></iframe></div>`,
    footer: `${btn("Close", { action: "close-modal", variant: "quiet" })}${btn("Use for a lead", { action: "template-use", variant: "primary", attrs: `data-id="${template.id}"` })}`,
  });
}

export function openTemplateChooser(templates, leads) {
  openModal({
    title: "Build a demo",
    subtitle: "Pick the lead — the template is already chosen",
    body: `<form id="build-form" data-form="build-demo">
      ${field("Lead", select("lead_id", leadOptions(leads), "", { placeholder: "Select a lead" }))}
      ${field("Template", select("template_id", templates.map((template) => ({ value: template.id, label: `${template.name} · ${template.category}` })), "", { placeholder: "Choose automatically by niche" }))}
    </form>`,
    footer: footer("build-form", "Build demo"),
  });
}

export function openReplyClassifier(thread) {
  openModal({
    title: "Classify reply",
    subtitle: thread.subject || "",
    body: `<form id="classify-form" data-form="classify" data-id="${thread.id}">
      ${field("Classification", select("classification", REPLY_CLASSIFICATIONS.map((value) => ({ value, label: statusLabel(value) })), thread.classification))}
    </form>`,
    footer: footer("classify-form", "Save"),
  });
}
