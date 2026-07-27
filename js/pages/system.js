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
import { connectedProvider, providerReady } from "../services/ai/provider.js";
import { preferences } from "../services/data.js";
import { getStoredApiKey, workerHoldsMapsKey } from "../services/openscout/adapter.js";
import { listTools } from "../services/ai/tools.js";
import { contextSections } from "../services/ai/context.js";
import { WORKER_PROVIDERS } from "../services/api.js";
import { EFFORT_LEVELS, estimatedTurnCost, formatPerMTok, getModel, modelsForProvider } from "../data/models.js";
import { activeModel } from "../services/ai/provider.js";
import { formatCurrency, isSameMonth } from "../core/utils.js";

/* The four keys the Cloudflare Worker can hold, and the secret name for each. */
const WORKER_SECRETS = Object.freeze({
  anthropic: { label: "Anthropic", secret: "ANTHROPIC_API_KEY", detail: "Assistant replies and model-driven tool calls" },
  openai: { label: "OpenAI", secret: "OPENAI_API_KEY", detail: "Alternate model provider" },
  whop: { label: "Whop", secret: "WHOP_API_KEY", detail: "Payment events and receipts, read-only" },
  google_maps: { label: "Google Maps", secret: "GOOGLE_MAPS_API_KEY", detail: "Lead discovery through the Places API" },
});

function mapsKeySource() {
  if (workerHoldsMapsKey()) return "Served by the Cloudflare Worker to every browser";
  if (getStoredApiKey()) return "Saved in this browser only — move it to the Worker to share it";
  return "Not set — add GOOGLE_MAPS_API_KEY to the Worker, or paste one on Lead Discovery";
}

/** The Worker's key inventory, reported by /api/status. Values never leave it. */
function workerSection() {
  const { services } = getState();

  if (!services.reachable) {
    return section("API keys", {
      subtitle: "Held by the Cloudflare Worker, never by this browser",
      body: notice(
        "The API worker is not answering",
        "Serving the dashboard from a plain static server means there is no /api route, so no key-backed feature can work. Run `npx wrangler dev` locally, or deploy with `npx wrangler deploy`.",
        { tone: "warn", iconName: "plug" },
      ),
    });
  }

  return section("API keys", {
    subtitle: "Held by the Cloudflare Worker, never by this browser",
    body: rows(WORKER_PROVIDERS.map((provider) => {
      const entry = WORKER_SECRETS[provider];
      const present = services.providers[provider] === true;
      return row({
        main: entry.label,
        sub: present ? entry.detail : `Not set — run: wrangler secret put ${entry.secret}`,
        iconName: "plug",
        side: pill(present ? "connected" : "not_connected"),
      });
    })),
  });
}

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

      ${workerSection()}

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
          row({
            main: "Model provider",
            sub: providerReady() ? `${connectedProvider().name}, keyed by the Worker` : "Not connected — no key is stored in this project",
            iconName: "sparkle",
            side: pill(providerReady() ? "connected" : "not_connected"),
          }),
        ]),
      })}
    </div>
  `;
}

/**
 * Model picker.
 *
 * Outside the settings form on purpose: changing model or effort takes effect
 * immediately rather than waiting for a save, because the reason to change it is
 * usually that the current one is costing too much right now.
 */
function modelSection() {
  const { data } = getState();
  const { provider, model, effort } = activeModel();
  const available = modelsForProvider(provider);

  const spend = data.aiUsage.reduce((total, usage) => total + Number(usage.cost || 0), 0);
  const thisMonth = data.aiUsage
    .filter((usage) => isSameMonth(usage.occurred_at))
    .reduce((total, usage) => total + Number(usage.cost || 0), 0);

  const options = available.map((entry) => ({
    value: entry.id,
    label: `${entry.label} · ${formatPerMTok(entry)}`,
  }));

  return section("Model", {
    subtitle: "Applies immediately — no save needed",
    body: `
      <div class="field-grid">
        ${field("Model", select("model", options, model?.id, { attrs: 'data-action="model-select"' }), {
          hint: model ? `about ${formatCurrency(estimatedTurnCost(model.id), 4)} per assistant turn` : "",
        })}
        ${model?.supportsEffort
          ? field("Effort", select("effort", EFFORT_LEVELS.map((level) => ({ value: level.id, label: `${level.label} — ${level.note}` })), effort, { attrs: 'data-action="effort-select"' }), { hint: "how much the model thinks — the biggest cost lever" })
          : field("Effort", input("effort_disabled", "Not supported on this model", { attrs: "disabled" }), { hint: "only the current models have an effort control" })}
      </div>
      ${model?.note ? `<p class="faint">${escapeHtml(model.note)}</p>` : ""}
      ${rows([
        row({
          main: "Spend so far",
          sub: data.aiUsage.length
            ? `${formatNumber(data.aiUsage.length)} recorded call${data.aiUsage.length === 1 ? "" : "s"} · ${formatCurrency(thisMonth, 2)} this month`
            : "Nothing recorded yet — every assistant turn is logged here with its real token count",
          iconName: "dollar",
          side: `<strong>${formatCurrency(spend, 2)}</strong>`,
        }),
      ])}
    `,
  });
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
            main: "Google Maps key",
            sub: mapsKeySource(),
            iconName: "radar",
            side: pill(workerHoldsMapsKey() || getStoredApiKey() ? "connected" : "not_connected"),
          }),
        ]),
      })}

      ${modelSection()}

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
