import { pageHead } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml, sum } from "../core/utils.js";
import {
  badge,
  button,
  byId,
  compactMetric,
  formatDate,
  icon,
  leadName,
  linkOut,
  primaryCell,
  renderPillList,
  sectionCard,
  statusLabel,
  tableEmpty,
} from "./shared.js";

const SECTIONS = [
  ["hero", "Hero"],
  ["services", "Services"],
  ["about", "About"],
  ["gallery", "Gallery"],
  ["testimonials", "Testimonials"],
  ["contact", "Contact"],
];

function selectedDemo(data, routeParams) {
  return byId(data.demos, routeParams.demo) || data.demos[0] || null;
}

function studioPreview(data, demo) {
  const lead = demo ? byId(data.leads, demo.lead_id) : null;
  const business = demo?.business_info || {};
  const content = demo?.content || {};
  const theme = demo?.theme || {};
  const services = Array.isArray(content.services) ? content.services : ["Primary service", "Emergency help", "Free estimates"];
  const hidden = new Set(content.hidden_sections || []);
  return `
    <div class="site-preview" style="--site-primary:${escapeHtml(theme.primary || "#172437")};--site-accent:${escapeHtml(theme.accent || "#6fb87b")}">
      <header><strong>${escapeHtml(business.name || lead?.business_name || "Business Name")}</strong><nav><span>Services</span><span>About</span><span>Contact</span></nav><button>Get an estimate</button></header>
      ${hidden.has("hero") ? "" : `<section class="site-hero"><div><span>Trusted local service</span><h1>${escapeHtml(content.headline || `${lead?.business_name || "Your business"} — local service done right`)}</h1><p>${escapeHtml(content.description || `Reliable ${lead?.category?.toLowerCase() || "service"} work with straightforward communication and careful attention to detail.`)}</p><div><button>Call ${escapeHtml(business.phone || lead?.phone || "today")}</button><button>View services</button></div></div><div class="site-photo">${icon("building-2")}<span>Project image</span></div></section>`}
      ${hidden.has("services") ? "" : `<section class="site-services"><span>What we do</span><h2>Practical help, delivered well.</h2><div>${services.slice(0, 3).map((service, index) => `<article><i>0${index + 1}</i><strong>${escapeHtml(service)}</strong><p>Clear scope, quality work, and a smooth customer experience.</p></article>`).join("")}</div></section>`}
      ${hidden.has("contact") ? "" : `<section class="site-cta"><div><h2>Ready to get started?</h2><p>${escapeHtml([business.address || lead?.address, business.hours].filter(Boolean).join(" · ") || "Serving the local area.")}</p></div><button>${escapeHtml(content.cta || "Request a free estimate")}</button></section>`}
    </div>
  `;
}

