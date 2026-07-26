import { PIPELINE_STAGES } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, slugify } from "../core/utils.js";
import { badge, button, openModal } from "./ui.js";
import { icon } from "../core/icons.js";

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

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
  return `${extra}${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="${formId}">${label}</button>`;
}

function relationOptions(items, selected, labeler) {
  return `<option value="">None</option>${items.map((item) => option(item.id, labeler(item), selected)).join("")}`;
}

export function openLeadForm(lead = null) {
  openModal({
    title: lead ? "Edit lead" : "Add lead",
    subtitle: lead ? "Update the normalized prospect record" : "Manual entry joins the same shared lead system",
    wide: true,
    body: `
      <form id="lead-form" data-form="lead" ${lead ? `data-id="${lead.id}"` : ""}>
        <div class="field-row">
          <label class="field field--flush"><span>Business name *</span><input name="business_name" required value="${escapeHtml(lead?.business_name || "")}"></label>
          <label class="field field--flush"><span>Owner / contact</span><input name="contact_name" value="${escapeHtml(lead?.contact_name || "")}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Email</span><input name="email" type="email" value="${escapeHtml(lead?.email || "")}"></label>
          <label class="field"><span>Phone</span><input name="phone" value="${escapeHtml(lead?.phone || "")}"></label>
        </div>
        <label class="field"><span>Street address</span><input name="address" value="${escapeHtml(lead?.address || "")}"></label>
        <div class="field-row">
          <label class="field"><span>City</span><input name="city" value="${escapeHtml(lead?.city || "")}"></label>
          <label class="field"><span>State</span><input name="region" value="${escapeHtml(lead?.region || "")}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Industry / category</span><input name="category" value="${escapeHtml(lead?.category || "")}" placeholder="Tree Service"></label>
          <label class="field"><span>Source</span><select name="source">${["manual", "openscout", "referral", "other"].map((value) => option(value, value === "openscout" ? "OpenScout" : value[0].toUpperCase() + value.slice(1), lead?.source || "manual")).join("")}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Listing URL</span><input name="listing_url" type="url" value="${escapeHtml(lead?.listing_url || lead?.google_maps_url || "")}"></label>
          <label class="field"><span>Website URL</span><input name="website_url" type="url" value="${escapeHtml(lead?.website_url || "")}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Pipeline stage</span><select name="status">${PIPELINE_STAGES.map((stage) => option(stage.id, stage.label, lead?.status || "new")).join("")}</select></label>
          <label class="field"><span>Priority</span><select name="priority">${["low", "normal", "high"].map((value) => option(value, value, lead?.priority || "normal")).join("")}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Lead score</span><input name="lead_score" type="number" min="0" max="100" value="${Number(lead?.lead_score || lead?.qualification_score || 0)}"></label>
          <label class="field"><span>Potential deal value</span><input name="deal_value" type="number" min="0" value="${Number(lead?.deal_value || lead?.asking_price || 400)}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Last contact</span><input name="last_contacted_at" type="datetime-local" value="${lead?.last_contacted_at ? localDateTime(lead.last_contacted_at) : ""}"></label>
          <label class="field"><span>Follow-up</span><input name="follow_up_at" type="datetime-local" value="${lead?.follow_up_at ? localDateTime(lead.follow_up_at) : ""}"></label>
        </div>
        <label class="field"><span>Tags <small>comma-separated</small></span><input name="tags" value="${escapeHtml((lead?.tags || []).join(", "))}"></label>
        <label class="field"><span>Notes</span><textarea name="notes">${escapeHtml(lead?.notes || "")}</textarea></label>
        <label class="check-field"><input type="checkbox" name="has_website" ${lead?.has_website ? "checked" : ""}><span>This business has a real website</span></label>
      </form>
    `,
    footer: footer("lead-form", lead ? "Save lead" : "Add lead", lead ? `<button class="button button--danger" data-action="request-delete" data-collection="leads" data-id="${lead.id}" data-label="${escapeHtml(lead.business_name)}">Delete</button>` : ""),
  });
}

