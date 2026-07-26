/**
 * Home answers three questions and nothing else:
 * what needs attention, what is automation doing, how is today going.
 */
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, greeting, relativeTime } from "../core/utils.js";
import { bar, btn, dot, empty, icon, row, rows, section, stats } from "../components/ui.js";
import { automationSettings } from "../services/automation/engine.js";
import { canSend } from "../services/email/outreach.js";
import { attentionItems, todayStats } from "../services/operations.js";
import { timeline } from "./shared.js";

function automationStrip() {
  const { automation } = getState();
  const settings = automationSettings();
  const running = automation.status === "running" || automation.status === "stopping";
  const today = todayStats();

  const state = running
    ? `${dot("green")} Running`
    : automation.status === "error"
      ? `${dot("red")} Stopped on error`
      : `${dot()} Idle`;

  const detail = running
    ? `${automation.currentLeadName || "Selecting lead"} · ${automation.currentStep || "starting"}`
    : automation.stopReason || (canSend() ? "Ready to start" : "Ready to start · emails stop at “ready” until Gmail is connected");

  return `
    <div class="control-strip">
      <div class="control-strip__main">
        <strong>${state}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <div class="control-strip__actions">
        <span class="pill">${today.sent} / ${settings.batchTarget} sent today</span>
        ${running
          ? btn("Stop", { action: "automation-stop", iconName: "pause" })
          : btn("Start", { action: "automation-start", iconName: "play", variant: "primary" })}
        ${btn("Open", { action: "navigate", attrs: 'data-route-target="automation"' })}
      </div>
      ${running ? bar(Math.round((automation.processed / Math.max(1, settings.batchTarget)) * 100), "accent") : ""}
    </div>
  `;
}

function attentionSection() {
  const items = attentionItems();
  if (!items.length) {
    return section("Needs attention", {
      body: empty({ title: "Nothing needs you right now", message: "Replies, overdue follow-ups and failures show up here." }),
    });
  }

  return section("Needs attention", {
    count: items.length,
    body: rows(items.slice(0, 6).map((item) => row({
      main: item.title,
      sub: item.detail,
      iconName: item.iconName,
      tone: item.tone,
      action: "navigate",
      attrs: `data-route-target="${item.route}"${item.params ? ` data-route-params="${escapeHtml(JSON.stringify(item.params))}"` : ""}`,
      side: `${item.at ? `<span class="faint">${relativeTime(item.at)}</span>` : ""}${icon("chevron")}`,
    }))),
  });
}

export function renderHome() {
  const { data } = getState();
  const today = todayStats();
  const name = data.profile?.full_name || "Connor";

  return `
    <div class="stack">
      <div class="greeting">
        <h2>${escapeHtml(greeting())}, ${escapeHtml(name.split(" ")[0])}</h2>
        <p>${escapeHtml(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</p>
      </div>

      ${automationStrip()}

      ${attentionSection()}

      ${section("Today", {
        body: stats([
          ["Sent", `${today.sent}<span class="faint"> / ${today.target}</span>`],
          ["Replies", today.replies, today.interested ? `${today.interested} interested` : ""],
          ["Demos built", today.demos],
          ["New leads", today.newLeads],
          ["Revenue", formatCurrency(today.revenue)],
        ]),
      })}

      ${section("Recent work", {
        actions: `${btn("Activity", { action: "navigate", attrs: 'data-route-target="activity"', size: "sm" })}`,
        body: timeline(data.activity, 6),
      })}

      ${data.leads.length ? "" : section("Get started", {
        body: rows([
          row({ main: "Find leads", sub: "Search a niche and location with OpenScout", iconName: "radar", action: "navigate", attrs: 'data-route-target="discovery"', side: icon("chevron") }),
          row({ main: "Load the starter workspace", sub: "Realistic sample records to look around", iconName: "layers", action: "load-sample", side: icon("chevron") }),
        ]),
      })}
    </div>
  `;
}
