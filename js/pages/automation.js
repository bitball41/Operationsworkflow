/**
 * Automation: start/stop, what it is doing right now, and what failed.
 * Configuration stays behind one disclosure with working defaults.
 */
import { getState } from "../core/state.js";
import { escapeHtml, formatNumber, relativeTime } from "../core/utils.js";
import {
  advanced,
  bar,
  btn,
  checkbox,
  dot,
  empty,
  field,
  icon,
  input,
  notice,
  row,
  rows,
  section,
  stats,
} from "../components/ui.js";
import { AUTOMATION_STEPS, automationSettings } from "../services/automation/engine.js";
import { canSend } from "../services/email/outreach.js";
import { hostingConnected } from "../services/sites/publish.js";
import { getNextLead, todayStats } from "../services/operations.js";

function stepTrack(automation) {
  const currentIndex = automation.stepIndex;
  return `<div class="step-track">${AUTOMATION_STEPS.map((step, index) => {
    const done = currentIndex > index;
    const current = currentIndex === index;
    const blocked = step.id === "send" && !canSend();
    const className = current ? "is-current" : done ? "is-done" : blocked ? "is-blocked" : "";
    return `<span class="step-chip ${className}">${icon(done ? "check" : blocked ? "alert" : current ? "circle" : "circle")}${escapeHtml(step.label)}</span>`;
  }).join("")}</div>`;
}

function eventLog(events) {
  if (!events.length) {
    return empty({ title: "No automation events yet", message: "Start a batch and each step shows up here." });
  }
  return `<div class="event-log">${events.slice(0, 30).map((event) => `
    <div class="event-log__item event-log__item--${event.level === "error" ? "error" : event.level === "warn" ? "warn" : event.level === "done" ? "done" : "info"}">
      ${icon(event.level === "error" ? "alert" : event.level === "warn" ? "info" : event.level === "done" ? "check-circle" : "circle")}
      <div><strong>${escapeHtml(event.title)}</strong>${event.detail ? `<p>${escapeHtml(event.detail)}</p>` : ""}</div>
      <time>${relativeTime(event.at)}</time>
    </div>
  `).join("")}</div>`;
}

export function renderAutomation() {
  const { automation } = getState();
  const settings = automationSettings();
  const today = todayStats();
  const running = automation.status === "running" || automation.status === "stopping";
  const next = running ? null : getNextLead({ niche: settings.niche, location: settings.location });
  const progress = Math.round((automation.processed / Math.max(1, settings.batchTarget)) * 100);

  const statusLine = running
    ? `${dot("green")} ${automation.status === "stopping" ? "Finishing current lead" : "Running"}`
    : automation.status === "error"
      ? `${dot("red")} Stopped on error`
      : `${dot()} Idle`;

  return `
    <div class="stack">
      <section class="auto-hero">
        <div class="auto-hero__top">
          <div class="auto-state">
            <span class="auto-state__label">${statusLine}</span>
            <h2>${escapeHtml(running ? automation.currentLeadName || "Selecting next lead" : next ? `Next: ${next.business_name}` : "Nothing queued")}</h2>
            <p>${escapeHtml(running
              ? automation.currentStep || "Starting"
              : automation.stopReason || (next ? `${next.category} · ${next.city} · score ${next.lead_score}` : "No qualified uncontacted leads. Run Lead Discovery to add more."))}</p>
          </div>
          <div class="btn-row">
            ${running
              ? btn("Stop", { action: "automation-stop", iconName: "pause", variant: "" })
              : btn("Start", { action: "automation-start", iconName: "play", variant: "primary", attrs: next ? "" : "disabled" })}
            ${running ? "" : btn("Run one lead", { action: "automation-run-once", iconName: "bolt", attrs: next ? "" : "disabled" })}
          </div>
        </div>

        ${bar(progress, "accent")}

        ${stats([
          ["Processed", `${automation.processed}<span class="faint"> / ${settings.batchTarget}</span>`, running ? "this run" : "last run"],
          ["Sent today", formatNumber(today.sent), `target ${settings.batchTarget}`],
          ["Prepared", formatNumber(automation.processed - automation.sent), "waiting on Outlook"],
          ["Failed", formatNumber(automation.failures.length), automation.failures.length ? "needs a look" : "none"],
        ])}

        ${stepTrack(automation)}
      </section>

      ${canSend() ? "" : notice(
        "Emails stop at “ready”",
        "Outlook is not connected, so automation completes every step except the send and leaves each email ready. Nothing is marked as sent.",
        { tone: "warn", iconName: "mail", actions: btn("Integrations", { action: "navigate", attrs: 'data-route-target="integrations"', size: "sm" }) },
      )}

      ${hostingConnected() ? "" : notice(
        "Demos are built but not hosted",
        "Preview links are reserved on your preview domain and the real site opens from the stored bundle. Connect Cloudflare to serve them publicly.",
        { iconName: "globe" },
      )}

      ${automation.failures.length ? section("Failed items", {
        count: automation.failures.length,
        actions: btn("Clear", { action: "automation-clear-failures", size: "sm" }),
        body: rows(automation.failures.map((failure) => row({
          main: failure.leadName,
          sub: failure.reason,
          iconName: "alert",
          tone: "red",
          side: `<span class="faint">${relativeTime(failure.at)}</span>`,
        }))),
      }) : ""}

      ${section("Recent events", { count: automation.events.length, body: eventLog(automation.events) })}

      ${advanced("Settings", `
        <form class="stack--tight" data-form="automation-settings">
          <div class="field-grid">
            ${field("Emails per day", input("batchTarget", settings.batchTarget, { type: "number", attrs: 'min="1" max="500"' }))}
            ${field("Offer price", input("price", settings.price, { type: "number", attrs: 'min="0" step="50"' }))}
            ${field("Follow-up after", input("followUpDays", settings.followUpDays, { type: "number", attrs: 'min="1" max="60"' }), { hint: "days" })}
            ${field("Step pacing", input("stepDelayMs", settings.stepDelayMs, { type: "number", attrs: 'min="0" max="4000" step="50"' }), { hint: "ms" })}
          </div>
          <div class="field-grid">
            ${field("Only this niche", input("niche", settings.niche, { placeholder: "Any niche" }))}
            ${field("Only this location", input("location", settings.location, { placeholder: "Any location" }))}
            ${field("Stop after failures", input("maxConsecutiveFailures", settings.maxConsecutiveFailures, { type: "number", attrs: 'min="1" max="20"' }))}
          </div>
          ${checkbox("autoFollowUp", "Create a follow-up for every sent email", settings.autoFollowUp)}
          ${checkbox("research", "Research each business before building the site", settings.research)}
          <div class="btn-row">
            ${btn("Save settings", { variant: "primary", type: "submit" })}
            ${btn("Reset to defaults", { action: "automation-reset-settings" })}
          </div>
        </form>
      `)}
    </div>
  `;
}
