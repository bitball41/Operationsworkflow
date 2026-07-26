import { NAV_GROUPS, PAGE_META } from "../config.js";
import { icon, hydrateIcons } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, initials } from "../core/utils.js";

function countFor(itemId, data) {
  if (itemId === "approvals") return data.approvals.filter((item) => item.status === "pending").length;
  if (itemId === "follow-ups") return data.followUps.filter((item) => ["due", "scheduled"].includes(item.status)).length;
  if (itemId === "inbox") return data.communications.filter((item) => item.direction === "inbound").length;
  if (itemId === "pipeline") return data.leads.filter((item) => !["won", "lost"].includes(item.status)).length;
  return 0;
}

export function renderShellChrome() {
  const { route, data, user, mode } = getState();
  const nav = document.getElementById("primary-nav");
  nav.innerHTML = NAV_GROUPS.map((group) => `
    <section class="nav-group">
      <span class="nav-label">${escapeHtml(group.label)}</span>
      ${group.items.map((item) => {
        const count = countFor(item.id, data);
        return `<a class="nav-item ${route === item.id ? "is-active" : ""}" href="#/${item.id}" data-route="${item.id}">${icon(item.icon)}<span>${escapeHtml(item.label)}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</a>`;
      }).join("")}
    </section>
  `).join("");

  const meta = PAGE_META[route] || PAGE_META["command-center"];
  document.getElementById("page-title").textContent = meta.title;
  document.getElementById("page-kicker").textContent = meta.kicker;
  document.title = `${meta.title} · Operations`;

  const name = data.profile?.full_name || user?.user_metadata?.full_name || "Owner";
  document.getElementById("account-name").textContent = name;
  document.getElementById("account-email").textContent = mode === "preview" ? "Preview workspace" : (user?.email || "Owner workspace");
  document.getElementById("account-avatar").textContent = initials(name);

  const signOutButton = document.getElementById("sign-out-button");
  const signOutLabel = mode === "preview" ? "Exit preview" : "Sign out";
  signOutButton.setAttribute("aria-label", signOutLabel);
  signOutButton.title = signOutLabel;

  const unread = data.notifications.filter((item) => !item.is_read).length;
  const badge = document.getElementById("notification-badge");
  badge.textContent = unread;
  badge.hidden = !unread;
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

