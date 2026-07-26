import { FULL_BLEED_ROUTES, NAV_GROUPS, PAGE_TITLES } from "../config.js";
import { hydrateIcons, icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml } from "../core/utils.js";

/* Only counts that mean "you have something to do" are shown. */
function navCount(itemId, state) {
  const { data, automation } = state;
  if (itemId === "discovery") return data.discoveryResults.filter((item) => item.decision === "pending").length;
  if (itemId === "inbox") return data.emailThreads.filter((item) => item.is_unread).length;
  if (itemId === "follow-ups") {
    return data.followUps.filter((item) => (
      !["sent", "replied", "completed", "dead", "skipped", "cancelled"].includes(item.status)
      && item.due_at && new Date(item.due_at) <= new Date()
    )).length;
  }
  if (itemId === "outreach") return data.drafts.filter((item) => ["ready", "approved"].includes(item.status)).length;
  if (itemId === "tasks") {
    return data.tasks.filter((item) => !["completed", "cancelled"].includes(item.status) && item.due_at && new Date(item.due_at) <= new Date()).length;
  }
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
        const alert = item.id === "follow-ups" || item.id === "inbox";
        return `<a class="nav__item${route === item.id ? " is-active" : ""}" href="#/${item.id}" title="${escapeHtml(item.label)}">
          ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
          ${count ? `<span class="nav__count${alert ? " nav__count--alert" : ""}">${count}</span>` : ""}
        </a>`;
      }).join("")}
    </section>
  `).join("");

  document.getElementById("sidebar-foot").innerHTML = `
    <div class="sidebar__status">
      ${icon(state.storage === "cloud" ? "globe" : "file")}
      <span>${state.storage === "cloud" ? "Synced" : "Local data"}</span>
    </div>
    ${state.connection.ok ? "" : `<a class="sidebar__status" href="#/settings" style="color:var(--amber)">${icon("alert")}<span>${escapeHtml(state.connection.message)}</span></a>`}
  `;

  const title = PAGE_TITLES[route] || "Operations";
  document.getElementById("page-title").textContent = title;
  document.title = `${title} · Operations`;

  const page = document.getElementById("page");
  page.classList.toggle("page--full", FULL_BLEED_ROUTES.includes(route));

  document.getElementById("app").classList.toggle("is-collapsed", state.navCollapsed);
  hydrateIcons(document.getElementById("app"));
}

export function setNav(open) {
  document.getElementById("sidebar").classList.toggle("is-open", open);
  document.getElementById("scrim").hidden = !open;
  document.body.style.overflow = open && window.innerWidth <= 900 ? "hidden" : "";
}