export function openLeadDetails(lead) {
  const { data } = getState();
  const demo = data.demos.find((item) => item.lead_id === lead.id);
  const drafts = data.drafts.filter((item) => item.lead_id === lead.id);
  const threads = data.emailThreads.filter((item) => item.lead_id === lead.id);
  const events = data.activity.filter((item) => item.lead_id === lead.id);
  const source = lead.source_metadata?.openscout || lead.source_payload?.openscout || {};
  openModal({
    title: lead.business_name,
    subtitle: `${lead.category || "Uncategorized"} · ${[lead.city, lead.region].filter(Boolean).join(", ") || "No location"}`,
    wide: true,
    body: `
      <div class="modal-summary"><div>${badge(lead.status, lead.status.replaceAll("_", " "))}${badge(lead.has_website ? "warning" : "connected", lead.website_status || (lead.has_website ? "Has website" : "No website"))}</div><strong>${Number(lead.lead_score || lead.qualification_score || 0)}/100</strong><span>lead score</span></div>
      <div class="detail-tabs"><span>Overview</span><span>Demo</span><span>Emails</span><span>Activity</span><span>Notes</span></div>
      <section class="modal-section"><h3>Overview</h3><dl class="detail-list detail-list--two">
        <div><dt>Contact</dt><dd>${escapeHtml(lead.contact_name || "Not available")}</dd></div><div><dt>Email</dt><dd>${escapeHtml(lead.email || "Not available")}</dd></div>
        <div><dt>Phone</dt><dd>${escapeHtml(lead.phone || "Not available")}</dd></div><div><dt>Address</dt><dd>${escapeHtml(lead.address || "Not available")}</dd></div>
        <div><dt>Deal value</dt><dd>${formatCurrency(lead.deal_value || lead.asking_price || 0)}</dd></div><div><dt>Discovered</dt><dd>${formatDate(lead.discovered_at || lead.created_at, { year: "numeric" })}</dd></div>
        <div><dt>Last contact</dt><dd>${formatDate(lead.last_contacted_at, { year: "numeric" })}</dd></div><div><dt>Follow-up</dt><dd>${formatDate(lead.follow_up_at, { year: "numeric" })}</dd></div>
      </dl></section>
      <section class="modal-section"><h3>OpenScout source</h3><dl class="detail-list detail-list--two">
        <div><dt>Source</dt><dd>${escapeHtml(lead.source || "manual")}</dd></div><div><dt>Place ID</dt><dd><code class="id-code">${escapeHtml(lead.source_key || lead.source_metadata?.place_id || "—")}</code></dd></div>
        <div><dt>Rating</dt><dd>${escapeHtml(source.rating ?? "—")} · ${escapeHtml(source.ratingCount ?? 0)} reviews</dd></div><div><dt>Classification</dt><dd>${escapeHtml(source.leadType || source.leadCategory || "—")}</dd></div>
      </dl>${source.reasons?.length ? `<div class="source-reasons">${source.reasons.map((reason) => `<span>${icon("check")} ${escapeHtml(reason)}</span>`).join("")}</div>` : ""}</section>
      <section class="modal-section"><h3>Demo</h3>${demo ? `<div class="linked-record"><div><strong>${escapeHtml(demo.name)}</strong><span>${escapeHtml(demo.preview_url || "Preview not published")}</span></div>${badge(demo.status, demo.status.replaceAll("_", " "))}<button class="button button--secondary" data-action="open-studio" data-id="${demo.id}">Open Studio</button></div>` : `<div class="linked-record"><div><strong>No demo yet</strong><span>Create one from a reusable template.</span></div><button class="button button--primary" data-action="new-demo" data-lead-id="${lead.id}">Create demo</button></div>`}</section>
      <section class="modal-section"><h3>Emails</h3><div class="linked-stack">${drafts.map((draft) => `<button data-action="edit-draft" data-id="${draft.id}"><span><strong>${escapeHtml(draft.subject)}</strong><small>${draft.kind.replaceAll("_", " ")} · ${formatDate(draft.updated_at)}</small></span>${badge(draft.status, draft.status.replaceAll("_", " "))}</button>`).join("")}${threads.map((thread) => `<button data-action="open-thread" data-id="${thread.id}"><span><strong>${escapeHtml(thread.subject)}</strong><small>${escapeHtml(thread.sender_name || "")}</small></span>${badge(thread.classification, thread.classification.replaceAll("_", " "))}</button>`).join("") || `<p class="muted-copy">No stored email activity.</p>`}</div></section>
      <section class="modal-section"><h3>Activity</h3><div class="linked-stack">${events.slice(0, 6).map((event) => `<div><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail || "")}</small></span><time>${formatDate(event.created_at, { hour: "numeric", minute: "2-digit" })}</time></div>`).join("") || `<p class="muted-copy">No lead events.</p>`}</div></section>
      <section class="modal-section"><h3>Notes</h3><p class="message-preview">${escapeHtml(lead.notes || "No notes recorded.")}</p></section>
    `,
    footer: `${button("Close", { action: "close-modal", variant: "ghost" })}${button("Prepare outreach", { action: "compose-for-lead", iconName: "send", variant: "secondary", attrs: `data-id="${lead.id}"` })}${button("Edit lead", { action: "edit-lead", iconName: "pencil", variant: "primary", attrs: `data-id="${lead.id}"` })}`,
  });
}

