import { icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, relativeTime } from "../core/utils.js";
import { badge, button, emptyState, metricCard, pageHead } from "../components/ui.js";

function leadFor(id) {
  return getState().data.leads.find((lead) => lead.id === id);
}

function templateFor(id) {
  return getState().data.templates.find((template) => template.id === id);
}

export function renderTemplates() {
  const { data } = getState();
  const totalUses = data.templates.reduce((total, template) => total + Number(template.use_count || 0), 0);
  return `
    ${pageHead(
      "Template library",
      "Reusable, intentionally designed starting points. AI customizes content and fit — it does not reinvent the design every time.",
      button("New template", { action: "new-template", iconName: "plus", variant: "primary" }),
    )}
    <section class="grid grid--3" style="margin-bottom:14px">
      ${metricCard({ label: "Active templates", value: data.templates.filter((item) => item.is_active).length, iconName: "panels-top-left", foot: `${data.templates.length} total`, tone: "purple" })}
      ${metricCard({ label: "Times selected", value: totalUses, iconName: "mouse-pointer-click", foot: "Across demo briefs", tone: "blue" })}
      ${metricCard({ label: "Reuse rate", value: data.demos.length ? `${Math.round(data.demos.filter((demo) => demo.template_id).length / data.demos.length * 100)}%` : "0%", iconName: "refresh-cw", foot: "Demos using a base", tone: "green" })}
    </section>
    ${data.templates.length ? `
      <section class="template-grid">
        ${data.templates.map((template) => `
          <article class="card template-card">
            <div class="template-preview" style="--template-color:${escapeHtml(template.accent_color || "#7c5cff")}"></div>
            <div class="template-card__body">
              <div><div><h3>${escapeHtml(template.name)}</h3><p>${escapeHtml(template.description || "Reusable website template")}</p></div>${badge(template.is_active ? "active" : "paused", template.is_active ? "Active" : "Paused")}</div>
              <div class="template-meta"><span>${escapeHtml(template.category)}</span><span>${template.use_count || 0} uses</span></div>
              <div style="display:flex;gap:7px;margin-top:12px">${button("Use template", { action: "use-template", attrs: `data-id="${template.id}"`, variant: "primary" })}${button("Edit", { action: "edit-template", attrs: `data-id="${template.id}"` })}</div>
            </div>
          </article>
        `).join("")}
      </section>
    ` : `<section class="card">${emptyState({ iconName: "panels-top-left", title: "No templates yet", message: "Create the first reusable base for a service category.", action: "new-template", actionLabel: "Create template" })}</section>`}
  `;
}

export function renderDemos() {
  const { data } = getState();
  const ready = data.demos.filter((demo) => ["ready", "deployed"].includes(demo.status)).length;
  const inQa = data.demos.filter((demo) => demo.status === "qa").length;
  const versions = data.demoVersions.length;
  return `
    ${pageHead(
      "Demo manager",
      "Source bundles live privately in Supabase Storage during demo production; Cloudflare deployment attaches later.",
      button("Create demo", { action: "new-demo", iconName: "plus", variant: "primary" }),
    )}
    <section class="grid grid--3">
      ${metricCard({ label: "Active demos", value: data.demos.filter((demo) => !["production", "archived"].includes(demo.status)).length, iconName: "monitor-up", foot: `${ready} ready or deployed`, tone: "purple" })}
      ${metricCard({ label: "In QA", value: inQa, iconName: "clipboard-check", foot: inQa ? "Needs review" : "Queue is clear", tone: inQa ? "yellow" : "green" })}
      ${metricCard({ label: "Stored versions", value: versions, iconName: "archive", foot: "Private Storage objects", tone: "blue" })}
    </section>

    <section class="grid grid--2" style="margin-top:14px">
      ${data.demos.map((demo) => {
        const lead = leadFor(demo.lead_id);
        const template = templateFor(demo.template_id);
        const currentVersion = data.demoVersions.find((version) => version.demo_id === demo.id && version.is_current);
        const checklist = demo.qa_checklist || {};
        const checks = Object.values(checklist).filter(Boolean).length;
        const total = Object.keys(checklist).length || 4;
        return `
          <article class="card">
            <header class="card__head">
              <div><h3>${escapeHtml(demo.name)}</h3><p>${escapeHtml(lead?.business_name || "Unlinked prospect")} · ${escapeHtml(template?.name || "No template")}</p></div>
              ${badge(demo.status)}
            </header>
            <div class="card__body">
              <div style="display:grid;grid-template-columns:90px 1fr;gap:14px">
                <div class="template-preview" style="height:80px;border:1px solid var(--border);border-radius:8px;--template-color:${escapeHtml(template?.accent_color || "#7c5cff")}"></div>
                <div>
                  <div style="display:flex;justify-content:space-between;color:var(--text-soft);font-size:10px"><span>QA progress</span><strong>${checks}/${total}</strong></div>
                  <div class="progress" style="margin-top:7px"><i style="width:${checks / total * 100}%"></i></div>
                  <div style="display:flex;justify-content:space-between;margin-top:12px;color:var(--muted);font-size:9px"><span>${currentVersion ? `Version ${currentVersion.version_number}` : "No bundle uploaded"}</span><span>${relativeTime(demo.updated_at)}</span></div>
                </div>
              </div>
              <div class="settings-list" style="margin-top:13px">
                <div class="settings-row"><div><strong>Code storage</strong><p>${escapeHtml(demo.storage_prefix || "Not initialized")}</p></div>${badge(demo.storage_prefix ? "active" : "pending", demo.storage_prefix ? "Private" : "Waiting")}</div>
                <div class="settings-row"><div><strong>Preview deployment</strong><p>${escapeHtml(demo.preview_url || "Cloudflare adapter not connected")}</p></div>${badge(demo.preview_url ? "active" : "pending", demo.preview_url ? "Live" : "Not deployed")}</div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:14px">
                ${button("Upload version", { action: "upload-demo", iconName: "upload", attrs: `data-id="${demo.id}"` })}
                ${button("Open details", { action: "open-demo", iconName: "eye", attrs: `data-id="${demo.id}"` })}
                ${!["deployed", "production"].includes(demo.status) ? button("Advance stage", { action: "advance-demo", iconName: "arrow-right", attrs: `data-id="${demo.id}"`, variant: "primary" }) : ""}
              </div>
            </div>
          </article>
        `;
      }).join("") || `<article class="card" style="grid-column:1/-1">${emptyState({ iconName: "monitor-up", title: "No demos yet", message: "Create a demo from a qualified prospect and a reusable template.", action: "new-demo", actionLabel: "Create first demo" })}</article>`}
    </section>
  `;
}

