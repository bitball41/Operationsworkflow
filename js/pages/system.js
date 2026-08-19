/** Integrations and Settings. */
import { CONFIG } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatNumber, isSameMonth } from "../core/utils.js";
import {
  advanced,
  btn,
  field,
  input,
  notice,
  pageHeader,
  pill,
  row,
  rows,
  section,
  select,
  textarea,
} from "../components/ui.js";
import { integrationList, isConnected, outlookBlocker } from "../services/integrations.js";
import { activeModel, connectedProvider, MODEL_PROVIDERS, providerReady } from "../services/ai/provider.js";
import { preferences } from "../services/data.js";
import { workerHoldsMapsKey } from "../services/openscout/adapter.js";
import { AI_PERMISSION_MODES, aiPermissionMode, listTools, permissionAllows, permissionDefinition } from "../services/ai/tools.js";
import { contextSections } from "../services/ai/context.js";
import { WORKER_PROVIDERS } from "../services/api.js";
import { EFFORT_LEVELS, formatPerMTok } from "../data/models.js";
import { isOwner, ownerOnlyNotice } from "../services/permissions.js";

/* External capabilities reported by the Cloudflare Worker. */
const WORKER_SECRETS = Object.freeze({
  outlook: {
    label: "Outlook",
    secret: "Microsoft OAuth secrets + OUTLOOK_TOKENS KV",
    detail: "Outreach through Microsoft Graph for this Operations workspace",
  },
  anthropic: { label: "Anthropic", secret: "ANTHROPIC_API_KEY", detail: "Assistant replies and model-driven tool calls" },
  openai: { label: "OpenAI", secret: "OPENAI_API_KEY", detail: "Responses API assistant and model-driven tool calls" },
  kimi: { label: "Kimi", secret: "KIMI_API_KEY + KIMI_MODEL", detail: "OpenAI-compatible Chat Completions boundary" },
  qwen: { label: "Qwen", secret: "QWEN_API_KEY + QWEN_MODEL + QWEN_BASE_URL", detail: "OpenAI-compatible Model Studio boundary" },
  whop: { label: "Whop", secret: "WHOP_WEBHOOK_SECRET + server-only Supabase secrets", detail: "Signed payment and refund webhooks" },
  google_maps: { label: "Google Maps", secret: "GOOGLE_MAPS_API_KEY", detail: "Lead discovery through the Places API" },
  cloudflare: { label: "Cloudflare", secret: "DEMO_SITES R2 binding", detail: "Public demo publishing and R2 hosting" },
  research: { label: "Browser research", secret: "BROWSER binding", detail: "Public-page research for the assistant" },
  mcp: { label: "MCP tool server", secret: "MCP_API_TOKEN", detail: "External agent access to the selected operations tools" },
});

/* Keep a newly reported Worker capability from taking the entire page down
   before its presentation metadata is added above. */
function workerSecretEntry(provider) {
  return WORKER_SECRETS[provider] || {
    label: String(provider || "Worker capability").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
    secret: "Worker configuration",
    detail: "Capability reported by the Cloudflare Worker",
  };
}

function mapsKeySource() {
  if (workerHoldsMapsKey()) return "Served by the Cloudflare Worker to every browser";
  return "Not set — add GOOGLE_MAPS_API_KEY to the Cloudflare Worker.";
}

/**
 * Outlook's row, which has three states rather than two.
 *
 * The Worker reports whether its Microsoft configuration is present and whether
 * the one Operations workspace has connected a mailbox.
 */
function outlookRow() {
  const { services } = getState();
  const outlook = services.outlook || {};
  const entry = workerSecretEntry("outlook");

  if (!outlook.configured) {
    return row({
      main: entry.label,
      sub: outlook.missing?.length
        ? `Not configured — the Worker is missing ${outlook.missing.join(", ")}`
        : `Not configured — requires ${entry.secret}`,
      iconName: "plug",
      side: pill("not_connected"),
    });
  }
  if (!outlook.connected) {
    return row({
      main: entry.label,
      sub: "Configured and ready. No mailbox connected yet.",
      iconName: "plug",
      side: pill("warning", "Not connected"),
    });
  }
  return row({
    main: entry.label,
    sub: `${outlook.account || entry.detail}${outlook.can_read_mail ? "" : " · send only, reconnect to read the inbox"}`,
    iconName: "plug",
    side: pill("connected"),
  });
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
      if (provider === "outlook") return outlookRow();
      const entry = workerSecretEntry(provider);
      const present = services.providers[provider] === true;
      const modelStatus = services.aiProviders?.[provider];
      return row({
        main: entry.label,
        sub: modelStatus
          ? `${modelStatus.model || "No model configured"} · ${modelStatus.reason || entry.detail}`
          : present ? entry.detail : `Not connected — requires ${entry.secret}`,
        iconName: "plug",
        side: pill(present ? "connected" : "not_connected"),
      });
    })),
  });
}

