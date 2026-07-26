/** Integrations and Settings. */
import { CONFIG } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatNumber } from "../core/utils.js";
import {
  advanced,
  btn,
  field,
  input,
  notice,
  pill,
  row,
  rows,
  section,
  select,
  textarea,
} from "../components/ui.js";
import { integrationList } from "../services/integrations.js";
import { preferences } from "../services/data.js";
import { getStoredApiKey } from "../services/openscout/adapter.js";
import { listTools } from "../services/ai/tools.js";
import { contextSections } from "../services/ai/context.js";

export function renderIntegrations() {
  const integrations = integrationList();
  const connected = integrations.filter((item) => item.status === "connected").length;

  return `
    <div class="stack">
      ${notice(
        `${connected} of ${integrations.length} services connected`,
        "Everything else is wired up behind a boundary: the UI, records and tool calls exist, and each one refuses to pretend an external action happened.",
        { iconName: "plug" },
      )}

      ${section("Services", {
        body: rows(integrations.map((item) => row({
          main: item.name,
          sub: item.detail,
          side: `${pill(item.status)}${item.manage ? btn("Manage", { action: "navigate", size: "sm", attrs: `data-route-target="${item.manage}"` }) : btn("Set up", { action: "integration-setup", size: "sm", attrs: `data-provider="${item.provider}"` })}`,
        }))),
      })}

      ${section("Tool layer", {
        subtitle: `${formatNumber(listTools().length)} operations available to the assistant and, later, to an MCP client`,
        body: rows([
          row({ main: "Deterministic operations", sub: "Lead selection, demo build, publish, draft, send, follow-up, pipeline, inbox, money", iconName: "tool" }),
          row({ main: "Application context", sub: `${contextSections().length} sections exposed on every assistant turn`, iconName: "layers" }),
          row({ main: "Model provider", sub: "Not connected — no key is stored in this project", iconName: "sparkle", side: pill("not_connected") }),
        ]),
      })}
    </div>
  `;
}

export function renderSettings() {
  const state = getState();
  const settings = preferences();
  const cloud = state.storage === "cloud";

  return `
    <div class="stack">
      ${state.connection.ok ? "" : notice("Database connection issue", state.connection.message, { tone: "warn", iconName: "alert" })}

      ${section("Data", {
        body: rows([
          row({
            main: cloud ? "Synced to Supabase" : "Stored in this browser",
            sub: cloud
              ? `Signed in as ${state.user?.email || "owner"}`
              : "Records are saved to local storage. Sign in to sync them to Supabase — the dashboard works either way.",
            iconName: "layers",
            side: pill(cloud ? "connected" : "warning", cloud ? "Cloud" : "Local"),
          }),
          row({
            main: "Starter workspace",
            sub: "Replace local data with realistic sample records",
            iconName: "refresh",
            side: btn("Load sample data", { action: "load-sample", size: "sm" }),
          }),
          row({
            main: "Google Maps key",
            sub: getStoredApiKey() ? "Saved in this browser for lead discovery" : "Not set — add it on the Lead Discovery page",
            iconName: "radar",
            side: pill(getStoredApiKey() ? "connected" : "not_connected"),
          }),
        ]),
      })}

      <form class="stack" data-form="settings">
        ${section("Business", {
          body: `<div class="field-grid">
            ${field("Owner name", input("owner_name", settings.owner_name || CONFIG.owner))}
            ${field("Business name", input("business_name", settings.business_name || ""))}
            ${field("Website price", input("default_site_price", settings.default_site_price ?? CONFIG.defaultPrice, { type: "number", attrs: 'min="0" step="50"' }))}
            ${field("Maintenance / month", input("maintenance_price", settings.maintenance_price ?? 50, { type: "number", attrs: 'min="0"' }))}
          </div>`,
        })}

        ${section("Outreach", {
          body: `
            <div class="field-grid">
              ${field("Sending email", input("default_email", settings.default_email || "", { type: "email", placeholder: "you@example.com" }))}
              ${field("Follow-up cadence", input("follow_up_days", (settings.follow_up_days || [3, 7, 14]).join(", ")), { hint: "days" })}
              ${field("Daily target", input("batch_target", settings.batch_target ?? CONFIG.defaultBatchTarget, { type: "number", attrs: 'min="1" max="500"' }))}
            </div>
            ${field("Signature", textarea("signature", settings.signature || CONFIG.owner, { attrs: 'rows="3"' }))}
          `,
        })}

        ${section("Websites", {
          body: `<div class="field-grid">
            ${field("Preview domain", input("preview_domain", settings.preview_domain || CONFIG.previewDomain))}
            ${field("Time zone", select("timezone", ["America/Chicago", "America/New_York", "America/Denver", "America/Los_Angeles", "UTC"].map((zone) => ({ value: zone, label: zone })), settings.timezone || "America/Chicago"))}
          </div>`,
        })}

        <div class="btn-row">
          ${btn("Save settings", { type: "submit", variant: "primary" })}
        </div>
      </form>

      ${advanced("Supabase account", `
        ${cloud ? rows([
          row({ main: "Signed in", sub: escapeHtml(state.user?.email || ""), iconName: "user", side: btn("Sign out", { action: "sign-out", size: "sm" }) }),
        ]) : `
          <p class="faint">Signing in only enables cloud sync. The dashboard never blocks on it.</p>
          <form class="stack--tight" data-form="sign-in">
            <div class="field-grid">
              ${field("Email", input("email", "", { type: "email", required: true }))}
              ${field("Password", input("password", "", { type: "password", required: true, attrs: 'minlength="8"' }))}
            </div>
            <div class="btn-row">
              ${btn("Sign in", { type: "submit" })}
              ${btn("Create account", { action: "sign-up" })}
            </div>
          </form>
        `}
        <p class="faint">Project <code>${escapeHtml(CONFIG.supabaseUrl.replace("https://", "").split(".")[0])}</code> · publishable key only, never a service key.</p>
      `)}
    </div>
  `;
}