export function openTaskForm(task = null) {
  const { data } = getState();
  openModal({
    title: task ? "Edit task" : "New task",
    subtitle: "Link operational work to the right business record",
    body: `<form id="task-form" data-form="task" ${task ? `data-id="${task.id}"` : ""}>
      <label class="field field--flush"><span>Title *</span><input name="title" required value="${escapeHtml(task?.title || "")}"></label>
      <label class="field"><span>Description</span><textarea name="description">${escapeHtml(task?.description || "")}</textarea></label>
      <div class="field-row"><label class="field"><span>Priority</span><select name="priority">${["low", "normal", "high", "urgent"].map((value) => option(value, value, task?.priority || "normal")).join("")}</select></label><label class="field"><span>Status</span><select name="status">${["pending", "in_progress", "completed", "cancelled"].map((value) => option(value, value.replaceAll("_", " "), task?.status || "pending")).join("")}</select></label></div>
      <label class="field"><span>Due</span><input name="due_at" type="datetime-local" value="${task?.due_at ? localDateTime(task.due_at) : localDateTime(new Date(Date.now() + 86400000))}"></label>
      <div class="field-row"><label class="field"><span>Lead</span><select name="lead_id">${relationOptions(data.leads, task?.lead_id, (item) => item.business_name)}</select></label><label class="field"><span>Client</span><select name="client_id">${relationOptions(data.clients, task?.client_id, (item) => data.leads.find((lead) => lead.id === item.lead_id)?.business_name || "Client")}</select></label></div>
      <label class="field"><span>Project</span><select name="project_id">${relationOptions(data.projects, task?.project_id, (item) => item.name)}</select></label>
      <label class="field"><span>Tags <small>comma-separated</small></span><input name="tags" value="${escapeHtml((task?.tags || []).join(", "))}"></label>
    </form>`,
    footer: footer("task-form", "Save task", task ? `<button class="button button--danger" data-action="request-delete" data-collection="tasks" data-id="${task.id}" data-label="${escapeHtml(task.title)}">Delete</button>` : ""),
  });
}

export function openNoteForm(note = null) {
  openModal({
    title: note ? "Edit note" : "New note",
    subtitle: "Internal business knowledge",
    wide: true,
    body: `<form id="note-form" data-form="note" ${note ? `data-id="${note.id}"` : ""}>
      <label class="field field--flush"><span>Title *</span><input name="title" required value="${escapeHtml(note?.title || "")}"></label>
      <div class="field-row"><label class="field"><span>Category</span><select name="category">${["sales", "lessons", "research", "procedure", "strategy", "prompt", "documentation", "general"].map((value) => option(value, value, note?.category || "general")).join("")}</select></label><label class="field"><span>Tags</span><input name="tags" value="${escapeHtml((note?.tags || []).join(", "))}" placeholder="sales, script"></label></div>
      <label class="field"><span>Content *</span><textarea class="note-editor" name="content" required>${escapeHtml(note?.content || "")}</textarea></label>
      <label class="check-field"><input type="checkbox" name="is_pinned" ${note?.is_pinned ? "checked" : ""}><span>Pin this note</span></label>
    </form>`,
    footer: footer("note-form", "Save note", note ? `<button class="button button--danger" data-action="archive-note" data-id="${note.id}">Archive</button>` : ""),
  });
}

export function openTemplateForm(template = null) {
  openModal({
    title: template ? "Edit template" : "Create template",
    subtitle: "Reusable HTML, CSS, and JavaScript site foundation",
    body: `<form id="template-form" data-form="template" ${template ? `data-id="${template.id}"` : ""}>
      <div class="field-row"><label class="field field--flush"><span>Name *</span><input name="name" required value="${escapeHtml(template?.name || "")}" placeholder="Timberline"></label><label class="field field--flush"><span>Category *</span><input name="category" required value="${escapeHtml(template?.category || "")}" placeholder="Tree Service"></label></div>
      <label class="field"><span>Description</span><textarea name="description">${escapeHtml(template?.description || "")}</textarea></label>
      <div class="field-row"><label class="field"><span>Layout key</span><input name="layout_key" value="${escapeHtml(template?.layout_key || "service-pro")}"></label><label class="field"><span>Accent</span><input name="accent_color" type="color" value="${escapeHtml(template?.accent_color || "#7c5cff")}"></label></div>
      <div class="field-row"><label class="field"><span>Status</span><select name="status">${["draft", "active", "archived"].map((value) => option(value, value, template?.status || "active")).join("")}</select></label><label class="field"><span>Preview URL</span><input name="preview_url" type="url" value="${escapeHtml(template?.preview_url || "")}"></label></div>
    </form>`,
    footer: footer("template-form", "Save template"),
  });
}

export function openDemoForm({ templateId = "", leadId = "" } = {}, demo = null) {
  const { data } = getState();
  const used = new Set(data.demos.filter((item) => !demo || item.id !== demo.id).map((item) => item.lead_id));
  const leads = data.leads.filter((lead) => !used.has(lead.id) || lead.id === leadId || lead.id === demo?.lead_id);
  openModal({
    title: demo ? "Edit demo" : "Create demo",
    subtitle: "Template plus prospect business configuration",
    body: `<form id="demo-form" data-form="demo" ${demo ? `data-id="${demo.id}"` : ""}>
      <label class="field field--flush"><span>Lead *</span><select name="lead_id" required><option value="">Select lead</option>${leads.map((lead) => option(lead.id, lead.business_name, demo?.lead_id || leadId)).join("")}</select></label>
      <label class="field"><span>Template *</span><select name="template_id" required><option value="">Select template</option>${data.templates.filter((item) => item.status !== "archived").map((item) => option(item.id, `${item.name} · ${item.category}`, demo?.template_id || templateId)).join("")}</select></label>
      <label class="field"><span>Name</span><input name="name" value="${escapeHtml(demo?.name || "")}" placeholder="Generated from lead name"></label>
      <div class="field-row"><label class="field"><span>Slug</span><input name="slug" value="${escapeHtml(demo?.slug || "")}" placeholder="generated-from-name"></label><label class="field"><span>Status</span><select name="status">${["draft", "ready", "sent", "viewed", "client_interested", "converted", "archived"].map((value) => option(value, value.replaceAll("_", " "), demo?.status || "draft")).join("")}</select></label></div>
      <label class="field"><span>Preview URL</span><input name="preview_url" type="url" value="${escapeHtml(demo?.preview_url || "")}" placeholder="https://preview.example.com/d/demo-slug"></label>
    </form>`,
    footer: footer("demo-form", demo ? "Save demo" : "Create demo"),
  });
}

