/**
 * Outreach copy and the send boundary.
 *
 * Drafting is deterministic — the default email is a fixed template, so neither
 * the composer nor automation needs a model to produce it. Sending is a real
 * integration boundary that refuses to pretend when Outlook is not connected.
 */
import { CONFIG, FOLLOW_UP_BODY, OUTREACH_BODY, OUTREACH_SUBJECT } from "../../config.js";
import { fillTemplate } from "../../core/utils.js";
import { NotConnectedError, isConnected } from "../integrations.js";
import { ApiError, replyToOutlookMessage, sendOutlookEmail } from "../api.js";

export function draftOutreach({ lead, demo, price, owner }) {
  const values = {
    business: lead?.business_name || "your business",
    link: demo?.preview_url || "[preview link]",
    price: Number(price) || CONFIG.defaultSetupFee,
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
    price: Number(price) || CONFIG.defaultSetupFee,
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value) {
  const address = String(value || "").trim();
  return address.length <= 320 && EMAIL_PATTERN.test(address);
}

/** Accepts a string, a comma/semicolon list, or an array. Returns clean addresses. */
export function recipientList(value) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[,;]/);
  return [...new Set(values.map((entry) => String(entry).trim()).filter(Boolean))];
}

/**
 * The single place a real email leaves the system. Cloudflare Access protects
 * the Worker, which owns the encrypted Microsoft OAuth tokens.
 *
 * Recipients are validated here rather than only in the Worker so a lead with
 * no email address is reported as a blocked step — the automation loop treats
 * that as "prepared, not sent" instead of counting it as a hard failure.
 */
export async function sendEmail({ to, cc, subject, body }) {
  const recipients = recipientList(to);
  const copies = recipientList(cc);
  if (!recipients.length) {
    throw new NotConnectedError("outlook", "No email address to send to, so nothing was sent.");
  }

  const invalid = [...recipients, ...copies].filter((address) => !isEmailAddress(address));
  if (invalid.length) {
    throw new NotConnectedError("outlook", `Not a valid email address: ${invalid.slice(0, 3).join(", ")}.`);
  }
  if (!String(subject || "").trim()) throw new Error("An email needs a subject.");
  if (!String(body || "").trim()) throw new Error("An email needs a body.");
  if (!canSend()) throw new NotConnectedError("outlook", "Outlook is not connected, so no email was sent.");

  try {
    return await sendOutlookEmail({
      to: recipients,
      ...(copies.length ? { cc: copies } : {}),
      subject: String(subject).trim(),
      body: String(body),
    });
  } catch (error) {
    if (error instanceof ApiError && error.blocked) {
      throw new NotConnectedError("outlook", error.message);
    }
    throw error;
  }
}

/** Replies inside a real Outlook conversation instead of starting a new one. */
export async function replyToMessage({ messageId, body }) {
  if (!canSend()) throw new NotConnectedError("outlook", "Outlook is not connected, so no reply was sent.");
  if (!messageId) throw new Error("A reply needs the Outlook message it is answering.");
  if (!String(body || "").trim()) throw new Error("A reply needs a body.");
  try {
    return await replyToOutlookMessage({ message_id: messageId, body: String(body) });
  } catch (error) {
    if (error instanceof ApiError && error.blocked) {
      throw new NotConnectedError("outlook", error.message);
    }
    throw error;
  }
}