export function renderClients() {
  const { data } = getState();
  const contracted = data.clients.reduce((total, client) => total + Number(client.agreed_price || 0), 0);
  const received = data.clients.reduce((total, client) => total + Number(client.amount_received || 0), 0);
  const wonWithoutClient = data.leads.filter((lead) => lead.status === "won" && !data.clients.some((client) => client.lead_id === lead.id));

  return `
    ${pageHead(
      "Clients",
      "Convert won prospects into finished sites with a short, explicit handoff — no invoicing engine or bloated CRM.",
      wonWithoutClient.length ? button("Convert won lead", { action: "new-client", iconName: "plus", variant: "primary" }) : "",
    )}
    <section class="grid grid--3">
      ${metricCard({ label: "Active clients", value: data.clients.filter((item) => item.status !== "completed").length, iconName: "briefcase-business", foot: `${data.clients.filter((item) => item.status === "completed").length} completed`, tone: "purple" })}
      ${metricCard({ label: "Contracted", value: formatCurrency(contracted), iconName: "circle-dollar-sign", foot: "Total agreed project value", tone: "green" })}
      ${metricCard({ label: "Received", value: formatCurrency(received), iconName: "wallet-cards", foot: `${formatCurrency(contracted - received)} outstanding`, tone: "yellow" })}
    </section>

    <section class="section-stack" style="margin-top:14px">
      ${data.clients.map((client) => {
        const lead = leadFor(client.lead_id);
        const checklist = client.handoff_checklist || {};
        const done = Object.values(checklist).filter(Boolean).length;
        const total = Object.keys(checklist).length || 4;
        return `
          <article class="card">
            <header class="card__head">
              <div><h3>${escapeHtml(lead?.business_name || "Unknown client")}</h3><p>${escapeHtml(client.package_name)} · Closed ${formatDate(client.closed_at)}</p></div>
              ${badge(client.status)}
            </header>
            <div class="card__body">
              <div class="grid grid--3">
                <div><span class="eyebrow">Project value</span><strong style="display:block;margin-top:7px;font-size:23px">${formatCurrency(client.agreed_price)}</strong><p style="color:var(--muted);font-size:9px;margin-top:3px">${formatCurrency(client.amount_received)} received</p></div>
                <div><span class="eyebrow">Launch destination</span><strong style="display:block;margin-top:7px;font-size:11px">${escapeHtml(client.domain || "Domain not connected")}</strong><p style="color:var(--muted);font-size:9px;margin-top:3px">${escapeHtml(client.production_url || "Production URL pending")}</p></div>
                <div><span class="eyebrow">Handoff</span><div style="display:flex;justify-content:space-between;margin-top:9px;color:var(--text-soft);font-size:10px"><span>Checklist</span><strong>${done}/${total}</strong></div><div class="progress" style="margin-top:7px"><i style="width:${done / total * 100}%"></i></div></div>
              </div>
              <div style="display:flex;gap:7px;margin-top:15px">${button("Manage handoff", { action: "manage-client", iconName: "clipboard-check", attrs: `data-id="${client.id}"`, variant: "primary" })}${button("Open lead", { action: "open-lead", attrs: `data-id="${client.lead_id}"` })}</div>
            </div>
          </article>
        `;
      }).join("") || `<article class="card">${emptyState({ iconName: "briefcase-business", title: "No clients yet", message: "When a lead is won, convert its demo and history into a client handoff here." })}</article>`}
    </section>
  `;
}