export function openDemoDetails(demo) {
  const { data } = getState();
  const lead = data.leads.find((item) => item.id === demo.lead_id);
  const template = data.templates.find((item) => item.id === demo.template_id);
  const versions = data.demoVersions.filter((item) => item.demo_id === demo.id);
  openModal({
    title: demo.name,
    subtitle: lead?.business_name || "Unlinked lead",
    wide: true,
    body: `<div class="modal-summary"><div>${badge(demo.status, demo.status.replaceAll("_", " "))}${template ? badge("active", template.name) : ""}</div><strong>${Number(demo.qa_score || 0)}</strong><span>QA score</span></div>
      <dl class="detail-list detail-list--two"><div><dt>Slug</dt><dd><code class="id-code">${escapeHtml(demo.slug || "—")}</code></dd></div><div><dt>Preview</dt><dd>${demo.preview_url ? `<a class="text-link" href="${escapeHtml(demo.preview_url)}" target="_blank" rel="noreferrer">${escapeHtml(demo.preview_url)}</a>` : "Not published"}</dd></div><div><dt>Created</dt><dd>${formatDate(demo.created_at, { year: "numeric" })}</dd></div><div><dt>Viewed</dt><dd>${formatDate(demo.viewed_at, { year: "numeric" })}</dd></div></dl>
      <section class="modal-section"><h3>Versions</h3><div class="linked-stack">${versions.map((version) => `<div><span><strong>Version ${version.version_number}</strong><small>${escapeHtml(version.change_summary || version.storage_path)}</small></span>${version.is_current ? badge("connected", "Current") : ""}</div>`).join("") || `<p class="muted-copy">No uploaded bundles. Studio content is stored as configuration.</p>`}</div></section>`,
    footer: `${button("Archive", { action: "archive-demo", variant: "danger", attrs: `data-id="${demo.id}"` })}${button("Convert to client", { action: "convert-demo", variant: "secondary", attrs: `data-id="${demo.id}"` })}${button("Upload bundle", { action: "upload-demo", iconName: "upload", variant: "secondary", attrs: `data-id="${demo.id}"` })}${button("Open Studio", { action: "open-studio", iconName: "panels-top-left", variant: "primary", attrs: `data-id="${demo.id}"` })}`,
  });
}

export function openUploadForm(demoId) {
  openModal({
    title: "Upload demo version",
    subtitle: "Private, owner-scoped Supabase Storage",
    body: `<form id="upload-form" data-form="upload-demo" data-id="${demoId}"><label class="field field--flush"><span>Source bundle or asset *</span><input name="file" type="file" required accept=".zip,.html,.css,.js,.png,.jpg,.jpeg,.webp,.svg"></label><p class="field-hint" style="margin-top:12px">A version record is created after the private upload succeeds.</p></form>`,
    footer: footer("upload-form", "Upload version"),
  });
}

export function openDraftForm(draft) {
  const { data } = getState();
  openModal({
    title: "Edit outreach draft",
    subtitle: data.leads.find((lead) => lead.id === draft.lead_id)?.business_name || "Lead",
    wide: true,
    body: `<form id="draft-form" data-form="draft" data-id="${draft.id}"><label class="field field--flush"><span>Subject</span><input name="subject" required value="${escapeHtml(draft.subject)}"></label><label class="field"><span>Body</span><textarea class="message-editor" name="body" required>${escapeHtml(draft.body)}</textarea></label><label class="field"><span>Kind</span><select name="kind">${["initial", "follow_up", "reply"].map((value) => option(value, value, draft.kind)).join("")}</select></label></form>`,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--secondary" type="submit" form="draft-form" data-submit-mode="draft">Save draft</button><button class="button button--primary" type="submit" form="draft-form" data-submit-mode="approval">Request approval</button>`,
  });
}

export function openFollowUpForm(followUp = null) {
  const { data } = getState();
  openModal({
    title: followUp ? "Edit follow-up" : "Schedule follow-up",
    subtitle: "Persistent follow-up queue",
    body: `<form id="follow-up-form" data-form="follow-up" ${followUp ? `data-id="${followUp.id}"` : ""}>
      <label class="field field--flush"><span>Lead *</span><select name="lead_id" required><option value="">Select lead</option>${data.leads.map((lead) => option(lead.id, lead.business_name, followUp?.lead_id)).join("")}</select></label>
      <div class="field-row"><label class="field"><span>Attempt</span><input name="sequence_number" type="number" min="1" max="12" value="${Number(followUp?.sequence_number || 1)}"></label><label class="field"><span>Due *</span><input name="due_at" type="datetime-local" required value="${followUp?.due_at ? localDateTime(followUp.due_at) : localDateTime(new Date(Date.now() + 3 * 86400000))}"></label></div>
      <label class="field"><span>Suggested copy</span><textarea name="suggested_text">${escapeHtml(followUp?.suggested_text || "")}</textarea></label>
    </form>`,
    footer: footer("follow-up-form", "Save follow-up"),
  });
}

