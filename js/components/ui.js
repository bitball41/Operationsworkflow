import { icon, hydrateIcons } from "../core/icons.js";
import { escapeHtml, statusLabel, statusTone } from "../core/utils.js";

export function pageHead(title, description, actions = "") {
  return `
    <div class="page-head">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ""}
    </div>
  `;
}

export function button(label, {
  action = "",
  iconName = "",
  variant = "secondary",
  attrs = "",
} = {}) {
  return `<button class="button button--${variant}" type="button" ${action ? `data-action="${action}"` : ""} ${attrs}>${iconName ? icon(iconName) : ""}<span>${escapeHtml(label)}</span></button>`;
}

export function badge(status, label = statusLabel(status)) {
  return `<span class="badge badge--${statusTone(status)}">${escapeHtml(label)}</span>`;
}

export function scoreBar(value = 0, color = "var(--accent)") {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="score"><div class="score__bar"><i style="width:${score}%;--score-color:${color}"></i></div><span>${score}</span></div>`;
}

export function metricCard({ label, value, iconName, foot, tone = "accent", trend = "" }) {
  const colors = {
    accent: ["var(--accent)", "var(--accent-soft)"],
    green: ["var(--green)", "var(--green-soft)"],
    blue: ["var(--blue)", "var(--blue-soft)"],
    yellow: ["var(--yellow)", "var(--yellow-soft)"],
    red: ["var(--red)", "var(--red-soft)"],
  };
  const [color, soft] = colors[tone] || colors.accent;
  return `
    <article class="card metric-card" style="--metric-color:${color};--metric-soft:${soft};--metric-glow:${soft}">
      <div class="metric-card__top"><span>${escapeHtml(label)}</span><span class="metric-icon">${icon(iconName)}</span></div>
      <strong class="metric-value">${value}</strong>
      <div class="metric-foot">${trend ? `<span class="trend">${escapeHtml(trend)}</span>` : ""}<span>${escapeHtml(foot || "")}</span></div>
    </article>
  `;
}

export function emptyState({ iconName = "inbox", title, message, action = "", actionLabel = "" }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${action ? `<div>${button(actionLabel, { action, variant: "primary" })}</div>` : ""}
    </div>
  `;
}

export function openModal({ title, subtitle = "", body, footer = "", wide = false }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal ${wide ? "modal--wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal__head">
          <div><h2 id="modal-title">${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>
          <button class="icon-button" type="button" aria-label="Close" data-action="close-modal">${icon("x")}</button>
        </header>
        <div class="modal__body">${body}</div>
        ${footer ? `<footer class="modal__foot">${footer}</footer>` : ""}
      </section>
    </div>
  `;
  root.querySelector(".modal")?.addEventListener("click", (event) => event.stopPropagation());
  root.querySelector("input, textarea, select, button")?.focus();
  document.body.style.overflow = "hidden";
}

export function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
  document.body.style.overflow = "";
}

export function toast(title, message = "", tone = "success") {
  const root = document.getElementById("toast-region");
  const element = document.createElement("div");
  element.className = "toast";
  const tones = {
    error: ["var(--red-soft)", "var(--red)", "circle-alert"],
    warning: ["var(--yellow-soft)", "var(--yellow)", "circle-alert"],
    success: ["var(--green-soft)", "var(--green)", "check"],
  };
  const [background, color, iconName] = tones[tone] || tones.success;
  element.innerHTML = `
    <span style="background:${background};color:${color}">${icon(iconName)}</span>
    <div><strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ""}</div>
  `;
  root.appendChild(element);
  setTimeout(() => element.remove(), 4200);
}

export function formDataObject(form) {
  const output = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    output[input.name] = input.checked;
  });
  return output;
}

export function renderInto(element, html) {
  element.innerHTML = html;
  hydrateIcons(element);
}

