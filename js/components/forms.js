import { PIPELINE_STAGES } from "../config.js";
import { icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, relativeTime, statusLabel } from "../core/utils.js";
import { badge, button, openModal } from "./ui.js";

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function leadOptions(selected = "", filter = () => true) {
  return getState().data.leads
    .filter(filter)
    .map((lead) => option(lead.id, lead.business_name, selected))
    .join("");
}

export function openLeadForm(lead = null) {
  const editing = Boolean(lead);
  openModal({
    title: editing ? "Edit prospect" : "New lead",
    subtitle: editing ? lead.business_name : "Manual entry into the shared lead pipeline",
    wide: true,
    body: `
      <form id="lead-form" data-form="lead" data-id="${lead?.id || ""}">
        <div class="field-row">
          <label class="field" style="margin-top:0"><span>Business name *</span><input name="business_name" value="${escapeHtml(lead?.business_name || "")}" required autofocus></label>
          <label class="field" style="margin-top:0"><span>Category</span><input name="category" value="${escapeHtml(lead?.category || "")}" placeholder="Tree service"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Contact name</span><input name="contact_name" value="${escapeHtml(lead?.contact_name || "")}" placeholder="Owner or manager"></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${escapeHtml(lead?.email || "")}" placeholder="owner@business.com"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Phone</span><input name="phone" value="${escapeHtml(lead?.phone || "")}" placeholder="(817) 555-0100"></label>
          <label class="field"><span>Website</span><input name="website_url" type="url" value="${escapeHtml(lead?.website_url || "")}" placeholder="https://…"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>City</span><input name="city" value="${escapeHtml(lead?.city || "")}" placeholder="North Richland Hills"></label>
          <label class="field"><span>Region</span><input name="region" value="${escapeHtml(lead?.region || "TX")}" placeholder="TX"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Stage</span><select name="status">${[
            ["discovered", "New / discovered"], ["qualified", "Qualified"], ["analyzed", "Analyzed"],
            ["demo_building", "Demo building"], ["qa", "QA"], ["ready_to_contact", "Ready to contact"],
            ["contacted", "Contacted"], ["replied", "Replied"], ["follow_up", "Follow-up"], ["won", "Won"], ["lost", "Lost"],
          ].map(([value, label]) => option(value, label, lead?.status || "discovered")).join("")}</select></label>
          <label class="field"><span>Priority</span><select name="priority">${["low", "normal", "high"].map((value) => option(value, value[0].toUpperCase() + value.slice(1), lead?.priority || "normal")).join("")}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Qualification score</span><input name="qualification_score" type="number" min="0" max="100" value="${lead?.qualification_score || 0}"></label>
          <label class="field"><span>Opportunity score</span><input name="opportunity_score" type="number" min="0" max="100" value="${lead?.opportunity_score || 0}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Offer price</span><input name="asking_price" type="number" min="0" step="1" value="${lead?.asking_price || 400}"></label>
          <label class="field"><span>Source</span><select name="source">${["manual", "OpenScout", "referral", "other"].map((value) => option(value, value, lead?.source || "manual")).join("")}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Next action</span><input name="next_action" value="${escapeHtml(lead?.next_action || "")}" placeholder="Choose template"></label>
          <label class="field"><span>Action due</span><input name="next_action_at" type="datetime-local" value="${localDateTime(lead?.next_action_at)}"></label>
        </div>
        <label class="field"><span>Tags</span><input name="tags" value="${escapeHtml((lead?.tags || []).join(", "))}" placeholder="no website, strong reviews"></label>
      </form>
    `,
    footer: `${editing ? button("Delete", { action: "delete-lead", variant: "danger", attrs: `data-id="${lead.id}" style="margin-right:auto"` }) : ""}${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="lead-form">${editing ? "Save changes" : "Add lead"}</button>`,
  });
}

