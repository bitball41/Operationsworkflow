import { icon } from "../core/icons.js";
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatNumber,
  relativeTime,
  statusLabel,
} from "../core/utils.js";
import { badge, button, emptyState } from "../components/ui.js";

export function byId(items = [], id) {
  return items.find((item) => String(item.id) === String(id));
}

export function leadName(data, id) {
  return byId(data.leads, id)?.business_name || "Unlinked lead";
}

export function clientName(data, client) {
  if (!client) return "Unlinked client";
  return leadName(data, client.lead_id);
}

export function demoForLead(data, leadId) {
  return data.demos.find((demo) => String(demo.lead_id) === String(leadId));
}

export function clientForLead(data, leadId) {
  return data.clients.find((client) => String(client.lead_id) === String(leadId));
}

export function entityName(data, item) {
  if (item.lead_id) return leadName(data, item.lead_id);
  if (item.client_id) return clientName(data, byId(data.clients, item.client_id));
  return "Operations";
}

export function daysBetween(value, now = Date.now()) {
  if (!value) return 0;
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 86400000));
}

export function isToday(value) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

export function inCurrentMonth(value) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

export function sectionCard(title, subtitle, body, action = "") {
  return `
    <section class="card">
      <header class="card__head">
        <div><h3>${escapeHtml(title)}</h3>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>
        ${action}
      </header>
      <div class="card__body">${body}</div>
    </section>
  `;
}

export function compactMetric(label, value, detail = "", tone = "") {
  return `
    <div class="compact-metric ${tone ? `compact-metric--${tone}` : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </div>
  `;
}

export function tableEmpty(columns, title, message) {
  return `<tr><td colspan="${columns}">${emptyState({ title, message, iconName: "inbox" })}</td></tr>`;
}

export function miniLineChart(values, { color = "#8f75ff", labels = [] } = {}) {
  const points = values.length ? values.map(Number) : [0];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(1, max - min);
  const width = 640;
  const height = 190;
  const insetX = 18;
  const insetY = 18;
  const usableW = width - insetX * 2;
  const usableH = height - insetY * 2;
  const coords = points.map((value, index) => {
    const x = insetX + (points.length === 1 ? usableW / 2 : (index / (points.length - 1)) * usableW);
    const y = height - insetY - ((value - min) / range) * usableH;
    return [x, y];
  });
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${insetX},${height - insetY} ${line} ${width - insetX},${height - insetY}`;
  return `
    <div class="line-chart">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Performance trend">
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity=".32"></stop>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <g class="line-chart__grid">
          <line x1="${insetX}" y1="46" x2="${width - insetX}" y2="46"></line>
          <line x1="${insetX}" y1="94" x2="${width - insetX}" y2="94"></line>
          <line x1="${insetX}" y1="142" x2="${width - insetX}" y2="142"></line>
        </g>
        <polygon points="${area}" fill="url(#chart-fill)"></polygon>
        <polyline points="${line}" fill="none" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke"></polyline>
        ${coords.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#0d1119" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"></circle>`).join("")}
      </svg>
      ${labels.length ? `<div class="line-chart__labels">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>` : ""}
    </div>
  `;
}

export function horizontalBars(rows, { valueFormatter = formatNumber } = {}) {
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);
  return `<div class="horizontal-bars">${rows.map((row) => `
    <div class="horizontal-bar">
      <span>${escapeHtml(row.label)}</span>
      <div><i style="width:${Math.max(2, (Number(row.value || 0) / max) * 100)}%;--bar-color:${row.color || "var(--accent)"}"></i></div>
      <b>${valueFormatter(row.value)}</b>
    </div>
  `).join("")}</div>`;
}

export function activityTimeline(items, limit = 8) {
  const rows = items.slice(0, limit);
  if (!rows.length) return emptyState({ title: "No activity yet", message: "Business events will appear here.", iconName: "activity" });
  return `<div class="timeline">${rows.map((item) => `
    <div class="timeline-item">
      <span class="timeline-icon">${icon(item.actor_type === "orchestrator" ? "bot" : item.type === "payment" ? "wallet-cards" : "activity")}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail || statusLabel(item.type))}</p></div>
      <time>${relativeTime(item.created_at)}</time>
    </div>
  `).join("")}</div>`;
}

export function relationLink(route, id, label) {
  return `<button class="text-link" type="button" data-action="navigate" data-route-target="${route}" data-route-id="${escapeHtml(id || "")}">${escapeHtml(label)}</button>`;
}

export function moneyCell(amount, detail = "") {
  return `<div class="cell-primary"><strong>${formatCurrency(amount)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</div>`;
}

export function primaryCell(title, subtitle = "") {
  return `<div class="cell-primary"><strong>${escapeHtml(title)}</strong>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}</div>`;
}

export function actionMenu(action, id, label = "Open") {
  return button(label, { action, variant: "ghost", attrs: `data-id="${escapeHtml(id)}"` });
}

export function dueLabel(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (date.getTime() < Date.now() && !isToday(value)) return `Overdue · ${formatDate(value)}`;
  if (isToday(value)) return `Today · ${formatDate(value, { hour: "numeric", minute: "2-digit" })}`;
  return formatDate(value);
}

export function statusSummary(items, field = "status") {
  return items.reduce((output, item) => {
    output[item[field]] = (output[item[field]] || 0) + 1;
    return output;
  }, {});
}

export function revenueSummary(data) {
  const paid = data.payments.filter((payment) => ["paid", "available"].includes(payment.status));
  const gross = paid.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const fees = paid.reduce((total, payment) => total + Number(payment.fee_amount || 0), 0);
  const costs = data.expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
    + data.aiUsage.reduce((total, usage) => total + Number(usage.cost || 0), 0);
  return { paid, gross, fees, costs, profit: gross - fees - costs };
}

export function renderPillList(values = [], fallback = "None") {
  if (!values.length) return `<span class="muted-copy">${escapeHtml(fallback)}</span>`;
  return `<div class="pill-list">${values.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>`;
}

export function detailList(rows) {
  return `<dl class="detail-list">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value ?? "—"}</dd></div>`).join("")}</dl>`;
}

export function formatDateTime(value) {
  return value ? formatDate(value, { year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
}

export function checkboxCell(id, selected = false, action = "toggle-row-selection") {
  return `<input class="row-checkbox" type="checkbox" aria-label="Select row" data-action="${action}" data-id="${escapeHtml(id)}" ${selected ? "checked" : ""}>`;
}

export function linkOut(url, label = "Open") {
  if (!url) return `<span class="muted-copy">—</span>`;
  return `<a class="text-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)} ${icon("external-link")}</a>`;
}

export { badge, button, emptyState, formatCurrency, formatDate, formatNumber, icon, statusLabel };
