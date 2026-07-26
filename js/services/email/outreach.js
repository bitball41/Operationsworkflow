/**
 * Outreach copy and the send boundary.
 *
 * Drafting is deterministic — the default email is a fixed template, so neither
 * the composer nor automation needs a model to produce it. Sending is a real
 * integration boundary that refuses to pretend when Gmail is not connected.
 */
import { FOLLOW_UP_BODY, OUTREACH_BODY, OUTREACH_SUBJECT } from "../../config.js";
import { fillTemplate } from "../../core/utils.js";
import { NotConnectedError, isConnected } from "../integrations.js";

export function draftOutreach({ lead, demo, price, owner }) {
  const values = {
    business: lead?.business_name || "your business",
    link: demo?.preview_url || "[preview link]",
    price: Number(price) || 500,
    owner: owner || "Connor",
  };
  return {
    subject: fillTemplate(OUTREACH_SUBJECT, values),
    body: fillTemplate(OUTREACH_BODY, values),
  };
}

export function draftFollowUp({ lead, demo, price, owner, attempt = 2 }) {
  const values = {
    business: lead?.business_name || "your business",
    link: demo?.preview_url || "[preview link]",
    price: Number(price) || 500,
    owner: owner || "Connor",
  };
  return {
    subject: `Following up — ${values.business}`,
    body: fillTemplate(FOLLOW_UP_BODY, values),
    attempt,
  };
}

export function canSend() {
  return isConnected("gmail");
}

/**
 * The single place a real email would leave the system. Swap the body of this
 * function for a Gmail API call once credentials exist; every caller already
 * handles the blocked case.
 */
export async function sendEmail({ to, subject, body }) {
  if (!canSend()) throw new NotConnectedError("gmail", "Gmail is not connected, so no email was sent.");
  throw new NotConnectedError("gmail", `Gmail transport is not implemented yet (would send "${subject}" to ${to}).`);
}