export function openLeadDetails(lead) {
  const { data } = getState();
  const analysis = data.analyses.find((item) => item.lead_id === lead.id);
  const demo = data.demos.find((item) => item.lead_id === lead.id);
  const drafts = data.drafts.filter((item) => item.lead_id === lead.id);
  const costs = data.costEvents.filter((item) => item.lead_id === lead.id).reduce((total, item) => total + Number(item.amount || 0), 0);
  openModal({
    title: lead.business_name,
    subtitle: [lead.category, lead.city, lead.region].filter(Boolean).join(" · "),
    wide: true,
    body: `
      <div class="grid grid--3">
        <div class="card"><div class="card__body"><span class="eyebrow">Stage</span><div style="margin-top:9px">${badge(lead.status)}</div><p style="margin-top:10px;color:var(--muted);font-size:9px">${escapeHtml(lead.next_action || "No next action")}</p></div></div>
        <div class="card"><div class="card__body"><span class="eyebrow">Scores</span><strong style="display:block;margin-top:8px;font-size:22px">${lead.qualification_score || 0} <small style="font-size:9px;color:var(--muted)">qualification</small></strong><p style="color:var(--muted);font-size:9px">${lead.opportunity_score || 0} opportunity</p></div></div>
        <div class="card"><div class="card__body"><span class="eyebrow">Prospect cost</span><strong style="display:block;margin-top:8px;font-size:22px">${formatCurrency(costs, 2)}</strong><p style="color:var(--muted);font-size:9px">Offer ${formatCurrency(lead.asking_price || 400)}</p></div></div>
      </div>
      <div class="grid grid--2" style="margin-top:13px">
        <article class="card">
          <header class="card__head"><div><h3>Contact & source</h3></div></header>
          <div class="card__body settings-list">
            <div class="settings-row"><div><strong>Contact</strong><p>${escapeHtml(lead.contact_name || "Not found")}</p></div></div>
            <div class="settings-row"><div><strong>Email</strong><p>${escapeHtml(lead.email || "Not found")}</p></div></div>
            <div class="settings-row"><div><strong>Phone</strong><p>${escapeHtml(lead.phone || "Not found")}</p></div></div>
            <div class="settings-row"><div><strong>Website</strong><p>${escapeHtml(lead.website_url || "No owned website")}</p></div></div>
            <div class="settings-row"><div><strong>Source</strong><p>${escapeHtml(lead.source || "manual")}</p></div></div>
          </div>
        </article>
        <article class="card">
          <header class="card__head"><div><h3>Fulfillment state</h3></div></header>
          <div class="card__body settings-list">
            <div class="settings-row"><div><strong>Analysis</strong><p>${analysis ? escapeHtml(analysis.opportunity_summary || "Complete") : "Not completed"}</p></div>${badge(analysis ? "approved" : "pending", analysis ? "Ready" : "Waiting")}</div>
            <div class="settings-row"><div><strong>Demo</strong><p>${demo ? escapeHtml(demo.name) : "Not created"}</p></div>${badge(demo?.status || "pending", demo ? statusLabel(demo.status) : "Waiting")}</div>
            <div class="settings-row"><div><strong>Outreach drafts</strong><p>${drafts.length} message${drafts.length === 1 ? "" : "s"} tracked</p></div>${badge(drafts.some((item) => item.status === "pending_approval") ? "pending" : "active", drafts.some((item) => item.status === "pending_approval") ? "Needs approval" : "Clear")}</div>
          </div>
        </article>
      </div>
    `,
    footer: `${button("Edit", { action: "edit-lead", iconName: "pencil", attrs: `data-id="${lead.id}"` })}${button("Compose email", { action: "new-draft", iconName: "send", attrs: `data-lead-id="${lead.id}"` })}${button("Close", { action: "close-modal", variant: "primary" })}`,
  });
}

