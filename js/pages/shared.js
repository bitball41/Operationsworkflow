/* Domain helpers shared by page modules. */
import { escapeHtml, relativeTime, statusLabel } from "../core/utils.js";
import { empty, icon } from "../components/ui.js";

export function byId(items = [], id) {
  if (!id) return null;
  return items.find((item) => String(item.id) === String(id)) || null;
}

export function leadName(data, leadId) {
  return byId(data.leads, leadId)?.business_name || "Unlinked lead";
}

export function clientName(data, client) {
  if (!client) return "Unlinked client";
  return leadName(data, client.lead_id);
}

export function demoForLead(data, leadId) {
  return data.demos.find((demo) => String(demo.lead_id) === String(leadId)) || null;
}

export function entityName(data, item) {
  if (item?.lead_id) return leadName(data, item.lead_id);
  if (item?.client_id) return clientName(data, byId(data.clients, item.client_id));
  return "Operations";
}

export function locationOf(item) {
  return [item?.city, item?.region].filter(Boolean).join(", ");
}

export function searchInput(placeholder, value = "") {
  return `<label class="search">${icon("search")}<input data-route-search placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" aria-label="${escapeHtml(placeholder)}"></label>`;
}

export function filterSelect(key, options, selected, allLabel = "All") {
  return `<select class="select-sm" data-action="route-select" data-key="${key}" aria-label="${escapeHtml(allLabel)}">
    <option value="all">${escapeHtml(allLabel)}</option>
    ${options.map((option) => `<option value="${escapeHtml(option.value)}"${String(option.value) === String(selected) ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
  </select>`;
}

export function viewTabs(key, views, current) {
  return `<div class="tabs">${views.map(([value, label]) => `<button class="tab${value === current ? " is-active" : ""}" data-action="route-filter" data-key="${key}" data-value="${value}">${escapeHtml(label)}</button>`).join("")}</div>`;
}

export function timeline(items, limit = 8) {
  if (!items.length) return empty({ title: "Nothing recorded yet", message: "Business events appear here as work happens." });
  return `<div class="event-log">${items.slice(0, limit).map((item) => {
    const target = item.lead_id ? ["lead-open", item.lead_id] : item.client_id ? ["client-open", item.client_id] : item.project_id ? ["project-open", item.project_id] : null;
    const tag = target ? "button" : "div";
    const action = target ? ` type="button" data-action="${target[0]}" data-id="${escapeHtml(String(target[1]))}"` : "";
    return `
    <${tag} class="event-log__item"${action}>
      ${icon(eventIcon(item))}
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail || statusLabel(item.type))}</p></div>
      <time title="${escapeHtml(new Date(item.created_at).toLocaleString())}">${relativeTime(item.created_at)}</time>
    </${tag}>`;
  }).join("")}</div>`;
}

function eventIcon(item) {
  if (item.type?.includes("payment")) return "wallet";
  if (item.type?.includes("email") || item.type?.includes("reply")) return "mail";
  if (item.type?.includes("demo")) return "monitor";
  if (item.type?.includes("automation")) return "play";
  if (item.type?.includes("lead")) return "building";
  if (item.type?.includes("pipeline")) return "columns";
  return "activity";
}

