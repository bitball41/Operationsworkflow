/** Tasks, Calendar, Notes and Activity. */
import { getState } from "../core/state.js";
import { dueLabel, escapeHtml, formatNumber, groupBy, isToday, relativeTime, statusLabel } from "../core/utils.js";
import { btn, empty, icon, pill, row, rows, section } from "../components/ui.js";
import { entityName, filterSelect, leadName, searchInput, timeline, viewTabs } from "./shared.js";

/* ---------- tasks ---------- */

function taskInView(task, view) {
  if (view === "done") return task.status === "completed";
  if (["completed", "cancelled"].includes(task.status)) return false;
  if (view === "today") return isToday(task.due_at);
  if (view === "overdue") return task.due_at && new Date(task.due_at) < new Date() && !isToday(task.due_at);
  return true;
}

export function renderTasks() {
  const { data, routeParams } = getState();
  const view = routeParams.view || "open";
  const query = (routeParams.q || "").toLowerCase();
  const counts = Object.fromEntries(["open", "today", "overdue", "done"].map((key) => [key, data.tasks.filter((task) => taskInView(task, key)).length]));
  const tasks = data.tasks
    .filter((task) => taskInView(task, view))
    .filter((task) => !query || `${task.title} ${task.description}`.toLowerCase().includes(query))
    .sort((a, b) => new Date(a.due_at || "2999") - new Date(b.due_at || "2999"));

  return `
    <div class="stack">
      <div class="toolbar">
        ${viewTabs("view", [
          ["open", `Open · ${counts.open}`],
          ["today", `Today · ${counts.today}`],
          ["overdue", `Overdue · ${counts.overdue}`],
          ["done", `Done · ${counts.done}`],
        ], view)}
        ${searchInput("Search tasks", routeParams.q || "")}
        <span class="toolbar__spacer"></span>
        ${btn("New task", { action: "task-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${tasks.length ? rows(tasks.map((task) => `<div class="row">
        <button class="icon-btn" type="button" data-action="task-toggle" data-id="${task.id}" aria-label="${task.status === "completed" ? "Reopen task" : "Complete task"}">${icon(task.status === "completed" ? "check-circle" : "circle")}</button>
        <span class="row__main"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(entityName(data, task))} · ${escapeHtml(dueLabel(task.due_at))}</span></span>
        <span class="row__side">${task.priority === "urgent" || task.priority === "high" ? pill(task.priority) : ""}${btn("Edit", { action: "task-open", size: "sm", attrs: `data-id="${task.id}"` })}</span>
      </div>`)) : empty({ title: `No ${view} tasks`, message: "This view is clear." })}
    </div>
  `;
}

/* ---------- calendar ---------- */

function calendarModel(data, monthValue) {
  const selected = /^\d{4}-\d{2}$/.test(monthValue || "") ? new Date(`${monthValue}-01T12:00:00`) : new Date();
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  const entries = [
    ...data.calendarEvents.map((event) => ({ ...event, kind: event.event_type })),
    ...data.tasks.filter((task) => task.due_at && task.status !== "completed").map((task) => ({
      id: `task-${task.id}`, title: task.title, starts_at: task.due_at, kind: "task", lead_id: task.lead_id,
    })),
    ...data.followUps.filter((item) => !["sent", "replied", "completed", "dead", "cancelled"].includes(item.status)).map((item) => ({
      id: `follow-${item.id}`, title: `Follow up · ${leadName(data, item.lead_id)}`, starts_at: item.due_at, kind: "follow_up", lead_id: item.lead_id,
    })),
  ].filter((entry) => entry.starts_at);

  const grouped = groupBy(entries, (entry) => new Date(entry.starts_at).toISOString().slice(0, 10));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, events: grouped[date.toISOString().slice(0, 10)] || [] };
  });
  return { selected, days, entries };
}