export function openClientForm(client = null, presetLeadId = "") {
  const { data } = getState();
  const eligible = data.leads.filter((lead) => !data.clients.some((item) => item.lead_id === lead.id && item.id !== client?.id));
  openModal({
    title: client ? "Edit client" : "Convert lead to client",
    subtitle: "Create the fulfillment and revenue handoff",
    body: `<form id="client-form" data-form="client" ${client ? `data-id="${client.id}"` : ""}>
      <label class="field field--flush"><span>Lead *</span><select name="lead_id" required><option value="">Select lead</option>${eligible.map((lead) => option(lead.id, `${lead.business_name} · ${lead.status}`, client?.lead_id || presetLeadId)).join("")}</select></label>
      <div class="field-row"><label class="field"><span>Contact</span><input name="contact_name" value="${escapeHtml(client?.contact_name || "")}"></label><label class="field"><span>Email</span><input name="email" type="email" value="${escapeHtml(client?.email || "")}"></label></div>
      <div class="field-row"><label class="field"><span>Phone</span><input name="phone" value="${escapeHtml(client?.phone || "")}"></label><label class="field"><span>Package</span><input name="package_name" value="${escapeHtml(client?.package_name || "Standard website")}"></label></div>
      <div class="field-row"><label class="field"><span>Sale price</span><input name="agreed_price" type="number" min="0" value="${Number(client?.agreed_price || 400)}"></label><label class="field"><span>Amount received</span><input name="amount_received" type="number" min="0" value="${Number(client?.amount_received || 0)}"></label></div>
      <div class="field-row"><label class="field"><span>Purchase date</span><input name="purchase_date" type="date" value="${client?.purchase_date || localDate()}"></label><label class="field"><span>Status</span><select name="status">${["onboarding", "active", "awaiting_content", "ready_to_launch", "completed", "paused"].map((value) => option(value, value.replaceAll("_", " "), client?.status || "onboarding")).join("")}</select></label></div>
      <div class="field-row"><label class="field"><span>Domain</span><input name="domain" value="${escapeHtml(client?.domain || "")}"></label><label class="field"><span>Production URL</span><input name="production_url" type="url" value="${escapeHtml(client?.production_url || "")}"></label></div>
      <label class="field"><span>Notes</span><textarea name="notes">${escapeHtml(client?.notes || "")}</textarea></label>
    </form>`,
    footer: footer("client-form", client ? "Save client" : "Create client"),
  });
}

export function openClientDetails(client) {
  const { data } = getState();
  const lead = data.leads.find((item) => item.id === client.lead_id);
  const site = data.clientSites.find((item) => item.client_id === client.id);
  const project = data.projects.find((item) => item.client_id === client.id);
  const maintenance = data.maintenanceSubscriptions.find((item) => item.client_id === client.id);
  const payments = data.payments.filter((item) => item.client_id === client.id);
  openModal({
    title: lead?.business_name || "Client",
    subtitle: client.contact_name || client.email || "Client details",
    wide: true,
    body: `<div class="detail-tabs"><span>Overview</span><span>Website</span><span>Project</span><span>Payments</span><span>Maintenance</span><span>Emails</span><span>Notes</span><span>Activity</span></div>
      <section class="modal-section"><h3>Overview</h3><dl class="detail-list detail-list--two"><div><dt>Contact</dt><dd>${escapeHtml(client.contact_name || "—")}</dd></div><div><dt>Email</dt><dd>${escapeHtml(client.email || "—")}</dd></div><div><dt>Phone</dt><dd>${escapeHtml(client.phone || "—")}</dd></div><div><dt>Sale price</dt><dd>${formatCurrency(client.agreed_price)}</dd></div><div><dt>Purchase</dt><dd>${formatDate(client.purchase_date, { year: "numeric" })}</dd></div><div><dt>Status</dt><dd>${badge(client.status, client.status.replaceAll("_", " "))}</dd></div></dl></section>
      <section class="modal-section"><h3>Website</h3><div class="linked-record"><div><strong>${escapeHtml(site?.name || "No client site")}</strong><span>${escapeHtml(site?.production_url || client.production_url || "Not live")}</span></div>${site ? badge(site.status, site.status) : ""}</div></section>
      <section class="modal-section"><h3>Project</h3>${project ? `<div class="linked-record"><div><strong>${escapeHtml(project.name)}</strong><span>${project.progress}% complete · deadline ${formatDate(project.deadline)}</span></div>${badge(project.status, project.status.replaceAll("_", " "))}</div>` : `<p class="muted-copy">No fulfillment project.</p>`}</section>
      <section class="modal-section"><h3>Payments</h3><div class="linked-stack">${payments.map((payment) => `<div><span><strong>${formatCurrency(payment.amount)}</strong><small>${payment.payment_type.replaceAll("_", " ")} · ${formatDate(payment.paid_at)}</small></span>${badge(payment.status, payment.status)}</div>`).join("") || `<p class="muted-copy">No payment records.</p>`}</div></section>
      <section class="modal-section"><h3>Maintenance</h3>${maintenance ? `<div class="linked-record"><div><strong>${escapeHtml(maintenance.plan_name)}</strong><span>${formatCurrency(maintenance.monthly_amount)}/month · next ${formatDate(maintenance.next_charge_on)}</span></div>${badge(maintenance.status, maintenance.status)}</div>` : `<p class="muted-copy">No maintenance plan.</p>`}</section>
      <section class="modal-section"><h3>Notes</h3><p class="message-preview">${escapeHtml(client.notes || "No client notes.")}</p></section>`,
    footer: `${button("Close", { action: "close-modal", variant: "ghost" })}${button("Edit client", { action: "edit-client", iconName: "pencil", variant: "primary", attrs: `data-id="${client.id}"` })}`,
  });
}

