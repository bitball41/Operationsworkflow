import { STATUS_LABELS } from "../config.js";

export function escapeHtml(value = "") {
  return String(value)
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...options,
  }).format(new Date(value));
}

export function relativeTime(value) {
  if (!value) return "Just now";
  const delta = new Date(value).getTime() - Date.now();
  const absolute = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < 60_000) return "Just now";
  if (absolute < 3_600_000) return formatter.format(Math.round(delta / 60_000), "minute");
  if (absolute < 86_400_000) return formatter.format(Math.round(delta / 3_600_000), "hour");
  return formatter.format(Math.round(delta / 86_400_000), "day");
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || "Unknown").replaceAll("_", " ");
}

export function statusTone(status) {
  if (["won", "completed", "approved", "sent", "production", "connected", "active"].includes(status)) return "green";
  if (["pending", "pending_approval", "qualified", "ready", "ready_to_contact", "deployed", "running"].includes(status)) return "purple";
  if (["contacted", "follow_up", "scheduled", "due", "waiting_approval", "onboarding"].includes(status)) return "yellow";
  if (["rejected", "failed", "lost", "cancelled", "error"].includes(status)) return "red";
  if (["replied", "analyzed", "building", "demo_building", "qa"].includes(status)) return "blue";
  return "muted";
}

export function sum(items, selector) {
  return items.reduce((total, item) => total + Number(selector(item) || 0), 0);
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

export function initials(name = "Owner") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "OW";
}

export function uid() {
  return crypto.randomUUID();
}

export function isoOffset({ days = 0, hours = 0, minutes = 0 } = {}) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(date.getHours() + hours);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function slugify(value = "") {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function debounce(fn, wait = 200) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