function integrationAction(item) {
  if (!isOwner()) return pill("warning", "View only");
  if (item.available === false) return pill("warning", "Unavailable");
  if (item.provider === "outlook") {
    const outlook = getState().services.outlook || {};
    if (!outlook.configured) {
      return btn("Set up", { action: "integration-setup", size: "sm", attrs: 'data-provider="outlook"' });
    }
    return item.status === "connected"
      ? btn("Disconnect", { action: "outlook-disconnect", size: "sm" })
      : btn("Connect", { action: "outlook-connect", size: "sm", variant: "primary" });
  }
  if (item.provider === "whop") {
    return isConnected("whop")
      ? pill("connected", "Webhook live")
      : btn("Set up", { action: "integration-setup", size: "sm", attrs: 'data-provider="whop"' });
  }
  return item.manage
    ? btn("Manage", { action: "navigate", size: "sm", attrs: `data-route-target="${item.manage}"` })
    : btn("Set up", { action: "integration-setup", size: "sm", attrs: `data-provider="${item.provider}"` });
}

export function renderIntegrations() {
  const state = getState();
  const integrations = integrationList();
  const connected = integrations.filter((item) => item.status === "connected").length;
  const outlookResult = state.routeParams?.outlook;
  const outlookNotice = outlookResult === "connected"
    ? notice("Outlook connected", "Outreach can now send through the Microsoft account you approved.", { tone: "success", iconName: "mail" })
    : outlookResult === "failed"
      ? notice("Outlook did not connect", state.routeParams?.detail || "Try the connection again.", { tone: "error", iconName: "alert" })
      : outlookResult === "cancelled"
        ? notice("Outlook connection cancelled", "No mailbox access was saved.", { tone: "warn", iconName: "mail" })
        : "";

  const blocker = outlookBlocker();

  return `
    <div class="stack">
      ${pageHeader({
        title: "Integrations",
        subtitle: "Capability status reported by the Worker. Unavailable adapters are labeled honestly.",
      })}
      ${outlookNotice}
      ${isOwner() ? "" : notice("Integration administration is owner-only", ownerOnlyNotice("Connecting, disconnecting, or configuring services"), { tone: "warn", iconName: "plug" })}
      ${blocker ? notice("Email is not sending", blocker, {
        tone: "warn",
        iconName: "mail",
        actions: "",
      }) : ""}
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
          side: `${pill(item.status)}${integrationAction(item)}`,
        }))),
      })}

      ${section("Tool layer", {
        subtitle: `${formatNumber(listTools().length)} operations available to the assistant and, later, to an MCP client`,
        body: rows([
          row({ main: "Deterministic operations", sub: "Discovery, assignment, calls, meetings, pipeline, onboarding, projects, payments, and commissions", iconName: "tool" }),
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
  const availableProviders = MODEL_PROVIDERS.filter((entry) => getState().services?.providers?.[entry.id] === true);

  const spend = data.aiUsage.reduce((total, usage) => total + Number(usage.cost || 0), 0);
  const thisMonth = data.aiUsage
    .filter((usage) => isSameMonth(usage.occurred_at))
    .reduce((total, usage) => total + Number(usage.cost || 0), 0);

  const providerOptions = (availableProviders.length ? availableProviders : MODEL_PROVIDERS).map((entry) => ({
    value: entry.id,
    label: entry.name,
  }));

  return section("Model", {
    subtitle: "Provider models are configured and verified by the Worker",
    body: `
      <div class="field-grid">
        ${field("Provider", select("ai_provider", providerOptions, provider, { attrs: `data-action="ai-provider-select"${isOwner() ? "" : " disabled"}` }), {
          hint: availableProviders.length ? "Only live-verified providers can become active" : "No provider has passed its Worker health check",
        })}
        ${field("Worker model", input("model", providerReady() ? model?.id : "Not connected", { attrs: "disabled" }), {
          hint: providerReady() && model ? formatPerMTok(model) : "A model appears only after the deployed Worker passes its provider check",
        })}
        ${model?.supportsEffort
          ? field("Effort", select("effort", EFFORT_LEVELS.map((level) => ({ value: level.id, label: `${level.label} — ${level.note}` })), effort, { attrs: `data-action="effort-select"${isOwner() ? "" : " disabled"}` }), { hint: "how much the model thinks — the biggest cost lever" })
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

function aiAccessSection() {
  const current = aiPermissionMode();
  const permission = permissionDefinition(current);
  const tools = listTools();
  const allowed = tools.filter((tool) => permissionAllows(tool, current)).length;

  return section("AI access", {
    subtitle: "Controls model-chosen actions across the workspace",
    body: `
      <div class="field-grid">
        ${field("Permission mode", select(
          "ai_permission_mode",
          AI_PERMISSION_MODES.map((mode) => ({ value: mode.id, label: mode.label })),
          current,
          { attrs: `data-action="ai-permission-select"${isOwner() ? "" : " disabled"}` },
        ), { hint: permission.description })}
        ${field("Available tools", input("ai_tool_count", `${allowed} of ${tools.length}`, { attrs: "disabled" }), { hint: "Direct commands you type remain explicit user actions." })}
      </div>
      <div class="permission-cards">
        ${AI_PERMISSION_MODES.map((mode) => `
          <div class="permission-card${mode.id === current ? " is-active" : ""}">
            <span>${escapeHtml(mode.label)}</span>
            <p>${escapeHtml(mode.description)}</p>
            <small>${tools.filter((tool) => permissionAllows(tool, mode.id)).length} tools</small>
          </div>
        `).join("")}
      </div>
    `,
  });
}

export function renderSettings() {
  const state = getState();
  const settings = preferences();

  return `
    <div class="stack">
      ${pageHeader({
        title: "Settings",
        subtitle: "Workspace preferences, model access, and server-side connections. Secrets stay on the Worker.",
      })}
      ${state.connection.ok ? "" : notice("Database connection issue", state.connection.message, { tone: "warn", iconName: "alert" })}

      ${section("Data", {
        body: rows([
          row({
            main: "Protected by Cloudflare Access",
            sub: "Workspace records and private assets stay behind the Worker",
            iconName: "layers",
            side: pill("connected", "Secure"),
          }),
          row({
            main: "Google Maps key",
            sub: mapsKeySource(),
            iconName: "radar",
            side: pill(workerHoldsMapsKey() ? "connected" : "not_connected"),
          }),
        ]),
      })}

      ${modelSection()}
      ${aiAccessSection()}
      ${isOwner() ? "" : notice("Workspace settings are owner-only", ownerOnlyNotice("Changing business settings, AI permissions, or provider selection"), { tone: "warn", iconName: "settings" })}

      <form class="stack" data-form="settings">
        <fieldset class="owner-settings"${isOwner() ? "" : " disabled"}>
        ${section("Business", {
          body: `<div class="field-grid">
            ${field("Owner name", input("owner_name", settings.owner_name || CONFIG.owner))}
            ${field("Business name", input("business_name", settings.business_name || ""))}
            ${field("Default setup fee", input("default_setup_fee", settings.default_setup_fee ?? CONFIG.defaultSetupFee, { type: "number", attrs: 'min="0" step="50"' }))}
            ${field("Default monthly fee", input("default_monthly_fee", settings.default_monthly_fee ?? CONFIG.defaultMonthlyFee, { type: "number", attrs: 'min="0" step="25"' }))}
          </div>`,
        })}

        ${section("Sales follow-up", {
          body: `
            <div class="field-grid">
              ${field("Sending email", input("default_email", settings.default_email || "", { type: "email", placeholder: "you@example.com" }))}
              ${field("Follow-up cadence", input("follow_up_days", (settings.follow_up_days || [3, 7, 14]).join(", ")), { hint: "days" })}
              ${field("Daily target", input("batch_target", settings.batch_target ?? CONFIG.defaultBatchTarget, { type: "number", attrs: 'min="1" max="500"' }))}
            </div>
            ${field("Signature", textarea("signature", settings.signature || CONFIG.owner, { attrs: 'rows="3"' }))}
          `,
        })}

        ${section("Operations", {
          body: `<div class="field-grid">
            ${field("Legacy preview domain", input("preview_domain", settings.preview_domain || CONFIG.previewDomain), { hint: "kept for existing website artifacts; not part of the primary agency workflow" })}
            ${field("Time zone", select("timezone", ["America/Chicago", "America/New_York", "America/Denver", "America/Los_Angeles", "UTC"].map((zone) => ({ value: zone, label: zone })), settings.timezone || "America/Chicago"))}
          </div>`,
        })}

        <div class="btn-row">
          ${isOwner() ? btn("Save settings", { type: "submit", variant: "primary" }) : pill("warning", "View only")}
        </div>
        </fieldset>
      </form>

      ${advanced("Workspace security", `
        ${rows([
          row({
            main: "Cloudflare Access",
            sub: "The sole sign-in boundary for Operations",
            iconName: "check-circle",
            side: pill("connected", "Active"),
          }),
          row({
            main: "Database access",
            sub: "Server-side only; no account or database key is stored in this browser",
            iconName: "layers",
            side: pill("connected", "Worker"),
          }),
        ])}
        <p class="faint">To leave Operations, use the Cloudflare Access logout for this domain. The app itself has no user accounts.</p>
      `)}
    </div>
  `;
}
