import { STATUS_LABELS } from "../config.js";

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatCurrency(value = 0, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);
}

export function formatNumber(value = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...options }).format(date);
}

export function formatDateTime(value) {
  return value ? formatDate(value, { hour: "numeric", minute: "2-digit" }) : "—";
}

export function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function relativeTime(value) {
  if (!value) return "just now";
  const delta = new Date(value).getTime() - Date.now();
  const absolute = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });
  if (absolute < 60_000) return "just now";
  if (absolute < 3_600_000) return formatter.format(Math.round(delta / 60_000), "minute");
  if (absolute < 86_400_000) return formatter.format(Math.round(delta / 3_600_000), "hour");
  if (absolute < 2_592_000_000) return formatter.format(Math.round(delta / 86_400_000), "day");
  return formatDate(value, { year: "numeric" });
}

export function statusLabel(status) {
  if (status === null || status === undefined || status === "") return "Unknown";
  return STATUS_LABELS[status] || String(status).replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

/* Colour is semantic only: green = good, amber = attention, red = problem. */
export function statusTone(status) {
  if (["won", "completed", "connected", "active", "paid", "available", "live", "healthy", "sent", "approved", "interested", "saved", "converted", "complete"].includes(status)) return "green";
  if (["overdue", "due", "warning", "past_due", "pending", "price_objection", "needs_changes", "paused", "snoozed", "scheduled", "maybe", "follow_up_later"].includes(status)) return "amber";
  if (["failed", "lost", "error", "cancelled", "dead", "not_interested", "rejected", "wrong_person"].includes(status)) return "red";
  if (["running", "queued", "replied", "viewed", "in_progress"].includes(status)) return "accent";
  return "neutral";
}

export function sum(items, selector) {
  return items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
}

export function groupBy(items, selector) {
  return items.reduce((groups, item) => {
    const key = selector(item);
    groups[key] ||= [];
    groups[key].push(item);
    return groups;
  }, {});
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isoOffset({ days = 0, hours = 0, minutes = 0 } = {}) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(date.getHours() + hours);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function isToday(value) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

export function isSameMonth(value, reference = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();
}

export function daysSince(value, now = Date.now()) {
  if (!value) return 0;
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 86_400_000));
}

export function dueLabel(value) {
  if (!value) return "No date";
  if (isToday(value)) return `Today ${formatTime(value)}`;
  if (new Date(value).getTime() < Date.now()) return `Overdue · ${formatDate(value)}`;
  return formatDate(value);
}

export function debounce(fn, wait = 220) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function initials(name = "") {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export function titleCase(value = "") {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${Number(count) === 1 ? singular : plural}`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/* Renders template strings used by outreach copy and site bundles. */
export function fillTemplate(template, values) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => (values[key] === undefined || values[key] === null ? "" : String(values[key])));
}

export function safeJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