export function openProjectForm(project = null) {
  const { data } = getState();
  openModal({
    title: project ? "Edit project" : "New project",
    subtitle: "Client fulfillment",
    body: `<form id="project-form" data-form="project" ${project ? `data-id="${project.id}"` : ""}>
      <label class="field field--flush"><span>Client *</span><select name="client_id" required><option value="">Select client</option>${data.clients.map((client) => option(client.id, data.leads.find((lead) => lead.id === client.lead_id)?.business_name || "Client", project?.client_id)).join("")}</select></label>
      <label class="field"><span>Name *</span><input name="name" required value="${escapeHtml(project?.name || "")}"></label>
      <div class="field-row"><label class="field"><span>Status</span><select name="status">${["payment_received", "changes", "client_review", "domain_setup", "launch", "live", "paused"].map((value) => option(value, value.replaceAll("_", " "), project?.status || "payment_received")).join("")}</select></label><label class="field"><span>Deadline</span><input name="deadline" type="date" value="${project?.deadline || localDate(new Date(Date.now() + 14 * 86400000))}"></label></div>
      <label class="field"><span>Progress</span><input name="progress" type="number" min="0" max="100" value="${Number(project?.progress || 0)}"></label>
      <label class="field"><span>Requested edits <small>one per line</small></span><textarea name="requested_edits">${escapeHtml((project?.requested_edits || []).join("\n"))}</textarea></label>
      <label class="field"><span>Notes</span><textarea name="notes">${escapeHtml(project?.notes || "")}</textarea></label>
    </form>`,
    footer: footer("project-form", "Save project"),
  });
}

export function openMaintenanceForm(subscription = null) {
  const { data } = getState();
  openModal({
    title: subscription ? "Edit maintenance" : "Add maintenance plan",
    subtitle: "$50/month optional website care",
    body: `<form id="maintenance-form" data-form="maintenance" ${subscription ? `data-id="${subscription.id}"` : ""}>
      <label class="field field--flush"><span>Client *</span><select name="client_id" required><option value="">Select client</option>${data.clients.map((client) => option(client.id, data.leads.find((lead) => lead.id === client.lead_id)?.business_name || "Client", subscription?.client_id)).join("")}</select></label>
      <label class="field"><span>Site</span><select name="site_id">${relationOptions(data.clientSites, subscription?.site_id, (site) => site.name)}</select></label>
      <div class="field-row"><label class="field"><span>Plan</span><input name="plan_name" value="${escapeHtml(subscription?.plan_name || "Website Maintenance")}"></label><label class="field"><span>Monthly amount</span><input name="monthly_amount" type="number" min="0" value="${Number(subscription?.monthly_amount || 50)}"></label></div>
      <div class="field-row"><label class="field"><span>Status</span><select name="status">${["active", "inactive", "past_due", "cancelled"].map((value) => option(value, value.replaceAll("_", " "), subscription?.status || "active")).join("")}</select></label><label class="field"><span>Start</span><input name="started_on" type="date" value="${subscription?.started_on || localDate()}"></label></div>
      <div class="field-row"><label class="field"><span>Next charge</span><input name="next_charge_on" type="date" value="${subscription?.next_charge_on || localDate(new Date(Date.now() + 30 * 86400000))}"></label><label class="field"><span>Last payment</span><input name="last_payment_on" type="date" value="${subscription?.last_payment_on || ""}"></label></div>
      <label class="check-field"><input type="checkbox" name="hosting_included" ${subscription?.hosting_included !== false ? "checked" : ""}><span>Hosting included</span></label>
      <label class="check-field"><input type="checkbox" name="domain_managed" ${subscription?.domain_managed ? "checked" : ""}><span>Domain managed</span></label>
    </form>`,
    footer: footer("maintenance-form", "Save plan"),
  });
}

