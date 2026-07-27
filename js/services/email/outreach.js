/**
 * Outreach copy and the send boundary.
 *
 * Drafting is deterministic — the default email is a fixed template, so neither
 * the composer nor automation needs a model to produce it. Sending is a real
 * integration boundary that refuses to pretend when Outlook is not connected.
 */
import { FOLLOW_UP_BODY, OUTREACH_BODY, OUTREACH_SUBJECT } from "../../config.js";
import { fillTemplate } from "../../core/utils.js";
import { NotConnectedError, isConnected } from "../integrations.js";
import { ApiError, sendOutlookEmail } from "../api.js";

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
  return isConnected("outlook");
}

/**
 * The single place a real email leaves the system. The Worker verifies the
 * current Supabase session and owns the encrypted Microsoft OAuth tokens.
 */
export async function sendEmail({ to, subject, body }) {
  if (!canSend()) throw new NotConnectedError("outlook", "Outlook is not connected, so no email was sent.");
  try {
    return await sendOutlookEmail({ to, subject, body });
  } catch (error) {
    if (error instanceof ApiError && error.blocked) {
      throw new NotConnectedError("outlook", error.message);
    }
    throw error;
  }
}
