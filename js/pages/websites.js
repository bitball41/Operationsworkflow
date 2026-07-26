/**
 * Templates, Demos and Deployments.
 *
 * Template cards show a real rendered preview of the template — not a drawing
 * of a browser window.
 */
import { getState } from "../core/state.js";
import { escapeHtml, formatNumber, relativeTime, statusLabel } from "../core/utils.js";
import { btn, empty, externalLink, notice, pill, section, stats, table, td } from "../components/ui.js";
import { buildBundleForLead, composeDocument, templateByKey } from "../services/sites/bundle.js";
import { hostingConnected } from "../services/sites/publish.js";
import { byId, filterSelect, leadName, searchInput } from "./shared.js";

const SAMPLE_LEAD = {
  business_name: "Example Local Co.",
  category: "",
  city: "Arlington",
  region: "TX",
  phone: "(817) 555-0100",
  address: "120 Main Street, Arlington, TX",
  source_metadata: { openscout: { rating: 4.8, ratingCount: 42 } },
};

/* Thumbnails are static: no scripting in the frame, so no script is inlined. */
function templatePreview(entry) {
  const { files } = buildBundleForLead({ ...SAMPLE_LEAD, category: entry.category }, entry);
  return composeDocument(files, { scripts: false });
}

export function renderTemplates() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const templates = data.templates
    .filter((template) => !query || `${template.name} ${template.category}`.toLowerCase().includes(query));

  return `
    <div class="stack">
      <div class="toolbar">
        ${searchInput("Search templates and niches", routeParams.q || "")}
        <span class="toolbar__spacer"></span>
        <span class="faint">Automation picks a template by niche automatically</span>
      </div>

      ${templates.length ? `<div class="template-grid">
        ${templates.map((template) => {
          const entry = templateByKey(template.layout_key);
          return `
            <article class="template">
              <div class="template__shot">
                <iframe title="${escapeHtml(template.name)} preview" sandbox="" scrolling="no" srcdoc="${escapeHtml(templatePreview(entry))}"></iframe>
              </div>
              <div class="template__meta">
                <div class="cell"><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(template.category)}</span></div>
                ${pill(template.status)}
              </div>
              <div class="btn-row">
                ${btn("Preview", { action: "template-preview", size: "sm", attrs: `data-id="${template.id}"` })}
                ${btn("Use for a lead", { action: "template-use", size: "sm", attrs: `data-id="${template.id}"` })}
                <span class="faint">Used ${formatNumber(template.use_count || 0)}×</span>
              </div>
            </article>
          `;
        }).join("")}
      </div>` : empty({
        title: "No templates yet",
        message: "The template catalogue installs itself the first time automation needs it.",
        action: "templates-install",
        actionLabel: "Install templates",
      })}
    </div>
  `;
}

