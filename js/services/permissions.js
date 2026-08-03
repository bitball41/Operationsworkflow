import { getState } from "../core/state.js";

export const OWNER_ONLY_AREAS = Object.freeze(new Set([
  "integrations",
  "settings",
  "team",
  "deployments",
  "payments",
  "commissions",
]));

export function currentMember() {
  return getState().user?.member || null;
}

export function currentMemberId() {
  return currentMember()?.id || "";
}

export function currentRole() {
  return currentMember()?.role || "unknown";
}

export function isOwner() {
  return currentRole() === "owner";
}

export function isSalesperson() {
  return currentRole() === "salesperson";
}

export function canManageOwnerArea(area) {
  return !OWNER_ONLY_AREAS.has(area) || isOwner();
}

export function ownerOnlyNotice(action = "This action") {
  return `${action} is owner-only. You can view this area, but the Worker will reject the write.`;
}
