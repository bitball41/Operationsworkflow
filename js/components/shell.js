import { NAV_GROUPS, PAGE_META } from "../config.js";
import { icon, hydrateIcons } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, initials } from "../core/utils.js";

function countFor(itemId, data) {
  if (itemId === "discovery") return data.discoveryResults.filter((item) => item.decision === "pending").length;
  if (itemId === "follow-ups") return data.followUps.filter((item) => ["due", "overdue"].includes(item.status)).length;
  if (itemId === "inbox") return data.emailThreads.filter((item) => item.is_unread).length;
  if (itemId === "pipeline") return data.leads.filter((item) => !["won", "lost"].includes(item.status)).length;
  if (itemId === "tasks") return data.tasks.filter((item) => item.status !== "completed" && new Date(item.due_at || "2999") <= new Date()).length;
  return 0;
}

export function renderShellChrome() {
  const state = getState();
  const { route, data, user, mode, sidebarCollapsed } = state;
  const nav = document.getElementById("primary-nav");
  nav.innerHTML = NAV_GROUPS.map((group) => `
    <section class="nav-group">
      <span class="nav-label">${escapeHtml(group.label)}</span>
      ${group.items.map((item) => {
        const count = countFor(item.id, data);
        return `<a class="nav-item ${route === item.id ? "is-active" : ""}" href="#/${item.id}" data-route="${item.id}" title="${escapeHtml(item.label)}">${icon(item.icon)}<span>${escapeHtml(item.label)}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</a>`;
      }).join("")}
    </section>
  `).join("");

  const dockItems = [
    ["home", "Home", "layout-dashboard"],
    ["leads", "Leads", "building-2"],
    ["pipeline", "Pipeline", "columns-3"],
    ["tasks", "Tasks", "clipboard-check"],
  ];
  document.getElementById("mobile-dock").innerHTML = `
    ${dockItems.map(([id, label, iconName]) => `<a class="dock-item ${route === id ? "is-active" : ""}" href="#/${id}">${icon(iconName)}<span>${label}</span></a>`).join("")}
    <button class="dock-item" type="button" data-action="open-mobile-nav">${icon("menu")}<span>More</span></button>
  `;

  const meta = PAGE_META[route] || PAGE_META.home;
  document.getElementById("page-title").textContent = meta.title;
  document.getElementById("page-kicker").textContent = meta.kicker;
  document.title = `${meta.title} · Operations`;

  const name = data.profile?.full_name || data.profile?.preferences?.owner_name || user?.user_metadata?.full_name || "Owner";
  document.getElementById("account-name").textContent = name;
  document.getElementById("account-email").textContent = mode === "preview" ? "Preview workspace" : (user?.email || "Owner workspace");
  document.getElementById("account-avatar").textContent = initials(name);
  document.getElementById("top-account-avatar").textContent = initials(name);

  const unread = data.notifications.filter((item) => !item.is_read).length;
  const notificationBadge = document.getElementById("notification-badge");
  notificationBadge.textContent = unread;
  notificationBadge.hidden = !unread;

  const pending = data.approvals.filter((item) => item.status === "pending").length;
  const approvalBadge = document.getElementById("approval-badge");
  approvalBadge.textContent = pending;
  approvalBadge.hidden = !pending;

  const run = data.agentRuns.find((item) => ["running", "paused", "waiting_approval", "queued"].includes(item.status));
  document.getElementById("orchestrator-compact-status").textContent = run
    ? `${run.status === "running" ? "Working" : run.status === "waiting_approval" ? "Awaiting approval" : run.status[0].toUpperCase() + run.status.slice(1)} · ${Number(run.progress || 0)}%`
    : "Idle";

  document.getElementById("app-shell").classList.toggle("is-sidebar-collapsed", sidebarCollapsed);
  const collapse = document.getElementById("sidebar-collapse");
  collapse.setAttribute("aria-label", sidebarCollapsed ? "Expand navigation" : "Collapse navigation");
  collapse.innerHTML = icon(sidebarCollapsed ? "chevron-right" : "panel-right-open");
  hydrateIcons(document.getElementById("app-shell"));
}

export function setShellVisibility(isVisible) {
  document.getElementById("app-shell").hidden = !isVisible;
  document.getElementById("auth-screen").hidden = isVisible;
  document.getElementById("loading-screen").hidden = true;
}

export function setMobileNav(open) {
  document.getElementById("sidebar").classList.toggle("is-open", open);
  document.getElementById("sidebar-scrim").hidden = !open;
}
