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
  const data = getState().data;
  const leadResults = data.leads.map((lead) => ({
    kind: "Prospect",
    title: lead.business_name,
    subtitle: [lead.category, lead.city].filter(Boolean).join(" · "),
    icon: "building-2",
    action: "open-lead",
    id: lead.id,
  }));
  const clientResults = data.clients.map((client) => {
    const lead = data.leads.find((item) => item.id === client.lead_id);
    return { kind: "Client", title: lead?.business_name || "Client", subtitle: client.contact_name || client.domain || "Client record", icon: "briefcase-business", action: "open-client", id: client.id };
  });
  const demoResults = data.demos.map((demo) => ({
    kind: "Demo",
    title: demo.name,
    subtitle: demo.slug || demo.status,
    icon: "monitor-up",
    action: "open-demo",
    id: demo.id,
  }));
  const threadResults = data.emailThreads.map((thread) => ({
    kind: "Email",
    title: thread.subject || "(no subject)",
    subtitle: `${thread.sender_name || thread.sender_email || "Unknown"} · ${thread.classification}`,
    icon: "inbox",
    action: "open-thread",
    id: thread.id,
  }));
  const projectResults = data.projects.map((project) => ({
    kind: "Project",
    title: project.name,
    subtitle: project.status.replaceAll("_", " "),
    icon: "clipboard-check",
    action: "open-project",
    id: project.id,
  }));
  const taskResults = data.tasks.map((task) => ({
    kind: "Task",
    title: task.title,
    subtitle: task.status.replaceAll("_", " "),
    icon: "clipboard-check",
    action: "open-task",
    id: task.id,
  }));
  const noteResults = data.notes.filter((note) => !note.is_archived).map((note) => ({
    kind: "Note",
    title: note.title,
    subtitle: note.category,
    icon: "pencil",
    action: "open-note",
    id: note.id,
  }));
  const actions = [
    { kind: "Action", title: "Add a new lead", subtitle: "Manual prospect entry", icon: "plus", action: "new-lead" },
    { kind: "Action", title: "Compose an outreach draft", subtitle: "Prepare, then approve", icon: "send", action: "new-draft" },
    { kind: "Action", title: "Queue a manual agent run", subtitle: "No external model call", icon: "bot", action: "queue-agent-run" },
  ];
  const results = [...pageResults, ...leadResults, ...clientResults, ...demoResults, ...threadResults, ...projectResults, ...taskResults, ...noteResults, ...actions]
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