export function renderStudio() {
  const { data, routeParams } = getState();
  const demo = selectedDemo(data, routeParams);
  const lead = demo ? byId(data.leads, demo.lead_id) : null;
  const template = demo ? byId(data.templates, demo.template_id) : null;
  const business = demo?.business_info || {};
  const content = demo?.content || {};
  const theme = demo?.theme || {};
  const hidden = new Set(content.hidden_sections || []);
  return `
    ${pageHead(
      "Website Studio",
      "Edit template-backed HTML, CSS, and JavaScript demos without turning each prospect into a repository.",
      `${demo ? button("Preview", { action: "preview-demo", iconName: "eye", variant: "secondary", attrs: `data-id="${demo.id}"` }) : ""}${demo ? button("Save changes", { action: "submit-studio", iconName: "check", variant: "primary" }) : button("Create demo", { action: "new-demo", iconName: "plus", variant: "primary" })}`,
    )}
    <section class="studio-shell">
      <aside class="studio-left">
        <div class="studio-select">
          <label>Editing demo</label>
          <select data-action="studio-demo-select">${data.demos.map((item) => `<option value="${item.id}" ${demo?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select>
        </div>
        <div class="studio-context"><span>Template</span><strong>${escapeHtml(template?.name || "No template")}</strong><small>${escapeHtml(template?.category || "")}</small></div>
        <div class="structure-tree">
          <span>Page structure</span>
          <button class="is-active">${icon("file-code-2")}<span>Home</span></button>
          ${SECTIONS.map(([id, label]) => `<label class="${hidden.has(id) ? "is-hidden" : ""}"><span>${icon("columns-3")} ${label}</span><input type="checkbox" form="studio-form" name="section_${id}" ${hidden.has(id) ? "" : "checked"}></label>`).join("")}
        </div>
        <div class="studio-context"><span>Stack</span><strong>HTML · CSS · JavaScript</strong><small>Template + business configuration</small></div>
      </aside>
      <main class="studio-canvas">
        <header><span class="browser-dots"><i></i><i></i><i></i></span><strong>${escapeHtml(demo?.preview_url || "Local preview")}</strong><div><button data-action="studio-viewport" data-size="mobile">${icon("monitor-up")}</button><button class="is-active" data-action="studio-viewport" data-size="desktop">${icon("globe")}</button></div></header>
        <div class="studio-frame">${demo ? studioPreview(data, demo) : `<div class="healthy-state healthy-state--large">${icon("monitor-up")}<div><strong>No demo selected</strong><span>Create a demo to begin editing.</span></div></div>`}</div>
      </main>
      <aside class="studio-right">
        <form id="studio-form" data-form="studio" data-id="${demo?.id || ""}">
          <div class="studio-right__head"><div><strong>Site controls</strong><span>Content and theme</span></div><span class="placeholder-chip">${icon("sparkles")} Design AI later</span></div>
          <details open><summary>Business content ${icon("chevron-down")}</summary>
            <label class="field"><span>Business name</span><input name="business_name" value="${escapeHtml(business.name || lead?.business_name || "")}"></label>
            <label class="field"><span>Headline</span><textarea name="headline">${escapeHtml(content.headline || "")}</textarea></label>
            <label class="field"><span>Description</span><textarea name="description">${escapeHtml(content.description || "")}</textarea></label>
            <label class="field"><span>Services <small>one per line</small></span><textarea name="services">${escapeHtml((content.services || []).join("\n"))}</textarea></label>
            <label class="field"><span>Call to action</span><input name="cta" value="${escapeHtml(content.cta || "Request a free estimate")}"></label>
          </details>
          <details><summary>Contact details ${icon("chevron-down")}</summary>
            <label class="field"><span>Phone</span><input name="phone" value="${escapeHtml(business.phone || lead?.phone || "")}"></label>
            <label class="field"><span>Email</span><input name="email" type="email" value="${escapeHtml(business.email || lead?.email || "")}"></label>
            <label class="field"><span>Address</span><input name="address" value="${escapeHtml(business.address || lead?.address || "")}"></label>
            <label class="field"><span>Hours</span><input name="hours" value="${escapeHtml(business.hours || "Mon–Sat, 7 AM–6 PM")}"></label>
          </details>
          <details open><summary>Theme ${icon("chevron-down")}</summary>
            <div class="field-row">
              <label class="field"><span>Primary</span><input name="primary" type="color" value="${escapeHtml(theme.primary || "#172437")}"></label>
              <label class="field"><span>Accent</span><input name="accent" type="color" value="${escapeHtml(theme.accent || "#6fb87b")}"></label>
            </div>
            <label class="field"><span>Template</span><select name="template_id">${data.templates.map((item) => `<option value="${item.id}" ${demo?.template_id === item.id ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.category)}</option>`).join("")}</select></label>
          </details>
        </form>
      </aside>
    </section>
  `;
}

function templateCard(template) {
  return `
    <article class="card template-card">
      <div class="template-preview" style="--template-color:${escapeHtml(template.accent_color || "#8f75ff")}"><span class="preview-device preview-device--desktop">Desktop</span><span class="preview-device preview-device--mobile">Mobile</span></div>
      <div class="template-card__body">
        <div><div><h3>${escapeHtml(template.name)}</h3><p>${escapeHtml(template.description || `${template.category} website template`)}</p></div>${badge(template.status, statusLabel(template.status))}</div>
        <div class="template-meta"><span>${escapeHtml(template.category || "General")}</span><span>Used ${Number(template.use_count || 0)}× · ${formatDate(template.updated_at)}</span></div>
        <div class="card-actions">
          <button class="button button--ghost" data-action="preview-template" data-id="${template.id}">Preview</button>
          <button class="button button--ghost" data-action="duplicate-template" data-id="${template.id}">Duplicate</button>
          <button class="button button--ghost" data-action="edit-template" data-id="${template.id}">Edit</button>
          <button class="button button--primary" data-action="use-template" data-id="${template.id}">Use</button>
        </div>
      </div>
    </article>
  `;
}

export function renderTemplates() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const status = routeParams.status || "all";
  const rows = data.templates.filter((template) => (
    (status === "all" || template.status === status)
    && (!query || `${template.name} ${template.category} ${template.description}`.toLowerCase().includes(query))
  ));
  return `
    ${pageHead("Templates", "Reusable niche-ready website foundations for fast prospect demos.", button("Create template", { action: "new-template", iconName: "plus", variant: "primary" }))}
    <div class="toolbar">
      <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search templates and niches" value="${escapeHtml(routeParams.q || "")}"></label>
      <div class="tabs">${["all", "active", "draft", "archived"].map((value) => `<button class="tab ${status === value ? "is-active" : ""}" data-action="route-filter" data-key="status" data-value="${value}">${value === "all" ? "All" : statusLabel(value)}</button>`).join("")}</div>
    </div>
    <section class="template-grid">${rows.map(templateCard).join("") || `<div class="card healthy-state healthy-state--large">${icon("file-code-2")}<div><strong>No templates found</strong><span>Create the first reusable site foundation.</span></div></div>`}</section>
  `;
}

export function renderDemos() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const status = routeParams.status || "all";
  const rows = data.demos.filter((demo) => (
    (status === "all" || demo.status === status)
    && (!query || `${demo.name} ${leadName(data, demo.lead_id)} ${demo.slug}`.toLowerCase().includes(query))
  ));
  return `
    ${pageHead("Demos", "Prospect sites are template configuration records—not separate repositories.", button("Create demo", { action: "new-demo", iconName: "plus", variant: "primary" }))}
    <section class="kpi-strip kpi-strip--compact">
      ${compactMetric("All demos", data.demos.length, "stored")}
      ${compactMetric("Ready", data.demos.filter((item) => item.status === "ready").length, "sendable")}
      ${compactMetric("Viewed", data.demos.filter((item) => item.viewed_at).length, "engaged")}
      ${compactMetric("Converted", data.demos.filter((item) => item.status === "converted").length, "client sites")}
    </section>
    <div class="toolbar">
      <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search demos, leads, slugs…" value="${escapeHtml(routeParams.q || "")}"></label>
      <select class="compact-select" data-action="route-select" data-key="status"><option value="all">All statuses</option>${["draft", "ready", "sent", "viewed", "client_interested", "converted", "archived"].map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${statusLabel(value)}</option>`).join("")}</select>
    </div>
    <section class="card">
      <div class="table-wrap"><table class="data-table responsive-table">
        <thead><tr><th>Demo</th><th>Lead</th><th>Template</th><th>Preview URL</th><th>Status</th><th>Viewed</th><th>Updated</th><th></th></tr></thead>
        <tbody>${rows.map((demo) => {
          const template = byId(data.templates, demo.template_id);
          return `<tr data-action="open-demo" data-id="${demo.id}">
            <td data-label="Demo">${primaryCell(demo.name, demo.slug || "No slug")}</td>
            <td data-label="Lead">${escapeHtml(leadName(data, demo.lead_id))}</td>
            <td data-label="Template">${escapeHtml(template?.name || "Unassigned")}</td>
            <td data-label="Preview">${demo.preview_url ? linkOut(demo.preview_url, "Open preview") : `<span class="muted-copy">Not published</span>`}</td>
            <td data-label="Status">${badge(demo.status, statusLabel(demo.status))}</td>
            <td data-label="Viewed">${demo.viewed_at ? formatDate(demo.viewed_at, { hour: "numeric", minute: "2-digit" }) : "Not yet"}</td>
            <td data-label="Updated">${formatDate(demo.updated_at)}</td>
            <td data-label="Actions"><div class="row-actions">
              <button class="button button--ghost" data-action="open-studio" data-id="${demo.id}">Edit</button>
              <button class="icon-button icon-button--small" data-action="copy-demo-link" data-id="${demo.id}" aria-label="Copy preview link">${icon("paperclip")}</button>
              <button class="icon-button icon-button--small" data-action="open-demo" data-id="${demo.id}" aria-label="Demo details">${icon("chevron-right")}</button>
            </div></td>
          </tr>`;
        }).join("") || tableEmpty(8, "No demos found", "Create a template-backed prospect demo.")}</tbody>
      </table></div>
    </section>
  `;
}

export function renderDeployments() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const rows = data.deployments.filter((deployment) => !query || `${deployment.domain} ${deployment.production_url} ${deployment.status}`.toLowerCase().includes(query));
  return `
    ${pageHead("Deployments", "Production deployment inventory prepared for a future Cloudflare service connection.")}
    <div class="placeholder-banner">${icon("globe")}<div><strong>Cloudflare deployment actions are placeholders</strong><span>Status, versions, domains, logs, SSL, and DNS records persist now. No external deploy occurs from this UI yet.</span></div>${badge("setup_required", "Cloudflare pending")}</div>
    <section class="kpi-strip kpi-strip--compact">
      ${compactMetric("Live", data.deployments.filter((item) => item.status === "live").length, "production")}
      ${compactMetric("Healthy", data.deployments.filter((item) => item.hosting_health === "healthy").length, "hosting")}
      ${compactMetric("Pending", data.deployments.filter((item) => item.status === "pending").length, "awaiting deploy")}
      ${compactMetric("Failures", data.deployments.filter((item) => item.status === "failed").length, "needs attention")}
    </section>
    <div class="toolbar"><label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search domain or client" value="${escapeHtml(routeParams.q || "")}"></label></div>
    <section class="card">
      <div class="table-wrap"><table class="data-table responsive-table">
        <thead><tr><th>Client / site</th><th>Production</th><th>Status</th><th>SSL</th><th>DNS</th><th>Version</th><th>Health</th><th>Last deploy</th><th>Actions</th></tr></thead>
        <tbody>${rows.map((deployment) => {
          const client = byId(data.clients, deployment.client_id);
          const site = byId(data.clientSites, deployment.site_id);
          return `<tr>
            <td data-label="Client">${primaryCell(client ? leadName(data, client.lead_id) : "Unlinked client", site?.name || deployment.domain || "Site")}</td>
            <td data-label="Production">${deployment.production_url ? linkOut(deployment.production_url, deployment.domain || "Open live") : `<span class="muted-copy">Not live</span>`}</td>
            <td data-label="Status">${badge(deployment.status, statusLabel(deployment.status))}</td>
            <td data-label="SSL">${badge(deployment.ssl_status === "active" ? "connected" : "pending", statusLabel(deployment.ssl_status))}</td>
            <td data-label="DNS">${badge(deployment.dns_status === "active" ? "connected" : "pending", statusLabel(deployment.dns_status))}</td>
            <td data-label="Version">${escapeHtml(deployment.version || "—")}</td>
            <td data-label="Health">${badge(deployment.hosting_health === "healthy" ? "connected" : deployment.hosting_health === "error" ? "error" : "pending", statusLabel(deployment.hosting_health))}</td>
            <td data-label="Last deploy">${formatDate(deployment.last_deployed_at, { hour: "numeric", minute: "2-digit" })}</td>
            <td data-label="Actions"><div class="row-actions row-actions--wrap">
              <button class="button button--ghost" data-action="deployment-placeholder" data-kind="deploy" data-id="${deployment.id}">${deployment.status === "live" ? "Redeploy" : "Deploy"}</button>
              <button class="button button--ghost" data-action="deployment-placeholder" data-kind="rollback" data-id="${deployment.id}">Rollback</button>
              <button class="button button--ghost" data-action="deployment-logs" data-id="${deployment.id}">Logs</button>
            </div></td>
          </tr>`;
        }).join("") || tableEmpty(9, "No deployments", "Convert a won lead and prepare a client site first.")}</tbody>
      </table></div>
    </section>
  `;
}