export function renderDemos() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const status = routeParams.status || "all";
  const demos = data.demos
    .filter((demo) => (status === "all" || demo.status === status))
    .filter((demo) => !query || `${demo.name} ${leadName(data, demo.lead_id)}`.toLowerCase().includes(query));

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["Demos", formatNumber(data.demos.length)],
          ["Ready", formatNumber(data.demos.filter((demo) => demo.status === "ready").length)],
          ["Viewed", formatNumber(data.demos.filter((demo) => demo.viewed_at).length)],
          ["Converted", formatNumber(data.demos.filter((demo) => demo.status === "converted").length)],
        ]),
      })}

      ${hostingConnected() ? "" : notice(
        "Demos are stored, not hosted",
        "Each demo holds its real HTML, CSS and JavaScript and opens in a browser tab from here. Connect Cloudflare to serve the preview links publicly.",
        { iconName: "globe" },
      )}

      <div class="toolbar">
        ${searchInput("Search demos", routeParams.q || "")}
        ${filterSelect("status", ["draft", "ready", "sent", "viewed", "client_interested", "converted", "archived"].map((value) => ({ value, label: statusLabel(value) })), status, "All statuses")}
      </div>

      ${table({
        columns: ["Business", "Template", "Status", "Preview", "Updated", ""],
        rows: demos.map((demo) => {
          const template = byId(data.templates, demo.template_id);
          return `<tr>
            ${td("Business", `<div class="cell"><strong>${escapeHtml(leadName(data, demo.lead_id))}</strong><span>${escapeHtml(demo.slug || "")}</span></div>`)}
            ${td("Template", escapeHtml(template?.name || "—"))}
            ${td("Status", pill(demo.status))}
            ${td("Preview", demo.preview_url ? `${externalLink(demo.preview_url, "Link")}${demo.content?.publish?.hosted ? "" : ` <span class="faint">not hosted</span>`}` : `<span class="faint">Not published</span>`)}
            ${td("Updated", relativeTime(demo.updated_at))}
            ${td("", `<span class="cell-actions">
              ${btn("Open site", { action: "demo-open-tab", size: "sm", attrs: `data-id="${demo.id}"` })}
              ${btn("Studio", { action: "demo-studio", size: "sm", variant: "primary", attrs: `data-id="${demo.id}"` })}
            </span>`)}
          </tr>`;
        }),
        emptyState: empty({
          title: "No demos yet",
          message: "Automation builds a demo for every lead it works. You can also prepare one from the Leads page.",
          action: "navigate",
          actionLabel: "Open Leads",
          actionAttrs: 'data-route-target="leads"',
        }),
      })}
    </div>
  `;
}

export function renderDeployments() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const deployments = data.deployments.filter((item) => !query || `${item.domain} ${item.status}`.toLowerCase().includes(query));

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["Live", formatNumber(data.deployments.filter((item) => item.status === "live").length)],
          ["Healthy", formatNumber(data.deployments.filter((item) => item.hosting_health === "healthy").length)],
          ["Pending", formatNumber(data.deployments.filter((item) => item.status === "pending").length)],
          ["Failed", formatNumber(data.deployments.filter((item) => item.status === "failed").length)],
        ]),
      })}

      ${hostingConnected() ? "" : notice(
        "Cloudflare is not connected",
        "Records, versions and logs are real. Deploy and rollback will work once hosting credentials exist.",
        { iconName: "globe", actions: btn("Integrations", { action: "navigate", attrs: 'data-route-target="integrations"', size: "sm" }) },
      )}

      <div class="toolbar">${searchInput("Search domains", routeParams.q || "")}</div>

      ${table({
        columns: ["Client site", "Domain", "Status", "Health", "Version", "Last deploy", ""],
        rows: deployments.map((deployment) => {
          const client = byId(data.clients, deployment.client_id);
          const site = byId(data.clientSites, deployment.site_id);
          return `<tr>
            ${td("Client site", `<div class="cell"><strong>${escapeHtml(client ? leadName(data, client.lead_id) : "Unlinked")}</strong><span>${escapeHtml(site?.name || "")}</span></div>`)}
            ${td("Domain", deployment.production_url ? externalLink(deployment.production_url, deployment.domain || "Open") : escapeHtml(deployment.domain || "—"))}
            ${td("Status", pill(deployment.status))}
            ${td("Health", pill(deployment.hosting_health === "healthy" ? "healthy" : deployment.hosting_health === "error" ? "error" : "unknown"))}
            ${td("Version", escapeHtml(deployment.version || "—"))}
            ${td("Last deploy", deployment.last_deployed_at ? relativeTime(deployment.last_deployed_at) : "Never")}
            ${td("", `<span class="cell-actions">${btn("Logs", { action: "deployment-logs", size: "sm", attrs: `data-id="${deployment.id}"` })}</span>`)}
          </tr>`;
        }),
        emptyState: empty({ title: "No deployments", message: "Client sites appear here once a lead is won and a site is set up." }),
      })}
    </div>
  `;
}
