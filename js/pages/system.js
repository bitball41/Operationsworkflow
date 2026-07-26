import { CONFIG, INTEGRATIONS } from "../config.js";
import { pageHead } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml } from "../core/utils.js";
import { getStoredApiKey } from "../services/openscout/adapter.js";
import { badge, button, byId, formatDate, icon, sectionCard, statusLabel } from "./shared.js";

function integrationRecords(data) {
  const stored = new Map(data.integrations.map((item) => [item.provider, item]));
  return INTEGRATIONS.map((definition) => {
    const record = stored.get(definition.provider);
    let status = record?.status || definition.status;
    if (definition.provider === "supabase") status = "connected";
    if (definition.provider === "openscout") status = "connected";
    return { ...definition, ...record, name: definition.name, detail: definition.detail, color: definition.color, short: definition.short, status };
  });
}

export function renderIntegrations() {
  const { data } = getState();
  const integrations = integrationRecords(data);
  const connected = integrations.filter((item) => item.status === "connected").length;
  return `
    ${pageHead("Integrations", "Current service availability and intentionally deferred external connections.")}
    <div class="integration-overview">
      <div>${icon("paperclip")}<span><strong>${connected} services active</strong><small>Supabase and the embedded OpenScout engine are usable now.</small></span></div>
      <div><span class="status-pulse"></span><strong>No secrets are rendered in this page</strong></div>
    </div>
    <section class="integration-grid integration-grid--large">${integrations.map((item) => `
      <article class="integration-card integration-card--large">
        <span class="integration-logo" style="--logo-color:${item.color};--logo-soft:${item.color}1c">${escapeHtml(item.short)}</span>
        <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.detail)}</small>${item.provider === "openscout" ? `<em>${getStoredApiKey() ? "Browser Google Maps key is saved locally." : "Engine ready; add a browser Google Maps key in Lead Discovery."}</em>` : item.last_synced_at ? `<em>Checked ${formatDate(item.last_synced_at, { hour: "numeric", minute: "2-digit" })}</em>` : ""}</div>
        <div>${badge(item.status, item.status === "not_connected" ? "Not connected" : statusLabel(item.status))}${["supabase", "openscout"].includes(item.provider) ? `<button class="button button--ghost" data-action="navigate" data-route-target="${item.provider === "openscout" ? "discovery" : "settings"}">Manage</button>` : item.status === "disabled" ? "" : `<button class="button button--secondary" data-action="integration-placeholder" data-provider="${item.provider}">Set up</button>`}</div>
      </article>
    `).join("")}</section>
    ${sectionCard(
      "Architecture boundary",
      "All future services feed the same Operations business layer",
      `<div class="architecture-flow">
        <span>Dashboard</span><i>${icon("arrow-right")}</i><span>Operations API</span><i>${icon("arrow-right")}</i><span>Services</span>
        <div><b>Supabase</b><b>OpenScout</b><b>Gmail</b><b>Whop</b><b>Cloudflare</b><b>AI providers</b></div>
      </div><p class="muted-copy" style="margin-top:14px">The custom MCP server can later call the same service layer. It is not implemented in this frontend.</p>`,
    )}
  `;
}

