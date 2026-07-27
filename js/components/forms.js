/* Modal forms and detail views. One pattern, no nested cards. */
import { PIPELINE_STAGES, PROJECT_STAGES, REPLY_CLASSIFICATIONS } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, relativeTime, statusLabel } from "../core/utils.js";
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

/* ---------- leads ---------- */

export function openLeadForm(lead = null) {
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
          ${field("City", input("city", lead?.city || ""))}
          ${field("State", input("region", lead?.region || ""))}
          ${field("Stage", select("status", PIPELINE_STAGES.map((stage) => ({ value: stage.id, label: stage.label })), lead?.status || "new"))}
          ${field("Score", input("lead_score", lead?.lead_score ?? 80, { type: "number", attrs: 'min="0" max="100"' }))}
          ${field("Deal value", input("deal_value", lead?.deal_value ?? 500, { type: "number", attrs: 'min="0" step="50"' }))}
        </div>
        ${field("Address", input("address", lead?.address || ""))}
        ${field("Notes", textarea("notes", lead?.notes || "", { attrs: 'rows="3"' }))}
        ${checkbox("has_website", "This business already has a real website", Boolean(lead?.has_website))}
      </form>
    `,
    footer: footer("lead-form", lead ? "Save lead" : "Add lead", lead
      ? btn("Delete", { action: "lead-delete", variant: "danger", attrs: `data-id="${lead.id}"` })
      : ""),
  });
}

export function openLeadDetails(lead) {
  const { data } = getState();
  const demo = data.demos.find((item) => String(item.lead_id) === String(lead.id));
  const drafts = data.drafts.filter((item) => String(item.lead_id) === String(lead.id));
  const threads = data.emailThreads.filter((item) => String(item.lead_id) === String(lead.id));
  const source = lead.source_metadata?.openscout || {};

  openModal({
    title: lead.business_name,
    subtitle: [lead.category, [lead.city, lead.region].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
    wide: true,
    body: `
      <div class="btn-row">
        ${pill(lead.status)}
        ${pill(lead.has_website ? "warning" : "connected", lead.has_website ? "Has website" : "No website")}
        ${score(lead.lead_score)}
        ${source.rating ? `<span class="faint">${source.rating}★ (${source.ratingCount || 0})</span>` : ""}
      </div>

      <dl class="detail-list">
        <div><dt>Contact</dt><dd>${escapeHtml(lead.contact_name || "—")}</dd></div>
        <div><dt>Phone</dt><dd>${escapeHtml(lead.phone || "—")}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(lead.email || "—")}</dd></div>
        <div><dt>Deal value</dt><dd>${formatCurrency(lead.deal_value || lead.asking_price || 0)}</dd></div>
        <div><dt>Last contact</dt><dd>${lead.last_contacted_at ? relativeTime(lead.last_contacted_at) : "Never"}</dd></div>
        <div><dt>Follow-up</dt><dd>${lead.follow_up_at ? relativeTime(lead.follow_up_at) : "—"}</dd></div>
        <div><dt>Listing</dt><dd>${externalLink(lead.listing_url, "Google listing")}</dd></div>
        <div><dt>Found</dt><dd>${formatDate(lead.discovered_at || lead.created_at, { year: "numeric" })}</dd></div>
      </dl>

      ${rows([
        row({
          main: demo ? demo.name : "No demo yet",
          sub: demo ? demo.preview_url || "Not published" : "Build the site from a matching template",
          iconName: "monitor",
          side: demo
            ? `${pill(demo.status)}${btn("Studio", { action: "demo-studio", size: "sm", attrs: `data-id="${demo.id}"` })}`
            : btn("Build demo", { action: "demo-build", size: "sm", variant: "primary", attrs: `data-lead-id="${lead.id}"` }),
        }),
        row({
          main: drafts.length ? `${drafts.length} outreach email${drafts.length === 1 ? "" : "s"}` : "No outreach yet",
          sub: drafts[0] ? `${statusLabel(drafts[0].status)} · ${drafts[0].subject}` : "Draft the standard offer email",
          iconName: "mail",
          side: btn(drafts.length ? "Open outreach" : "Draft email", { action: "lead-outreach", size: "sm", attrs: `data-id="${lead.id}"` }),
        }),
        row({
          main: threads.length ? `${threads.length} repl${threads.length === 1 ? "y" : "ies"}` : "No replies",
          sub: threads[0]?.subject || "Replies appear after Outlook inbox sync is added",
          iconName: "inbox",
          side: threads[0] ? btn("Open", { action: "thread-open", size: "sm", attrs: `data-id="${threads[0].id}"` }) : "",
        }),
      ])}

      ${lead.notes ? `<p class="email-preview">${escapeHtml(lead.notes)}</p>` : ""}
    `,
    footer: `
      ${btn("Edit", { action: "lead-edit", variant: "quiet", attrs: `data-id="${lead.id}"` })}
      ${btn("Move stage", { action: "lead-stage", attrs: `data-id="${lead.id}"` })}
      ${btn("Run the full sequence", { action: "lead-prepare", variant: "primary", iconName: "bolt", attrs: `data-id="${lead.id}"` })}
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
        ${field("Package", input("package_name", client?.package_name || "Standard website"))}
        ${field("Price", input("agreed_price", client?.agreed_price ?? 500, { type: "number", attrs: 'min="0"' }))}
        ${field("Received", input("amount_received", client?.amount_received ?? 0, { type: "number", attrs: 'min="0"' }))}
        ${field("Status", select("status", ["onboarding", "active", "awaiting_content", "ready_to_launch", "completed", "paused"].map((value) => ({ value, label: statusLabel(value) })), client?.status || "onboarding"))}
        ${field("Purchase date", input("purchase_date", client?.purchase_date || localDate(), { type: "date" }))}
        ${field("Domain", input("domain", client?.domain || ""))}
        ${field("Live URL", input("production_url", client?.production_url || "", { type: "url" }))}
      </div>
      ${field("Notes", textarea("notes", client?.notes || "", { attrs: 'rows="3"' }))}
    </form>`,
    footer: footer("client-form", client ? "Save client" : "Create client"),
  });
}

export function openClientDetails(client) {
  const { data } = getState();
  const lead = data.leads.find((item) => item.id === client.lead_id);
  const project = data.projects.find((item) => item.client_id === client.id);
  const maintenance = data.maintenanceSubscriptions.find((item) => item.client_id === client.id);
  const payments = data.payments.filter((item) => item.client_id === client.id);

  openModal({
    title: lead?.business_name || "Client",
    subtitle: client.contact_name || client.email || "",
    wide: true,
    body: `
      <dl class="detail-list">
        <div><dt>Status</dt><dd>${pill(client.status)}</dd></div>
        <div><dt>Price</dt><dd>${formatCurrency(client.agreed_price)}</dd></div>
        <div><dt>Received</dt><dd>${formatCurrency(client.amount_received)}</dd></div>
        <div><dt>Site</dt><dd>${externalLink(client.production_url, client.domain || "Not live")}</dd></div>
      </dl>
      ${rows([
        row({ main: project?.name || "No project", sub: project ? `${project.progress}% · due ${formatDate(project.deadline)}` : "Create one to track fulfilment", iconName: "check-square", side: project ? pill(project.status) : btn("New project", { action: "project-new", size: "sm" }) }),
        row({ main: maintenance ? maintenance.plan_name : "No maintenance plan", sub: maintenance ? `${formatCurrency(maintenance.monthly_amount)}/mo · next ${formatDate(maintenance.next_charge_on)}` : "$50/month care plan", iconName: "refresh", side: maintenance ? pill(maintenance.status) : btn("Add plan", { action: "maintenance-new", size: "sm" }) }),
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
        ${field("Stage", select("status", PROJECT_STAGES.map((value) => ({ value, label: statusLabel(value) })), project?.status || "payment_received"))}
        ${field("Deadline", input("deadline", project?.deadline || localDate(new Date(Date.now() + 14 * 86_400_000)), { type: "date" }))}
        ${field("Progress", input("progress", project?.progress ?? 0, { type: "number", attrs: 'min="0" max="100"' }))}
      </div>
      ${field("Requested edits", textarea("requested_edits", (project?.requested_edits || []).join("\n"), { attrs: 'rows="3"' }), { hint: "one per line" })}
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
      <div class="field-grid">
        ${field("Type", select("payment_type", [{ value: "website_sale", label: "Website sale" }, { value: "maintenance", label: "Maintenance" }], payment?.payment_type || "website_sale"))}
        ${field("Status", select("status", ["paid", "available", "pending", "failed", "refunded"].map((value) => ({ value, label: statusLabel(value) })), payment?.status || "paid"))}
        ${field("Amount", input("amount", payment?.amount ?? 500, { type: "number", required: true, attrs: 'min="0" step="0.01"' }))}
        ${field("Fee", input("fee_amount", payment?.fee_amount ?? 0, { type: "number", attrs: 'min="0" step="0.01"' }))}
        ${field("Date", input("paid_at", localDateTime(payment?.paid_at || new Date()), { type: "datetime-local" }))}
      </div>
    </form>`,
    footer: footer("payment-form", "Save payment"),
  });
}

export function openExpenseForm(expense = null) {
  openModal({
    title: expense ? "Edit expense" : "Add expense",
    body: `<form id="expense-form" data-form="expense"${expense ? ` data-id="${expense.id}"` : ""}>
      <div class="field-grid">
        ${field("Category", select("category", ["hosting", "domains", "apis", "software", "payment_fees", "ai", "other"].map((value) => ({ value, label: statusLabel(value) })), expense?.category || "software"))}
        ${field("Date", input("occurred_on", expense?.occurred_on || localDate(), { type: "date" }))}
        ${field("Vendor", input("vendor", expense?.vendor || ""))}
        ${field("Amount", input("amount", expense?.amount ?? 0, { type: "number", required: true, attrs: 'min="0" step="0.01"' }))}
      </div>
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
      ${field("Name", input("name", experiment?.name || "", { required: true, placeholder: "$700 premium test" }))}
      <div class="field-grid">
        ${field("Offer", input("offer_amount", experiment?.offer_amount ?? 700, { type: "number", attrs: 'min="0" step="50"' }))}
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
        <div><dt>Score</dt><dd>${score(result.lead_score)}</dd></div>
        <div><dt>Listing</dt><dd>${externalLink(lead.listing_url, "Google listing")}</dd></div>
        <div><dt>Decision</dt><dd>${pill(result.decision)}</dd></div>
      </dl>
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
