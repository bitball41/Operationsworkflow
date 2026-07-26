import { icon, hydrateIcons } from "../core/icons.js";
import { escapeHtml, statusLabel, statusTone } from "../core/utils.js";

/* ---------- primitives ---------- */

export function btn(label, { action = "", iconName = "", variant = "", attrs = "", size = "", type = "button" } = {}) {
  const classes = ["btn", variant ? `btn--${variant}` : "", size ? `btn--${size}` : ""].filter(Boolean).join(" ");
  return `<button class="${classes}" type="${type}"${action ? ` data-action="${action}"` : ""} ${attrs}>${iconName ? icon(iconName) : ""}${label ? `<span>${escapeHtml(label)}</span>` : ""}</button>`;
}

export function iconBtn(iconName, { action = "", label, attrs = "" } = {}) {
  return `<button class="icon-btn" type="button" aria-label="${escapeHtml(label || action)}"${action ? ` data-action="${action}"` : ""} ${attrs}>${icon(iconName)}</button>`;
}

export function externalLink(url, label = "Open") {
  if (!url) return `<span class="faint">—</span>`;
  return `<a class="link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}${icon("external")}</a>`;
}

export function pill(status, label = statusLabel(status)) {
  const tone = statusTone(status);
  return `<span class="pill${tone === "neutral" ? "" : ` pill--${tone}`}">${escapeHtml(label)}</span>`;
}

export function dot(tone = "") {
  return `<span class="dot${tone ? ` dot--${tone}` : ""}"></span>`;
}

export function stat(label, value, hint = "") {
  return `<div class="stat"><b>${value}</b><span>${escapeHtml(label)}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</div>`;
}

export function stats(items) {
  return `<div class="stats">${items.map(([label, value, hint]) => stat(label, value, hint)).join("")}</div>`;
}

export function bar(percent, variant = "") {
  const width = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="bar${variant ? ` bar--${variant}` : ""}"><i style="width:${width}%"></i></div>`;
}

export function score(value = 0) {
  const number = Math.max(0, Math.min(100, Number(value) || 0));
  return `<span class="score"><i style="--score:${number}%"></i>${number}</span>`;
}

export function section(title, { subtitle = "", actions = "", body = "", count = "" } = {}) {
  return `
    <section class="section">
      ${title || actions || subtitle ? `<div class="section__head">
        <div class="section__title"><h3>${escapeHtml(title)}</h3>${count !== "" ? `<span>${escapeHtml(String(count))}</span>` : ""}</div>
        ${actions ? `<div class="btn-row">${actions}</div>` : subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>` : ""}
      ${body}
    </section>
  `;
}

export function advanced(summaryLabel, body, open = false) {
  return `<details class="advanced"${open ? " open" : ""}><summary>${icon("chevron")}<span>${escapeHtml(summaryLabel)}</span></summary><div class="advanced__body">${body}</div></details>`;
}

export function empty({ title, message = "", action = "", actionLabel = "", actionAttrs = "", center = false }) {
  return `
    <div class="empty${center ? " empty--center" : ""}">
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<p>${escapeHtml(message)}</p>` : ""}
      ${action ? btn(actionLabel, { action, variant: "primary", size: "sm", attrs: actionAttrs }) : ""}
    </div>
  `;
}

export function notice(title, message = "", { tone = "", iconName = "info", actions = "" } = {}) {
  return `
    <div class="notice${tone ? ` notice--${tone}` : ""}">
      ${icon(iconName)}
      <div><strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ""}</div>
      ${actions ? `<div class="notice__actions">${actions}</div>` : ""}
    </div>
  `;
}

export function row({ main, sub = "", side = "", iconName = "", tone = "", action = "", id = "", attrs = "" } = {}) {
  const tag = action ? "button" : "div";
  return `<${tag} class="row"${action ? ` type="button" data-action="${action}"` : ""}${id ? ` data-id="${escapeHtml(id)}"` : ""} ${attrs}>
    ${iconName ? `<span class="row__icon${tone ? ` row__icon--${tone}` : ""}">${icon(iconName)}</span>` : ""}
    <span class="row__main"><strong>${escapeHtml(main)}</strong>${sub ? `<span>${escapeHtml(sub)}</span>` : ""}</span>
    ${side ? `<span class="row__side">${side}</span>` : ""}
  </${tag}>`;
}

export function rows(items) {
  return `<div class="rows">${items.join("")}</div>`;
}

/* Tables render as real tables on desktop and stacked rows on mobile. */
export function table({ columns, rows: bodyRows, emptyState = "" }) {
  if (!bodyRows.length) return emptyState || empty({ title: "Nothing here yet" });
  return `<div class="table-wrap"><table class="stacked">
    <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
    <tbody>${bodyRows.join("")}</tbody>
  </table></div>`;
}

export function td(label, content) {
  return `<td data-label="${escapeHtml(label)}">${content}</td>`;
}

export function bars(items, formatter = (value) => value) {
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  return `<div class="bars">${items.map((item) => `
    <div class="bars__row">
      <span>${escapeHtml(item.label)}</span>
      <span class="bars__track"><i style="width:${Math.max(2, ((Number(item.value) || 0) / max) * 100)}%"></i></span>
      <b>${formatter(item.value)}</b>
    </div>
  `).join("")}</div>`;
}

