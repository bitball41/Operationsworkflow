import { pageHead } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml } from "../core/utils.js";
import { badge, button, formatDate, icon, renderPillList, statusLabel } from "./shared.js";

export function renderNotes() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const category = routeParams.category || "all";
  const categories = [...new Set(data.notes.map((note) => note.category).filter(Boolean))].sort();
  const rows = data.notes
    .filter((note) => !note.is_archived)
    .filter((note) => (
      (category === "all" || note.category === category)
      && (!query || `${note.title} ${note.content} ${(note.tags || []).join(" ")}`.toLowerCase().includes(query))
    ))
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.updated_at) - new Date(a.updated_at));
  return `
    ${pageHead("Notes", "Sales scripts, research, procedures, strategy, prompt instructions, and business documentation.", button("New note", { action: "new-note", iconName: "plus", variant: "primary" }))}
    <div class="toolbar">
      <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search titles, content, and tags" value="${escapeHtml(routeParams.q || "")}"></label>
      <select class="compact-select" data-action="route-select" data-key="category"><option value="all">All categories</option>${categories.map((value) => `<option value="${escapeHtml(value)}" ${category === value ? "selected" : ""}>${escapeHtml(statusLabel(value))}</option>`).join("")}</select>
    </div>
    <section class="notes-grid">${rows.map((note) => `
      <article class="card note-card ${note.is_pinned ? "is-pinned" : ""}" data-action="open-note" data-id="${note.id}">
        <header><span class="note-icon">${icon(note.category === "sales" ? "send" : note.category === "research" ? "search" : note.category === "procedure" ? "clipboard-check" : "pencil")}</span><div>${badge("active", statusLabel(note.category || "note"))}${note.is_pinned ? `<span class="pin-chip">${icon("star")} Pinned</span>` : ""}</div></header>
        <h3>${escapeHtml(note.title)}</h3>
        <p>${escapeHtml(note.content || "Empty note")}</p>
        ${renderPillList(note.tags || [], "")}
        <footer><span>Updated ${formatDate(note.updated_at, { year: "numeric" })}</span><div><button class="button button--ghost" data-action="toggle-note-pin" data-id="${note.id}">${note.is_pinned ? "Unpin" : "Pin"}</button><button class="button button--ghost" data-action="open-note" data-id="${note.id}">Edit</button></div></footer>
      </article>
    `).join("") || `<div class="card healthy-state healthy-state--large">${icon("pencil")}<div><strong>No notes found</strong><span>Create a reusable script, lesson, research note, or procedure.</span></div></div>`}</section>
  `;
}
