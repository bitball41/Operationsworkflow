/**
 * Playbooks — a frontend home for scripts, SOPs, and repeatable workflows.
 * Stored notes remain the live records. Categories without notes are labeled
 * as shells so they are not mistaken for a backend catalogue.
 */
import { getState } from "../core/state.js";
import { escapeHtml, relativeTime, statusLabel } from "../core/utils.js";
import { btn, empty, icon, pageHeader, pill, row, rows, section } from "../components/ui.js";
import { searchInput } from "./shared.js";

const PLAYBOOK_TYPES = Object.freeze([
  { id: "sales", label: "Sales scripts", detail: "Discovery, objection handling, and close language", icon: "phone" },
  { id: "procedure", label: "Onboarding steps", detail: "Activation, access, and go-live checklists", icon: "check-square" },
  { id: "outreach", label: "Call scripts", detail: "Openers and follow-ups used on the floor", icon: "message" },
  { id: "research", label: "Agent templates", detail: "Reusable receptionist and booking patterns", icon: "smartphone" },
  { id: "lessons", label: "SOPs", detail: "What worked and the operating rules to keep", icon: "book" },
  { id: "workflow", label: "Repeatable workflows", detail: "Delivery sequences that are not stored as notes yet", icon: "layers" },
]);

export function renderPlaybooks() {
  const { data, routeParams } = getState();
  const query = String(routeParams.q || "").toLowerCase();
  const notes = data.notes
    .filter((note) => !note.is_archived)
    .filter((note) => !query || `${note.title} ${note.content} ${note.category} ${(note.tags || []).join(" ")}`.toLowerCase().includes(query))
    .sort((left, right) => Number(right.is_pinned) - Number(left.is_pinned) || new Date(right.updated_at) - new Date(left.updated_at));

  return `
    <div class="stack">
      ${pageHeader({
        title: "Playbooks",
        subtitle: "Scripts, onboarding steps, and SOPs used to sell and deliver the receptionist package.",
        actions: btn("New note", { action: "note-new", iconName: "plus", variant: "primary" }),
      })}

      <div class="playbook-grid">
        ${PLAYBOOK_TYPES.map((type) => {
          const matches = notes.filter((note) => note.category === type.id || (note.tags || []).includes(type.id));
          return `
            <article class="playbook-card">
              <span class="row__icon">${icon(type.icon)}</span>
              <strong>${escapeHtml(type.label)}</strong>
              <p>${escapeHtml(type.detail)}</p>
              ${matches.length
                ? pill("saved", `${matches.length} saved`)
                : `<span class="faint">Frontend shell · add a note to fill this</span>`}
            </article>
          `;
        }).join("")}
      </div>

      <div class="toolbar">
        ${searchInput("Search playbooks and notes", routeParams.q || "")}
        <span class="toolbar__spacer"></span>
        ${btn("All notes", { action: "navigate", attrs: 'data-route-target="notes"', size: "sm" })}
      </div>

      ${section("Saved material", {
        count: notes.length,
        body: notes.length ? rows(notes.map((note) => row({
          main: note.title,
          sub: `${statusLabel(note.category || "note")} · updated ${relativeTime(note.updated_at)}`,
          iconName: "note",
          action: "note-open",
          id: note.id,
          side: `${(note.tags || []).slice(0, 2).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}${icon("chevron")}`,
        }))) : empty({
          title: "No playbooks saved yet",
          message: "Create a note for a script, SOP, or agent template. This page does not invent a separate catalogue.",
          action: "note-new",
          actionLabel: "New note",
        }),
      })}
    </div>
  `;
}