export function openPaymentForm(payment = null) {
  const { data } = getState();
  openModal({
    title: payment ? "Edit payment" : "Record payment",
    subtitle: "Manual record until Whop is connected",
    body: `<form id="payment-form" data-form="payment" ${payment ? `data-id="${payment.id}"` : ""}>
      <label class="field field--flush"><span>Customer name *</span><input name="customer_name" required value="${escapeHtml(payment?.customer_name || "")}"></label>
      <label class="field"><span>Client</span><select name="client_id">${relationOptions(data.clients, payment?.client_id, (client) => data.leads.find((lead) => lead.id === client.lead_id)?.business_name || "Client")}</select></label>
      <div class="field-row"><label class="field"><span>Type</span><select name="payment_type">${["website_sale", "maintenance"].map((value) => option(value, value.replaceAll("_", " "), payment?.payment_type || "website_sale")).join("")}</select></label><label class="field"><span>Status</span><select name="status">${["pending", "paid", "available", "failed", "refunded"].map((value) => option(value, value, payment?.status || "paid")).join("")}</select></label></div>
      <div class="field-row"><label class="field"><span>Amount</span><input name="amount" type="number" min="0" step=".01" required value="${Number(payment?.amount || 400)}"></label><label class="field"><span>Fee</span><input name="fee_amount" type="number" min="0" step=".01" value="${Number(payment?.fee_amount || 0)}"></label></div>
      <div class="field-row"><label class="field"><span>Date</span><input name="paid_at" type="datetime-local" value="${payment?.paid_at ? localDateTime(payment.paid_at) : localDateTime()}"></label><label class="field"><span>Transaction ID</span><input name="external_transaction_id" value="${escapeHtml(payment?.external_transaction_id || "")}" placeholder="placeholder"></label></div>
    </form>`,
    footer: footer("payment-form", "Save payment"),
  });
}

export function openExpenseForm(expense = null) {
  const { data } = getState();
  openModal({
    title: expense ? "Edit expense" : "Add expense",
    subtitle: "Operating cost",
    body: `<form id="expense-form" data-form="expense" ${expense ? `data-id="${expense.id}"` : ""}>
      <div class="field-row"><label class="field field--flush"><span>Category</span><select name="category">${["hosting", "domains", "apis", "software", "payment_fees", "ai", "other"].map((value) => option(value, value.replaceAll("_", " "), expense?.category || "software")).join("")}</select></label><label class="field field--flush"><span>Date</span><input name="occurred_on" type="date" value="${expense?.occurred_on || localDate()}"></label></div>
      <div class="field-row"><label class="field"><span>Vendor</span><input name="vendor" value="${escapeHtml(expense?.vendor || "")}"></label><label class="field"><span>Amount</span><input name="amount" type="number" min="0" step=".01" required value="${Number(expense?.amount || 0)}"></label></div>
      <label class="field"><span>Description *</span><input name="description" required value="${escapeHtml(expense?.description || "")}"></label>
      <div class="field-row"><label class="field"><span>Lead</span><select name="lead_id">${relationOptions(data.leads, expense?.lead_id, (lead) => lead.business_name)}</select></label><label class="field"><span>Client</span><select name="client_id">${relationOptions(data.clients, expense?.client_id, (client) => data.leads.find((lead) => lead.id === client.lead_id)?.business_name || "Client")}</select></label></div>
    </form>`,
    footer: footer("expense-form", "Save expense"),
  });
}

export function openPricingForm(experiment = null) {
  openModal({
    title: experiment ? "Edit pricing experiment" : "New pricing experiment",
    subtitle: "Optimize for revenue, not conversion alone",
    body: `<form id="pricing-form" data-form="pricing" ${experiment ? `data-id="${experiment.id}"` : ""}>
      <label class="field field--flush"><span>Name *</span><input name="name" required value="${escapeHtml(experiment?.name || "")}" placeholder="$700 premium test"></label>
      <div class="field-row"><label class="field"><span>Offer amount</span><input name="offer_amount" type="number" min="0" value="${Number(experiment?.offer_amount || 700)}"></label><label class="field"><span>Status</span><select name="status">${["draft", "active", "paused", "complete"].map((value) => option(value, value, experiment?.status || "draft")).join("")}</select></label></div>
      <div class="field-row"><label class="field"><span>Emails</span><input name="sent_count" type="number" min="0" value="${Number(experiment?.sent_count || 0)}"></label><label class="field"><span>Replies</span><input name="reply_count" type="number" min="0" value="${Number(experiment?.reply_count || 0)}"></label></div>
      <div class="field-row"><label class="field"><span>Sales</span><input name="close_count" type="number" min="0" value="${Number(experiment?.close_count || 0)}"></label><label class="field"><span>Revenue</span><input name="revenue" type="number" min="0" value="${Number(experiment?.revenue || 0)}"></label></div>
    </form>`,
    footer: footer("pricing-form", "Save experiment"),
  });
}

