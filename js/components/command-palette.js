import { NAV_GROUPS } from "../config.js";
import { icon, hydrateIcons } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml } from "../core/utils.js";

export function openCommandPalette() {
  const root = document.getElementById("command-palette-root");
  root.innerHTML = `
    <div class="command-backdrop" data-action="close-command-palette">
      <section class="command-palette" role="dialog" aria-modal="true" aria-label="Search workspace">
        <div class="command-search">${icon("search")}<input id="command-input" autocomplete="off" placeholder="Search pages, prospects, and actions…"><kbd style="color:var(--muted)">Esc</kbd></div>
        <div id="command-results" class="command-results"></div>
      </section>
    </div>
  `;
  root.querySelector(".command-palette").addEventListener("click", (event) => event.stopPropagation());
  const input = root.querySelector("#command-input");
  input.addEventListener("input", () => renderResults(input.value));
  renderResults("");
  input.focus();
  document.body.style.overflow = "hidden";
  hydrateIcons(root);
}

export function closeCommandPalette() {
  document.getElementById("command-palette-root").innerHTML = "";
  document.body.style.overflow = "";
}

function renderResults(query) {
  const normalized = query.trim().toLowerCase();
  const pageResults = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({
    kind: "Page",
    title: item.label,
    subtitle: group.label,
    icon: item.icon,
    action: "navigate",
    route: item.id,
  })));
  const leadResults = getState().data.leads.map((lead) => ({
    kind: "Prospect",
    title: lead.business_name,
    subtitle: [lead.category, lead.city].filter(Boolean).join(" · "),
    icon: "building-2",
    action: "open-lead",
    id: lead.id,
  }));
  const actions = [
    { kind: "Action", title: "Add a new lead", subtitle: "Manual prospect entry", icon: "plus", action: "new-lead" },
    { kind: "Action", title: "Compose an outreach draft", subtitle: "Prepare, then approve", icon: "send", action: "new-draft" },
    { kind: "Action", title: "Queue a manual agent run", subtitle: "No external model call", icon: "bot", action: "queue-agent-run" },
  ];
  const results = [...pageResults, ...leadResults, ...actions]
    .filter((item) => !normalized || `${item.title} ${item.subtitle} ${item.kind}`.toLowerCase().includes(normalized))
    .slice(0, 14);
  const container = document.getElementById("command-results");
  container.innerHTML = results.map((item, index) => `
    <button class="command-result ${index === 0 ? "is-selected" : ""}" data-action="${item.action}" ${item.route ? `data-route-target="${item.route}"` : ""} ${item.id ? `data-id="${item.id}"` : ""}>
      <span>${icon(item.icon)}</span>
      <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle || "")}</small></span>
      <span>${item.kind}</span>
    </button>
  `).join("") || `<div class="empty-state" style="min-height:150px"><p>No results.</p></div>`;
  hydrateIcons(container);
}