export function lineChart(values, labels = []) {
  const points = values.length ? values.map(Number) : [0];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(1, max - min);
  const width = 600;
  const height = 150;
  const inset = 10;
  const usableW = width - inset * 2;
  const usableH = height - inset * 2;
  const coords = points.map((value, index) => {
    const x = inset + (points.length === 1 ? usableW / 2 : (index / (points.length - 1)) * usableW);
    const y = height - inset - ((value - min) / range) * usableH;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  return `
    <div>
      <svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Trend">
        <g class="chart__grid">
          <line x1="${inset}" y1="${height / 3}" x2="${width - inset}" y2="${height / 3}"></line>
          <line x1="${inset}" y1="${(height / 3) * 2}" x2="${width - inset}" y2="${(height / 3) * 2}"></line>
        </g>
        <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke" opacity=".75"></polyline>
        ${coords.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="currentColor"></circle>`).join("")}
      </svg>
      ${labels.length ? `<div class="chart__labels">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>` : ""}
    </div>
  `;
}

/* ---------- overlays ---------- */

export function openModal({ title, subtitle = "", body, footer = "", wide = false }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal${wide ? " modal--wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal__head">
          <div><h2 id="modal-title">${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>
          ${iconBtn("x", { action: "close-modal", label: "Close" })}
        </header>
        <div class="modal__body">${body}</div>
        ${footer ? `<footer class="modal__foot">${footer}</footer>` : ""}
      </section>
    </div>
  `;
  /* Close on backdrop clicks only. Clicks inside the modal must keep bubbling
     so the delegated action handler still sees them. */
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal();
  });
  hydrateIcons(root);
  root.querySelector("input:not([type=hidden]), textarea, select")?.focus();
  document.body.style.overflow = "hidden";
}

export function closeModal() {
  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
  document.body.style.overflow = "";
}

export function openDrawer({ title, body, footer = "" }) {
  const root = document.getElementById("drawer-root");
  root.innerHTML = `
    <button class="scrim" type="button" data-action="close-drawer" aria-label="Close"></button>
    <section class="drawer" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="drawer__head"><h3>${escapeHtml(title)}</h3>${iconBtn("x", { action: "close-drawer", label: "Close" })}</header>
      ${body}
      ${footer ? `<div class="btn-row">${footer}</div>` : ""}
    </section>
  `;
  hydrateIcons(root);
  root.querySelector("input, textarea, select")?.focus();
}

export function closeDrawer() {
  const root = document.getElementById("drawer-root");
  if (root) root.innerHTML = "";
}

export function confirmAction({ title, message, confirmLabel = "Confirm", action, attrs = "", danger = true }) {
  openModal({
    title,
    subtitle: message,
    body: "",
    footer: `${btn("Cancel", { action: "close-modal", variant: "quiet" })}${btn(confirmLabel, { action, variant: danger ? "danger" : "primary", attrs })}`,
  });
}

export function toast(title, message = "", tone = "success") {
  const root = document.getElementById("toasts");
  if (!root) return;
  const element = document.createElement("div");
  element.className = `toast${tone === "success" ? "" : ` toast--${tone}`}`;
  element.innerHTML = `${icon(tone === "error" ? "alert" : tone === "info" ? "info" : "check-circle")}<div><strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ""}</div>`;
  root.appendChild(element);
  setTimeout(() => element.remove(), 4600);
}

/* ---------- forms ---------- */

export function field(label, control, { hint = "" } = {}) {
  return `<label class="field"><span>${escapeHtml(label)}${hint ? ` <small>${escapeHtml(hint)}</small>` : ""}</span>${control}</label>`;
}

export function input(name, value = "", { type = "text", placeholder = "", required = false, attrs = "" } = {}) {
  return `<input name="${name}" type="${type}" value="${escapeHtml(value ?? "")}" placeholder="${escapeHtml(placeholder)}"${required ? " required" : ""} ${attrs}>`;
}

export function textarea(name, value = "", { placeholder = "", required = false, attrs = "" } = {}) {
  return `<textarea name="${name}" placeholder="${escapeHtml(placeholder)}"${required ? " required" : ""} ${attrs}>${escapeHtml(value ?? "")}</textarea>`;
}

export function select(name, options, selected, { attrs = "", placeholder = "" } = {}) {
  const list = placeholder ? [{ value: "", label: placeholder }, ...options] : options;
  return `<select name="${name}" ${attrs}>${list.map((option) => `<option value="${escapeHtml(option.value)}"${String(option.value) === String(selected ?? "") ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
}

export function checkbox(name, label, checked = false, attrs = "") {
  return `<label class="check"><input type="checkbox" name="${name}"${checked ? " checked" : ""} ${attrs}><span>${escapeHtml(label)}</span></label>`;
}

export function optionList(values, labeller = statusLabel) {
  return values.map((value) => ({ value, label: labeller(value) }));
}

export function formValues(form) {
  const output = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type="checkbox"]').forEach((element) => {
    output[element.name] = element.checked;
  });
  return output;
}

export function renderInto(element, html) {
  if (!element) return;
  element.innerHTML = html;
  hydrateIcons(element);
}

export { icon };
