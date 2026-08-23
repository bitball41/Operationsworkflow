import { FULL_BLEED_ROUTES, NAV_GROUPS, PAGE_TITLES } from "../config.js";
import { hydrateIcons, icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, relativeTime } from "../core/utils.js";
import { attentionItems, clientLifecycleRows } from "../services/operations.js";

const PRIMARY_ROUTE = Object.freeze({
  "my-day": "home",
  discovery: "pipeline",
  leads: "pipeline",
  outreach: "pipeline",
  "follow-ups": "pipeline",
  calendar: "meetings",
  notes: "playbooks",
  studio: "playbooks",
  templates: "playbooks",
  demos: "playbooks",
  automation: "playbooks",
  projects: "clients",
  onboarding: "clients",
  deployments: "clients",
  maintenance: "clients",
  "automation-studio": "voice-agents",
  subscriptions: "payments",
  commissions: "payments",
  analytics: "payments",
  costs: "payments",
  pricing: "payments",
  integrations: "settings",
});

const ALERT_ROUTES = new Set(["home", "inbox", "voice-agents", "payments", "clients"]);

/* Only counts that mean "you have something to do" are shown. */
function navCount(itemId, state) {
  const { data, automation } = state;
  if (itemId === "home") return attentionItems().length;
  if (itemId === "inbox") {
    return data.emailThreads.filter((item) => item.is_unread).length
      + data.followUps.filter((item) => (
        !["sent", "replied", "completed", "dead", "skipped", "cancelled"].includes(item.status)
        && item.due_at && new Date(item.due_at) <= new Date()
      )).length;
  }
  if (itemId === "voice-agents") {
    return data.voiceAgents.filter((item) => item.last_error || item.status === "error").length
      + data.automations.filter((item) => item.last_error).length;
  }
  if (itemId === "calling") return data.leads.filter((item) => ["new", "ready_to_contact"].includes(item.status)).length;
  if (itemId === "meetings") {
    return data.meetings.filter((item) => item.outcome === "proposal_needed" || item.outcome === "technical_discovery_required").length;
  }
  if (itemId === "clients") return clientLifecycleRows(data, { includeExamples: false }).filter((item) => !item.serviceActive || item.tone === "red").length;
  if (itemId === "pipeline") return data.leads.filter((item) => ["new", "ready_to_contact"].includes(item.status)).length;
  if (itemId === "payments") return data.payments.filter((item) => ["overdue", "failed"].includes(item.status)).length;
  if (itemId === "automation" && (automation.status === "running" || automation.status === "stopping")) return "•";
  return 0;
}

export function renderShell() {
  const state = getState();
  const { route } = state;

  document.getElementById("nav").innerHTML = NAV_GROUPS.map((group) => `
    <section class="nav__group">
      ${group.label ? `<span class="nav__label">${escapeHtml(group.label)}</span>` : ""}
      ${group.items.map((item) => {
        const count = navCount(item.id, state);
        const activeRoute = PRIMARY_ROUTE[route] || route;
        return `<a class="nav__item${activeRoute === item.id ? " is-active" : ""}" href="#/${item.id}" title="${escapeHtml(item.label)}">
          ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
          ${count ? `<span class="nav__count${ALERT_ROUTES.has(item.id) ? " nav__count--alert" : ""}">${count}</span>` : ""}
        </a>`;
      }).join("")}
    </section>
  `).join("");

  const connection = workspaceConnectionStatus(state.connection);
  document.getElementById("sidebar-foot").innerHTML = connection.href ? `
    <a class="sidebar__status sidebar__status--${connection.tone}" href="${connection.href}" title="${escapeHtml(connection.message)}">
      ${icon(connection.iconName)}<span>${escapeHtml(connection.label)}</span>
    </a>
  ` : `
    <div class="sidebar__status sidebar__status--${connection.tone}" title="${escapeHtml(connection.message)}">
      ${icon(connection.iconName)}<span>${escapeHtml(connection.label)}</span>
    </div>
  `;

  const title = PAGE_TITLES[route] || "Operations";
  document.getElementById("page-title").textContent = title;
  document.title = `${title} · Conno Operations`;

  const page = document.getElementById("page");
  page.classList.toggle("page--full", FULL_BLEED_ROUTES.includes(route));

  document.getElementById("app").classList.toggle("is-collapsed", state.navCollapsed);
  hydrateIcons(document.getElementById("app"));
}

export function workspaceConnectionStatus(connection = {}) {
  if (connection.status === "synced" && connection.ok) {
    return {
      tone: "ok",
      iconName: "globe",
      label: connection.lastSyncedAt ? `Synced ${relativeTime(connection.lastSyncedAt)}` : "Workspace synced",
      message: "The latest workspace snapshot loaded successfully.",
      href: "",
    };
  }
  if (connection.status === "refreshing") {
    return {
      tone: "busy",
      iconName: "refresh",
      label: connection.lastSyncedAt ? "Refreshing workspace…" : "Connecting…",
      message: connection.message || "Refreshing workspace…",
      href: "",
    };
  }
  if (connection.status === "auth_error") {
    return {
      tone: "error",
      iconName: "alert",
      label: "Access needs attention",
      message: connection.message || "Cloudflare Access could not verify this request.",
      href: "#/settings",
    };
  }
  if (connection.status === "degraded" || connection.ok === false) {
    return {
      tone: "error",
      iconName: "alert",
      label: connection.lastSyncedAt ? `Sync paused · last ${relativeTime(connection.lastSyncedAt)}` : "Workspace unavailable",
      message: connection.message || "The workspace service is unavailable.",
      href: "#/settings",
    };
  }
  return {
    tone: "busy",
    iconName: "refresh",
    label: "Connecting…",
    message: connection.message || "Opening workspace…",
    href: "",
  };
}

export function setNav(open) {
  document.getElementById("sidebar").classList.toggle("is-open", open);
  document.getElementById("scrim").hidden = !open;
  document.body.style.overflow = open && window.innerWidth <= 900 ? "hidden" : "";
}
