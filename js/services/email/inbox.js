/**
 * Inbox ingestion.
 *
 * Outlook used to be write-only: the dashboard could send an outreach email and
 * then had no way to ever see the answer, so Inbox, reply classification and
 * every follow-up decision built on top of them had nothing to work with. This
 * pulls the real mailbox in through the Worker and turns each message into the
 * thread + email records the rest of the app already reads.
 *
 * Nothing here invents a thread. When Outlook is not connected it says so and
 * changes nothing.
 */
import { getState } from "../../core/state.js";
import { fetchOutlookMessages } from "../api.js";
import { createRecord, logActivity, updateRecord } from "../data.js";
import { NotConnectedError, canReadOutlookMail, isConnected, outlookBlocker } from "../integrations.js";

/** Newest message already stored, so a sync only ever fetches the tail. */
function newestStoredAt() {
  const stamps = getState().data.emailThreads
    .map((thread) => Date.parse(thread.last_message_at || thread.created_at || ""))
    .filter((value) => Number.isFinite(value));
  return stamps.length ? new Date(Math.max(...stamps)).toISOString() : "";
}

function leadForSender(email) {
  const address = String(email || "").toLowerCase();
  if (!address) return null;
  const domain = address.split("@")[1] || "";
  const leads = getState().data.leads;

  const byEmail = leads.find((lead) => String(lead.email || "").toLowerCase() === address);
  if (byEmail) return byEmail;

  /* A reply often comes from a person at the business rather than the address
     the outreach went to, so fall back to the website's domain. */
  if (!domain) return null;
  return leads.find((lead) => {
    const website = String(lead.website_url || "").toLowerCase();
    return website && website.includes(domain);
  }) || null;
}

function threadByExternalId(externalId) {
  if (!externalId) return null;
  return getState().data.emailThreads.find((thread) => thread.external_thread_id === externalId) || null;
}

function emailExists(externalMessageId) {
  if (!externalMessageId) return false;
  return getState().data.emails.some((email) => email.external_message_id === externalMessageId);
}

/**
 * Pulls recent inbox messages and stores the ones that are new.
 *
 * `fetchMessages` is injectable so the record-building rules — lead matching,
 * de-duplication, the pipeline move on a reply — can be tested without a
 * Supabase session and a live mailbox behind them.
 *
 * @returns {Promise<{threads: number, messages: number, skipped: number}>}
 */
export async function syncInbox({ limit = 50, fetchMessages = fetchOutlookMessages } = {}) {
  if (!isConnected("outlook")) {
    throw new NotConnectedError("outlook", outlookBlocker() || "Outlook is not connected, so the inbox was not read.");
  }
  if (!canReadOutlookMail()) {
    throw new NotConnectedError(
      "outlook",
      "This Outlook connection can send but not read. Disconnect and reconnect it from Integrations to grant Mail.Read.",
    );
  }

  const messages = await fetchMessages({ since: newestStoredAt(), limit });
  let newThreads = 0;
  let newMessages = 0;
  let skipped = 0;

  /* Oldest first so a thread's `last_message_at` ends on the newest message. */
  for (const message of [...messages].reverse()) {
    if (emailExists(message.id)) {
      skipped += 1;
      continue;
    }

    const lead = leadForSender(message.from_email);
    const existing = threadByExternalId(message.thread_id);
    const thread = existing
      ? await updateRecord("emailThreads", existing.id, {
        is_unread: existing.is_unread || message.unread,
        last_message_at: message.received_at || new Date().toISOString(),
        ...(lead && !existing.lead_id ? { lead_id: lead.id } : {}),
      })
      : await createRecord("emailThreads", {
        lead_id: lead?.id || null,
        external_thread_id: message.thread_id,
        subject: message.subject,
        sender_name: message.from_name || message.from_email,
        sender_email: message.from_email,
        classification: "other",
        is_unread: message.unread !== false,
        last_message_at: message.received_at || new Date().toISOString(),
      });

    if (!existing) newThreads += 1;

    await createRecord("emails", {
      thread_id: thread.id,
      lead_id: lead?.id || null,
      direction: "inbound",
      sender: message.from_email,
      recipients: message.to || [],
      subject: message.subject,
      body: message.preview,
      status: "received",
      external_message_id: message.id,
      received_at: message.received_at || new Date().toISOString(),
    });
    newMessages += 1;

    /* A reply from someone we emailed is the single most important event in
       this workflow, so it moves the lead out of "contacted" on its own. */
    if (lead && lead.status === "contacted") {
      await updateRecord("leads", lead.id, { status: "replied" });
    }
  }

  if (newMessages) {
    await logActivity(
      "inbox_synced",
      `${newMessages} new message${newMessages === 1 ? "" : "s"} from Outlook`,
      `${newThreads} new thread${newThreads === 1 ? "" : "s"}.`,
      {},
      "system",
    );
  }

  return { threads: newThreads, messages: newMessages, skipped };
}