export function openCalendarForm(date = "", event = null) {
  const { data } = getState();
  const starts = event?.starts_at || (date ? `${date}T09:00:00` : new Date(Date.now() + 3600000));
  openModal({
    title: event ? "Edit calendar event" : "New calendar event",
    subtitle: "Lightweight business calendar",
    body: `<form id="calendar-form" data-form="calendar" ${event ? `data-id="${event.id}"` : ""}>
      <label class="field field--flush"><span>Title *</span><input name="title" required value="${escapeHtml(event?.title || "")}"></label>
      <div class="field-row"><label class="field"><span>Type</span><select name="event_type">${["follow_up", "call", "deadline", "launch", "maintenance", "task", "other"].map((value) => option(value, value.replaceAll("_", " "), event?.event_type || "call")).join("")}</select></label><label class="field"><span>Starts</span><input name="starts_at" type="datetime-local" required value="${localDateTime(starts)}"></label></div>
      <div class="field-row"><label class="field"><span>Lead</span><select name="lead_id">${relationOptions(data.leads, event?.lead_id, (lead) => lead.business_name)}</select></label><label class="field"><span>Client</span><select name="client_id">${relationOptions(data.clients, event?.client_id, (client) => data.leads.find((lead) => lead.id === client.lead_id)?.business_name || "Client")}</select></label></div>
      <label class="field"><span>Notes</span><textarea name="notes">${escapeHtml(event?.notes || "")}</textarea></label>
      <label class="check-field"><input type="checkbox" name="all_day" ${event?.all_day ? "checked" : ""}><span>All day</span></label>
    </form>`,
    footer: footer("calendar-form", "Save event"),
  });
}

export function openDiscoveryDetails(result) {
  const lead = result.normalized_data || {};
  const source = result.raw_source_metadata?.openscout || lead.source_metadata?.openscout || {};
  openModal({
    title: result.business_name,
    subtitle: "OpenScout normalized candidate",
    wide: true,
    body: `<div class="modal-summary"><div>${badge(result.decision, result.decision)}${badge(lead.has_website ? "warning" : "connected", result.website_status || "No website")}</div><strong>${Number(result.lead_score || 0)}</strong><span>lead score</span></div>
      <dl class="detail-list detail-list--two"><div><dt>Category</dt><dd>${escapeHtml(lead.category || "—")}</dd></div><div><dt>Location</dt><dd>${escapeHtml([lead.city, lead.region].filter(Boolean).join(", ") || "—")}</dd></div><div><dt>Phone</dt><dd>${escapeHtml(lead.phone || "—")}</dd></div><div><dt>Email</dt><dd>${escapeHtml(lead.email || "Not supplied by OpenScout")}</dd></div><div><dt>Source key</dt><dd><code class="id-code">${escapeHtml(result.source_key || "—")}</code></dd></div><div><dt>Rating</dt><dd>${escapeHtml(source.rating ?? "—")} · ${escapeHtml(source.ratingCount ?? 0)} reviews</dd></div><div><dt>Verification</dt><dd>${escapeHtml(source.verification || "Not recorded")}</dd></div><div><dt>Duplicates merged</dt><dd>${Number(source.mergedFrom || 1)}</dd></div></dl>
      <section class="modal-section"><h3>Why OpenScout retained this listing</h3><div class="source-reasons">${(source.reasons || []).map((reason) => `<span>${icon("check")} ${escapeHtml(reason)}</span>`).join("") || `<span>No explanation metadata was recorded.</span>`}</div></section>
      <section class="modal-section"><h3>Raw debugging metadata</h3><pre class="metadata-block">${escapeHtml(JSON.stringify(result.raw_source_metadata || {}, null, 2))}</pre></section>`,
    footer: `${button("Close", { action: "close-modal", variant: "ghost" })}${result.decision === "pending" ? button("Reject", { action: "reject-discovery", variant: "danger", attrs: `data-id="${result.id}"` }) + button("Save lead", { action: "save-discovery", variant: "primary", attrs: `data-id="${result.id}"` }) : ""}`,
  });
}

export function openApprovalDetails(approval) {
  openModal({
    title: approval.title,
    subtitle: `${approval.approval_type.replaceAll("_", " ")} · ${approval.risk_level} risk`,
    body: `<p class="message-preview">${escapeHtml(approval.summary || "No summary.")}</p><section class="modal-section"><h3>Payload</h3><pre class="metadata-block">${escapeHtml(JSON.stringify(approval.payload || {}, null, 2))}</pre></section>`,
    footer: `${button("Close", { action: "close-modal", variant: "ghost" })}${button("Reject", { action: "resolve-approval", variant: "danger", attrs: `data-id="${approval.id}" data-status="rejected"` })}${button("Approve", { action: "resolve-approval", variant: "primary", attrs: `data-id="${approval.id}" data-status="approved"` })}`,
  });
}

export function openDeploymentLogs(deployment) {
  openModal({
    title: `${deployment.domain || "Deployment"} logs`,
    subtitle: `Version ${deployment.version || "—"} · ${deployment.status}`,
    body: `<div class="log-view">${(deployment.logs || []).map((item) => `<div><time>${formatDate(item.at, { hour: "numeric", minute: "2-digit" })}</time><span>${escapeHtml(item.message || JSON.stringify(item))}</span></div>`).join("") || `<p class="muted-copy">No deployment logs recorded.</p>`}</div>`,
    footer: button("Close", { action: "close-modal", variant: "primary" }),
  });
}