export function renderSettings() {
  const { data, user, mode } = getState();
  const preferences = data.profile?.preferences || {};
  const workspace = data.settings.find((item) => item.key === "workspace")?.value || {};
  const value = (key, fallback = "") => preferences[key] ?? workspace[key] ?? fallback;
  return `
    ${pageHead("Settings", "Business defaults, outreach behavior, website configuration, integrations, and session controls.")}
    <form id="settings-form" class="settings-layout" data-form="settings">
      ${sectionCard(
        "General",
        "Workspace identity and display",
        `<div class="field-row">
          <label class="field field--flush"><span>Business name</span><input name="business_name" value="${escapeHtml(value("business_name", "Connor Websites"))}"></label>
          <label class="field field--flush"><span>Owner</span><input name="owner_name" value="${escapeHtml(value("owner_name", data.profile?.full_name || "Connor"))}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Time zone</span><select name="timezone">${["America/Chicago", "America/Los_Angeles", "America/New_York", "UTC"].map((zone) => `<option value="${zone}" ${value("timezone", "America/Chicago") === zone ? "selected" : ""}>${zone}</option>`).join("")}</select></label>
          <label class="field"><span>Currency</span><select name="currency"><option value="USD" selected>USD · US Dollar</option></select></label>
        </div>
        <label class="field"><span>Theme</span><select name="theme"><option value="dark" ${value("theme", "dark") === "dark" ? "selected" : ""}>Dark</option><option value="system" ${value("theme") === "system" ? "selected" : ""}>Follow system</option></select></label>`,
      )}
      ${sectionCard(
        "Business",
        "Offer and recurring revenue defaults",
        `<div class="field-row">
          <label class="field field--flush"><span>Default site price</span><input name="default_site_price" type="number" min="0" value="${Number(value("default_site_price", 400))}"></label>
          <label class="field field--flush"><span>Maintenance / month</span><input name="maintenance_price" type="number" min="0" value="${Number(value("maintenance_price", 50))}"></label>
        </div>
        <label class="field"><span>Default offer</span><input name="default_offer" value="${escapeHtml(value("default_offer", "One-time website build"))}"></label>`,
      )}
      ${sectionCard(
        "Outreach",
        "Message defaults and future sending controls",
        `<label class="field field--flush"><span>Default sending email</span><input name="default_email" type="email" value="${escapeHtml(value("default_email", ""))}" placeholder="connor@example.com"></label>
        <label class="field"><span>Signature</span><textarea name="signature">${escapeHtml(value("signature", "Connor"))}</textarea></label>
        <div class="field-row">
          <label class="field"><span>Follow-up timing <small>comma-separated days</small></span><input name="follow_up_days" value="${escapeHtml((value("follow_up_days", [3, 7, 14]) || []).join(", "))}"></label>
          <label class="field"><span>Daily sending limit</span><input name="sending_limit" type="number" min="1" value="${Number(value("sending_limit", 50))}" disabled><small class="field-hint">Gmail placeholder</small></label>
        </div>`,
      )}
      ${sectionCard(
        "AI",
        "Provider placeholders and guardrails",
        `<div class="field-row">
          <label class="field field--flush"><span>Default provider</span><select name="ai_provider" disabled><option>No provider connected</option></select></label>
          <label class="field field--flush"><span>Default model</span><input value="Connect a provider first" disabled></label>
        </div>
        <label class="field"><span>Behavior</span><select name="ai_behavior"><option value="manual" selected>Manual — always review</option><option value="suggest">Suggest only</option></select></label>
        <label class="field"><span>Daily cost limit</span><input name="daily_cost_limit" type="number" min="0" step=".01" value="${Number(value("daily_cost_limit", 10))}"></label>`,
      )}
      ${sectionCard(
        "Websites",
        "Preview and template defaults",
        `<label class="field field--flush"><span>Preview domain</span><input name="preview_domain" value="${escapeHtml(value("preview_domain", "preview.example.com"))}"></label>
        <div class="field-row">
          <label class="field"><span>Default template</span><select name="default_template_id"><option value="">Choose per lead</option>${data.templates.map((template) => `<option value="${template.id}" ${value("default_template_id") === template.id ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Production default</span><select name="production_provider" disabled><option>Cloudflare · not connected</option></select></label>
        </div>`,
      )}
      ${sectionCard(
        "Integrations",
        "Connected service summary",
        `<div class="settings-list">${integrationRecords(data).map((item) => `<div class="settings-row"><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.detail)}</p></div>${badge(item.status, item.status === "not_connected" ? "Not connected" : statusLabel(item.status))}</div>`).join("")}</div>`,
      )}
      ${sectionCard(
        "Security",
        "Authentication and session",
        `<div class="settings-list">
          <div class="settings-row"><div><strong>Session</strong><p>${mode === "preview" ? "Preview workspace — no database writes" : `Signed in as ${escapeHtml(user?.email || "owner")}`}</p></div>${badge(mode === "preview" ? "warning" : "connected", mode === "preview" ? "Preview" : "Authenticated")}</div>
          <div class="settings-row"><div><strong>Supabase Auth</strong><p>Protected dashboard, persistent session, owner-scoped RLS policies.</p></div>${badge("connected", "Active")}</div>
          <div class="settings-row"><div><strong>Future API / MCP security</strong><p>Use the same backend authorization boundary; never expose service-role credentials to this frontend.</p></div>${badge("disabled", "Future")}</div>
          <div class="settings-row"><div><strong>${mode === "preview" ? "Leave preview" : "Log out"}</strong><p>End this workspace session on the current browser.</p></div><button class="button button--danger" type="button" data-action="${mode === "preview" ? "exit-preview" : "sign-out"}">${icon("log-out")} ${mode === "preview" ? "Exit preview" : "Log out"}</button></div>
        </div>`,
      )}
      <div class="settings-save"><span>Supabase project <code>${escapeHtml(CONFIG.supabaseUrl.replace("https://", "").split(".")[0])}</code></span><button class="button button--primary" type="submit">${icon("check")} Save settings</button></div>
    </form>
  `;
}