export function renderCalendar() {
  const { data, routeParams } = getState();
  const model = calendarModel(data, routeParams.month);
  const upcoming = model.entries
    .filter((entry) => new Date(entry.starts_at) >= new Date())
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    .slice(0, 6);

  return `
    <div class="stack">
      <div class="toolbar">
        <div class="btn-row">
          ${btn("", { action: "calendar-shift", iconName: "chevron", size: "sm", attrs: 'data-direction="-1" aria-label="Previous month" style="transform:rotate(180deg)"' })}
          ${btn("Today", { action: "calendar-today", size: "sm" })}
          ${btn("", { action: "calendar-shift", iconName: "chevron", size: "sm", attrs: 'data-direction="1" aria-label="Next month"' })}
        </div>
        <strong>${escapeHtml(model.selected.toLocaleDateString("en-US", { month: "long", year: "numeric" }))}</strong>
        <span class="toolbar__spacer"></span>
        ${btn("New event", { action: "calendar-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      <div class="cal">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span class="cal__weekday">${day}</span>`).join("")}
        ${model.days.map(({ date, events }) => `
          <button class="cal__day${date.getMonth() !== model.selected.getMonth() ? " is-outside" : ""}${isToday(date) ? " is-today" : ""}" type="button" data-action="calendar-day" data-date="${date.toISOString().slice(0, 10)}">
            <span>${date.getDate()}</span>
            <div>
              ${events.slice(0, 3).map((event) => `<i class="cal__event cal__event--${escapeHtml(event.kind)}">${escapeHtml(event.title)}</i>`).join("")}
              ${events.length > 3 ? `<i class="cal__event">+${events.length - 3} more</i>` : ""}
            </div>
          </button>
        `).join("")}
      </div>

      ${section("Next up", {
        body: upcoming.length ? rows(upcoming.map((entry) => row({
          main: entry.title,
          sub: `${statusLabel(entry.kind)} · ${relativeTime(entry.starts_at)}`,
          iconName: entry.kind === "follow_up" ? "timer" : entry.kind === "task" ? "check-square" : "calendar",
        }))) : empty({ title: "Nothing scheduled", message: "Follow-ups and tasks show up here automatically." }),
      })}
    </div>
  `;
}

/* ---------- notes ---------- */

export function renderNotes() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const category = routeParams.category || "all";
  const categories = [...new Set(data.notes.map((note) => note.category).filter(Boolean))].sort();
  const notes = data.notes
    .filter((note) => !note.is_archived)
    .filter((note) => (category === "all" || note.category === category))
    .filter((note) => !query || `${note.title} ${note.content} ${(note.tags || []).join(" ")}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.updated_at) - new Date(a.updated_at));

  return `
    <div class="stack">
      <div class="toolbar">
        ${searchInput("Search notes", routeParams.q || "")}
        ${filterSelect("category", categories.map((value) => ({ value, label: statusLabel(value) })), category, "All categories")}
        <span class="toolbar__spacer"></span>
        ${btn("New note", { action: "note-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${notes.length ? `<div class="note-grid">
        ${notes.map((note) => `
          <button class="note" type="button" data-action="note-open" data-id="${note.id}">
            <div class="template__meta">
              <h4>${escapeHtml(note.title)}</h4>
              ${note.is_pinned ? icon("star") : ""}
            </div>
            <p>${escapeHtml(note.content || "")}</p>
            <div class="tag-list">${(note.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
          </button>
        `).join("")}
      </div>` : empty({ title: "No notes", message: "Keep scripts, research and procedures here." })}
    </div>
  `;
}

/* ---------- activity ---------- */

export function renderActivity() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const actor = routeParams.actor || "all";
  const items = data.activity
    .filter((item) => (actor === "all" || item.actor_type === actor))
    .filter((item) => !query || `${item.title} ${item.detail}`.toLowerCase().includes(query));

  return `
    <div class="stack">
      <div class="toolbar">
        ${searchInput("Search activity", routeParams.q || "")}
        ${filterSelect("actor", [{ value: "user", label: "Me" }, { value: "system", label: "System" }, { value: "orchestrator", label: "Automation" }], actor, "Everyone")}
        <span class="toolbar__spacer"></span>
        <span class="faint">${formatNumber(items.length)} events</span>
      </div>

      ${items.length ? timeline(items, 60) : empty({ title: "No activity", message: "Work shows up here as it happens." })}
    </div>
  `;
}