export function openTemplateForm(template = null) {
  openModal({
    title: template ? "Edit template" : "New template",
    subtitle: "Reusable design system entry",
    body: `
      <form id="template-form" data-form="template" data-id="${template?.id || ""}">
        <label class="field" style="margin-top:0"><span>Name *</span><input name="name" required value="${escapeHtml(template?.name || "")}" placeholder="Local Service Pro"></label>
        <label class="field"><span>Category *</span><input name="category" required value="${escapeHtml(template?.category || "")}" placeholder="Home services"></label>
        <label class="field"><span>Description</span><textarea name="description" placeholder="What makes this template useful?">${escapeHtml(template?.description || "")}</textarea></label>
        <div class="field-row">
          <label class="field"><span>Accent color</span><input name="accent_color" type="color" value="${escapeHtml(template?.accent_color || "#7c5cff")}"></label>
          <label class="field"><span>Layout key</span><input name="layout_key" value="${escapeHtml(template?.layout_key || "standard")}"></label>
        </div>
        <label class="field"><span>Preview URL</span><input name="preview_url" type="url" value="${escapeHtml(template?.preview_url || "")}" placeholder="https://…"></label>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="template-form">${template ? "Save template" : "Create template"}</button>`,
  });
}

export function openDemoForm({ templateId = "", leadId = "" } = {}) {
  const { data } = getState();
  const eligible = data.leads.filter((lead) => !data.demos.some((demo) => demo.lead_id === lead.id));
  openModal({
    title: "Create demo",
    subtitle: "Tie one prospect to one reusable template",
    body: `
      <form id="demo-form" data-form="demo">
        <label class="field" style="margin-top:0"><span>Prospect *</span><select name="lead_id" required><option value="">Select a prospect</option>${eligible.map((lead) => option(lead.id, lead.business_name, leadId)).join("")}</select></label>
        <label class="field"><span>Template *</span><select name="template_id" required><option value="">Select a template</option>${data.templates.filter((item) => item.is_active).map((template) => option(template.id, template.name, templateId)).join("")}</select></label>
        <label class="field"><span>Demo name</span><input name="name" placeholder="Business Name Demo"></label>
        <label class="field"><span>Primary conversion goal</span><input name="goal" placeholder="Generate quote requests"></label>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="demo-form" ${eligible.length && data.templates.length ? "" : "disabled"}>Create demo</button>`,
  });
}

