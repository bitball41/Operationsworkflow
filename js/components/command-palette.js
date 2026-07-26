import { NAV_GROUPS } from "../config.js";
import { hydrateIcons, icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml } from "../core/utils.js";

let selectedIndex = 0;
let results = [];

export function openPalette() {
  const root = document.getElementById("palette-root");
  root.innerHTML = `
    <div class="palette-backdrop">
      <section class="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div class="palette__search">${icon("search")}<input id="palette-input" autocomplete="off" placeholder="Search pages, leads, clients, demos…"></div>
        <div class="palette__results" id="palette-results"></div>
      </section>
    </div>
  `;
  /* Only the backdrop itself closes; result clicks must reach the delegated
     action handler. */
  const backdrop = root.querySelector(".palette-backdrop");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closePalette();
  });
  const input = root.querySelector("#palette-input");
  input.addEventListener("input", () => render(input.value));
  input.addEventListener("keydown", onKeyDown);
  render("");
  input.focus();
  document.body.style.overflow = "hidden";
  hydrateIcons(root);
}

export function closePalette() {
  const root = document.getElementById("palette-root");
  if (root) root.innerHTML = "";
  document.body.style.overflow = "";
}

export function isPaletteOpen() {
  return Boolean(document.getElementById("palette-root")?.innerHTML);
}

function onKeyDown(event) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = Math.min(results.length - 1, selectedIndex + 1);
    paint();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex = Math.max(0, selectedIndex - 1);
    paint();
  } else if (event.key === "Enter") {
    event.preventDefault();
    document.querySelectorAll(".palette__result")[selectedIndex]?.click();
  }
}

function candidates() {
  const { data } = getState();
  return [
    ...NAV_GROUPS.flatMap((group) => group.items.map((item) => ({
      kind: "Page", title: item.label, sub: group.label, icon: item.icon, action: "navigate", attrs: `data-route-target="${item.id}"`,
    }))),
    ...data.leads.map((lead) => ({
      kind: "Lead", title: lead.business_name, sub: [lead.category, lead.city].filter(Boolean).join(" · "), icon: "building", action: "lead-open", attrs: `data-id="${lead.id}"`,
    })),
    ...data.demos.map((demo) => ({
      kind: "Demo", title: demo.name, sub: demo.status, icon: "monitor", action: "demo-studio", attrs: `data-id="${demo.id}"`,
    })),
    ...data.clients.map((client) => ({
      kind: "Client", title: data.leads.find((lead) => lead.id === client.lead_id)?.business_name || "Client", sub: client.status, icon: "briefcase", action: "client-open", attrs: `data-id="${client.id}"`,
    })),
    ...data.notes.filter((note) => !note.is_archived).map((note) => ({
      kind: "Note", title: note.title, sub: note.category, icon: "note", action: "note-open", attrs: `data-id="${note.id}"`,
    })),
    { kind: "Action", title: "Start automation", sub: "Run the outreach batch", icon: "play", action: "automation-start", attrs: "" },
    { kind: "Action", title: "Add lead", sub: "Manual entry", icon: "plus", action: "lead-new", attrs: "" },
    { kind: "Action", title: "New task", sub: "", icon: "check-square", action: "task-new", attrs: "" },
  ];
}

function render(query) {
  const value = query.trim().toLowerCase();
  results = candidates()
    .filter((item) => !value || `${item.title} ${item.sub} ${item.kind}`.toLowerCase().includes(value))
    .slice(0, 12);
  selectedIndex = 0;
  paint();
}

function paint() {
  const container = document.getElementById("palette-results");
  if (!container) return;
  container.innerHTML = results.map((item, index) => `
    <button class="palette__result${index === selectedIndex ? " is-selected" : ""}" type="button" data-action="${item.action}" ${item.attrs}>
      ${icon(item.icon)}
      <span><strong>${escapeHtml(item.title)}</strong>${item.sub ? `<small>${escapeHtml(item.sub)}</small>` : ""}</span>
      <span class="palette__kind">${escapeHtml(item.kind)}</span>
    </button>
  `).join("") || `<p class="faint" style="padding:14px">No matches.</p>`;
  hydrateIcons(container);
}