export function openDemoDetails(demo) {
  const { data } = getState();
  const lead = data.leads.find((item) => item.id === demo.lead_id);
  const template = data.templates.find((item) => item.id === demo.template_id);
  const versions = data.demoVersions.filter((item) => item.demo_id === demo.id).sort((a, b) => b.version_number - a.version_number);
  openModal({
    title: demo.name,
    subtitle: `${lead?.business_name || "Unknown prospect"} · ${template?.name || "No template"}`,
    wide: true,
    body: `
      <div class="grid grid--3">
        <div class="card"><div class="card__body"><span class="eyebrow">Status</span><div style="margin-top:9px">${badge(demo.status)}</div></div></div>
        <div class="card"><div class="card__body"><span class="eyebrow">QA score</span><strong style="display:block;margin-top:7px;font-size:24px">${demo.qa_score || 0}</strong></div></div>
        <div class="card"><div class="card__body"><span class="eyebrow">Versions</span><strong style="display:block;margin-top:7px;font-size:24px">${versions.length}</strong></div></div>
      </div>
      <article class="card" style="margin-top:13px">
        <header class="card__head"><div><h3>Stored source versions</h3><p>Private Supabase Storage objects</p></div>${button("Upload", { action: "upload-demo", iconName: "upload", attrs: `data-id="${demo.id}"` })}</header>
        ${versions.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Version</th><th>Change</th><th>Path</th><th>Created</th></tr></thead><tbody>${versions.map((version) => `
          <tr><td>${badge(version.is_current ? "active" : "pending", `v${version.version_number}${version.is_current ? " · current" : ""}`)}</td><td>${escapeHtml(version.change_summary || "No summary")}</td><td>${escapeHtml(version.storage_path)}</td><td>${relativeTime(version.created_at)}</td></tr>
        `).join("")}</tbody></table></div>` : `<div class="empty-state" style="min-height:180px"><p>No source bundle uploaded.</p></div>`}
      </article>
    `,
    footer: `${button("Close", { action: "close-modal", variant: "primary" })}`,
  });
}

export function openDraftForm(draft = null, leadId = "") {
  const selectedLead = draft?.lead_id || leadId;
  const lead = getState().data.leads.find((item) => item.id === selectedLead);
  const defaultSubject = lead ? `I made a website for ${lead.business_name}` : "";
  const defaultBody = lead ? `Hey${lead.contact_name ? ` ${lead.contact_name}` : ""},\n\nI came across ${lead.business_name} and noticed you didn’t have a website, so I went ahead and made one for you.\n\nHere’s the preview: [link]\n\nIf you like it, I can customize anything you want, connect your domain, and get the full site live.\n\nI charge a one-time fee of $400. \nIf you don’t like it, you don’t pay. \n\nInterested?\n\nConnor` : "";
  openModal({
    title: draft ? "Edit email draft" : "Compose email",
    subtitle: "Nothing sends from this screen",
    wide: true,
    body: `
      <form id="draft-form" data-form="draft" data-id="${draft?.id || ""}">
        <div class="field-row">
          <label class="field" style="margin-top:0"><span>Prospect *</span><select name="lead_id" required><option value="">Select prospect</option>${leadOptions(selectedLead)}</select></label>
          <label class="field" style="margin-top:0"><span>Message type</span><select name="kind">${["initial", "follow_up", "reply"].map((value) => option(value, value.replace("_", " "), draft?.kind || "initial")).join("")}</select></label>
        </div>
        <label class="field"><span>Subject *</span><input name="subject" required value="${escapeHtml(draft?.subject || defaultSubject)}"></label>
        <label class="field"><span>Body *</span><textarea name="body" required style="min-height:290px">${escapeHtml(draft?.body || defaultBody)}</textarea></label>
        <div style="display:flex;align-items:center;gap:8px;margin-top:11px;color:var(--muted);font-size:9px">${icon("shield-check")}Submitting creates an approval; it does not send email.</div>
      </form>
    `,
    footer: `${button("Save draft", { action: "save-draft-only" })}<button class="button button--primary" type="submit" form="draft-form">Submit for approval</button>`,
  });
}

export function openCommunicationForm() {
  openModal({
    title: "Log inbound reply",
    subtitle: "Manual bridge until Gmail sync is connected",
    body: `
      <form id="communication-form" data-form="communication">
        <label class="field" style="margin-top:0"><span>Prospect *</span><select name="lead_id" required><option value="">Select prospect</option>${leadOptions("")}</select></label>
        <label class="field"><span>Subject</span><input name="subject" placeholder="Re: Website preview"></label>
        <label class="field"><span>Reply preview *</span><textarea name="body_preview" required></textarea></label>
        <div class="field-row">
          <label class="field"><span>Sentiment</span><select name="sentiment">${["positive", "neutral", "negative", "unknown"].map((value) => option(value, value, "unknown")).join("")}</select></label>
          <label class="field"><span>Classification</span><select name="reply_classification">${["interested_revision", "interested", "question", "not_now", "not_interested", "unclear"].map((value) => option(value, value.replaceAll("_", " "), "unclear")).join("")}</select></label>
        </div>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="communication-form">Log reply</button>`,
  });
}

export function openFollowUpForm() {
  openModal({
    title: "Schedule follow-up",
    subtitle: "No calendar required",
    body: `
      <form id="follow-up-form" data-form="follow-up">
        <label class="field" style="margin-top:0"><span>Prospect *</span><select name="lead_id" required><option value="">Select prospect</option>${leadOptions("", (lead) => ["contacted", "follow_up", "replied"].includes(lead.status))}</select></label>
        <div class="field-row">
          <label class="field"><span>Sequence step</span><input name="sequence_number" type="number" min="1" max="12" value="1"></label>
          <label class="field"><span>Due *</span><input name="due_at" type="datetime-local" required value="${localDateTime(new Date(Date.now() + 2 * 86400000))}"></label>
        </div>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="follow-up-form">Schedule</button>`,
  });
}

export function openAnalysisForm() {
  const { data } = getState();
  const candidates = data.leads.filter((lead) => !data.analyses.some((analysis) => analysis.lead_id === lead.id));
  openModal({
    title: "Record analysis",
    subtitle: "Manual evidence capture until collectors are connected",
    wide: true,
    body: `
      <form id="analysis-form" data-form="analysis">
        <label class="field" style="margin-top:0"><span>Prospect *</span><select name="lead_id" required><option value="">Select prospect</option>${candidates.map((lead) => option(lead.id, lead.business_name, "")).join("")}</select></label>
        <div class="field-row">
          <label class="field"><span>Website score</span><input name="website_score" type="number" min="0" max="100" value="0"></label>
          <label class="field"><span>Review score</span><input name="review_score" type="number" min="0" max="100" value="80"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Website findings</span><textarea name="website_findings" placeholder="One finding per line"></textarea></label>
          <label class="field"><span>Review findings</span><textarea name="review_findings" placeholder="One finding per line"></textarea></label>
        </div>
        <label class="field"><span>Opportunity summary *</span><textarea name="opportunity_summary" required></textarea></label>
        <label class="field"><span>Recommended template</span><input name="recommended_template" placeholder="Local Service Pro"></label>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="analysis-form" ${candidates.length ? "" : "disabled"}>Save analysis</button>`,
  });
}

export function openPricingForm() {
  openModal({
    title: "New pricing experiment",
    subtitle: "Define the offer before collecting results",
    body: `
      <form id="pricing-form" data-form="pricing">
        <label class="field" style="margin-top:0"><span>Name *</span><input name="name" required placeholder="$700 test"></label>
        <label class="field"><span>Offer amount *</span><input name="offer_amount" type="number" min="0" step="1" value="700" required></label>
        <label class="field"><span>Status</span><select name="status">${["draft", "active", "paused"].map((value) => option(value, value, "draft")).join("")}</select></label>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="pricing-form">Create experiment</button>`,
  });
}

export function openTransactionForm(scope = "business") {
  openModal({
    title: "Add transaction",
    subtitle: `${scope[0].toUpperCase() + scope.slice(1)} ledger`,
    body: `
      <form id="transaction-form" data-form="transaction">
        <input type="hidden" name="scope" value="${scope}">
        <div class="field-row">
          <label class="field" style="margin-top:0"><span>Type</span><select name="kind">${["income", "expense", "transfer"].map((value) => option(value, value, "expense")).join("")}</select></label>
          <label class="field" style="margin-top:0"><span>Date</span><input name="occurred_on" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        </div>
        <label class="field"><span>Description *</span><input name="description" required></label>
        <div class="field-row">
          <label class="field"><span>Category *</span><input name="category" required placeholder="Software"></label>
          <label class="field"><span>Amount *</span><input name="amount" type="number" min="0" step="0.01" required></label>
        </div>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="transaction-form">Add transaction</button>`,
  });
}

export function openGoalForm() {
  openModal({
    title: "New savings goal",
    subtitle: "Personal target",
    body: `
      <form id="goal-form" data-form="goal">
        <label class="field" style="margin-top:0"><span>Name *</span><input name="name" required placeholder="New laptop"></label>
        <div class="field-row">
          <label class="field"><span>Target amount *</span><input name="target_amount" type="number" min="1" step="1" required></label>
          <label class="field"><span>Already saved</span><input name="current_amount" type="number" min="0" step="1" value="0"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Target date</span><input name="target_date" type="date"></label>
          <label class="field"><span>Color</span><input name="color" type="color" value="#7c5cff"></label>
        </div>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="goal-form">Add goal</button>`,
  });
}

export function openClientForm() {
  const { data } = getState();
  const won = data.leads.filter((lead) => lead.status === "won" && !data.clients.some((client) => client.lead_id === lead.id));
  openModal({
    title: "Convert won lead",
    subtitle: "Create the fulfillment handoff",
    body: `
      <form id="client-form" data-form="client">
        <label class="field" style="margin-top:0"><span>Won prospect *</span><select name="lead_id" required><option value="">Select prospect</option>${won.map((lead) => option(lead.id, lead.business_name, "")).join("")}</select></label>
        <label class="field"><span>Package</span><input name="package_name" value="Standard website"></label>
        <div class="field-row">
          <label class="field"><span>Agreed price</span><input name="agreed_price" type="number" min="0" value="400"></label>
          <label class="field"><span>Received</span><input name="amount_received" type="number" min="0" value="0"></label>
        </div>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="client-form" ${won.length ? "" : "disabled"}>Create client</button>`,
  });
}

export function openClientHandoff(client) {
  const lead = getState().data.leads.find((item) => item.id === client.lead_id);
  const checklist = client.handoff_checklist || {};
  openModal({
    title: `${lead?.business_name || "Client"} handoff`,
    subtitle: "Finish the site and launch",
    body: `
      <form id="client-handoff-form" data-form="client-handoff" data-id="${client.id}">
        <label class="field" style="margin-top:0"><span>Status</span><select name="status">${["onboarding", "active", "awaiting_content", "ready_to_launch", "completed", "paused"].map((value) => option(value, value.replaceAll("_", " "), client.status)).join("")}</select></label>
        <div class="field-row">
          <label class="field"><span>Domain</span><input name="domain" value="${escapeHtml(client.domain || "")}" placeholder="business.com"></label>
          <label class="field"><span>Production URL</span><input name="production_url" type="url" value="${escapeHtml(client.production_url || "")}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Agreed price</span><input name="agreed_price" type="number" min="0" value="${client.agreed_price || 0}"></label>
          <label class="field"><span>Amount received</span><input name="amount_received" type="number" min="0" value="${client.amount_received || 0}"></label>
        </div>
        <div class="card" style="margin-top:16px"><div class="card__body">
          <span class="eyebrow">Launch checklist</span>
          ${[["content", "Final content approved"], ["domain", "Domain connected"], ["payment", "Payment recorded"], ["launch", "Production site launched"]].map(([key, label]) => `<label style="display:flex;align-items:center;gap:9px;margin-top:12px;color:var(--text-soft);font-size:10px"><input type="checkbox" name="${key}" ${checklist[key] ? "checked" : ""} style="width:16px;height:16px">${label}</label>`).join("")}
        </div></div>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="client-handoff-form">Save handoff</button>`,
  });
}

export function openCostLimitForm() {
  const current = getState().data.profile?.preferences?.daily_cost_limit || 5;
  openModal({
    title: "Daily cost guardrail",
    subtitle: "Warnings and future agent pauses use this limit",
    body: `<form id="cost-limit-form" data-form="cost-limit"><label class="field" style="margin-top:0"><span>Daily limit</span><input name="daily_cost_limit" type="number" min="0.1" step="0.1" value="${current}" required></label></form>`,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="cost-limit-form">Save limit</button>`,
  });
}

export function openUploadForm(demoId) {
  openModal({
    title: "Upload demo version",
    subtitle: "Stored privately in Supabase Storage",
    body: `
      <form id="upload-form" data-form="upload-demo" data-id="${demoId}">
        <label class="field" style="margin-top:0"><span>Source bundle or asset *</span><input name="file" type="file" required accept=".zip,.html,.css,.js,.png,.jpg,.jpeg,.webp,.svg"></label>
        <p style="margin-top:11px;color:var(--muted);font-size:9px">Maximum 50 MB. The private bucket path is scoped to your authenticated user ID.</p>
      </form>
    `,
    footer: `${button("Cancel", { action: "close-modal", variant: "ghost" })}<button class="button button--primary" type="submit" form="upload-form">Upload version</button>`,
  });
}

