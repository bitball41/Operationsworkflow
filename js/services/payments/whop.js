/**
 * Whop payments.
 *
 * WHOP_API_KEY was a Worker secret with no caller: the Payments page only ever
 * showed rows typed in by hand, so revenue, profit and every number derived
 * from them were whatever had been remembered manually. This pulls the real
 * charges through the Worker's read-only Whop proxy and stores each one once.
 *
 * Amounts are trusted from Whop and never estimated. A payment that cannot be
 * mapped to a positive amount is skipped rather than guessed at.
 */
import { getState } from "../../core/state.js";
import { whopGet } from "../api.js";
import { createRecord, logActivity, updateRecord } from "../data.js";
import { NotConnectedError, isConnected } from "../integrations.js";

const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const AUTO_SYNC_INTERVAL = 5 * 60 * 1000;

function firstNumber(...values) {
  for (const value of values) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * Whop's payment status vocabulary is wider than this dashboard's. Anything
 * that is not clearly settled, refunded or failed stays `pending`, which keeps
 * it out of the revenue totals until Whop says otherwise.
 */
function paymentStatus(payment) {
  const status = String(payment?.status || payment?.state || "").toLowerCase();
  if (Number(payment?.refunded_amount) > 0 || status.includes("refund")) return "refunded";
  if (["failed", "canceled", "cancelled", "disputed", "chargeback"].some((value) => status.includes(value))) return "failed";
  if (["paid", "succeeded", "success", "completed", "settled", "active"].some((value) => status.includes(value))) return "paid";
  if (status.includes("available")) return "available";
  return "pending";
}

/** Recurring plans are maintenance; a one-off charge is a website sale. */
function paymentType(payment) {
  const plan = String(payment?.plan_type || payment?.billing_period || payment?.plan?.plan_type || "").toLowerCase();
  const recurring = plan.includes("renewal") || plan.includes("recurring") || plan.includes("month") || plan.includes("year");
  return recurring ? "maintenance" : "website_sale";
}

function customerName(payment) {
  return firstString(
    payment?.user?.name,
    payment?.user?.username,
    payment?.user?.email,
    payment?.member?.name,
    payment?.customer_name,
    payment?.email,
    "Whop customer",
  );
}

function paidAt(payment) {
  const raw = payment?.paid_at ?? payment?.settled_at ?? payment?.created_at ?? payment?.created_at_epoch;
  if (raw === undefined || raw === null || raw === "") return null;
  /* Whop returns unix seconds on some surfaces and ISO strings on others. */
  const value = typeof raw === "number" || /^\d+$/.test(String(raw)) ? Number(raw) * 1000 : Date.parse(raw);
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

export function toPaymentRecord(payment) {
  const amount = firstNumber(payment?.final_amount, payment?.subtotal, payment?.amount, payment?.total);
  if (!amount) return null;

  return {
    payment_type: paymentType(payment),
    customer_name: customerName(payment),
    amount,
    fee_amount: Math.max(0, Number(payment?.fee_amount ?? payment?.whop_fee ?? 0) || 0),
    status: paymentStatus(payment),
    refund_state: Number(payment?.refunded_amount) > 0 ? "refunded" : "none",
    source: "whop",
    external_transaction_id: firstString(payment?.id, payment?.receipt_id, payment?.transaction_id),
    paid_at: paidAt(payment),
  };
}

async function fetchPage(page) {
  const response = await whopGet("company/payments", { page: String(page), per: String(PAGE_SIZE) });
  const rows = Array.isArray(response?.data) ? response.data
    : Array.isArray(response?.payments) ? response.payments
      : Array.isArray(response) ? response
        : [];
  return { rows, total: Number(response?.pagination?.total_page ?? response?.total_page ?? 0) };
}

/**
 * Imports Whop payments into the workspace.
 *
 * Existing rows are matched on `external_transaction_id` and patched rather
 * than duplicated, so a refund or a settled status arrives on a re-sync without
 * creating a second payment.
 *
 * @returns {Promise<{imported: number, updated: number, skipped: number, scanned: number}>}
 */
export async function syncWhopPayments({ maxPages = MAX_PAGES } = {}) {
  if (!isConnected("whop")) {
    throw new NotConnectedError("whop", "Whop is not connected. Add WHOP_API_KEY to the Cloudflare Worker.");
  }

  const known = new Map(
    getState().data.payments
      .filter((payment) => payment.external_transaction_id)
      .map((payment) => [String(payment.external_transaction_id), payment]),
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let scanned = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const { rows, total } = await fetchPage(page);
    if (!rows.length) break;
    scanned += rows.length;

    for (const row of rows) {
      const record = toPaymentRecord(row);
      if (!record?.external_transaction_id) {
        skipped += 1;
        continue;
      }

      const existing = known.get(record.external_transaction_id);
      if (existing) {
        /* Only the fields Whop is authoritative for; a client link or a note
           added by hand on this row must survive the re-sync. */
        if (existing.status !== record.status || Number(existing.amount) !== record.amount) {
          await updateRecord("payments", existing.id, {
            status: record.status,
            amount: record.amount,
            fee_amount: record.fee_amount,
            refund_state: record.refund_state,
            paid_at: record.paid_at,
          });
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const created = await createRecord("payments", record);
      known.set(record.external_transaction_id, created);
      imported += 1;
    }

    if (total && page >= total) break;
    if (rows.length < PAGE_SIZE) break;
  }

  if (imported || updated) {
    await logActivity(
      "whop_synced",
      `Whop sync: ${imported} new payment${imported === 1 ? "" : "s"}`,
      `${updated} updated, ${scanned} scanned.`,
      {},
      "system",
    );
  }

  return { imported, updated, skipped, scanned };
}

/** The Whop account the key belongs to. Used to confirm the key is live. */
export async function whopAccount() {
  if (!isConnected("whop")) {
    throw new NotConnectedError("whop", "Whop is not connected. Add WHOP_API_KEY to the Cloudflare Worker.");
  }
  const response = await whopGet("me");
  return {
    id: response?.id || "",
    name: firstString(response?.name, response?.username, response?.email),
    email: response?.email || "",
  };
}

let autoSyncStop = null;

/**
 * Reconciles Whop when the dashboard opens and every five minutes while it is
 * visible. The importer is idempotent, so a manual sync and an automatic sync
 * can safely overlap in intent; this runner still serializes its own calls.
 */
export function startWhopAutoSync({ interval = AUTO_SYNC_INTERVAL } = {}) {
  autoSyncStop?.();
  let stopped = false;
  let running = false;
  let timer = null;

  const schedule = () => {
    if (stopped) return;
    timer = globalThis.setTimeout(run, interval);
  };
  const run = async () => {
    if (stopped || running) return;
    if (globalThis.document?.hidden || !isConnected("whop")) {
      schedule();
      return;
    }
    running = true;
    try {
      await syncWhopPayments();
    } catch (error) {
      console.warn("Automatic Whop sync failed", error);
    } finally {
      running = false;
      schedule();
    }
  };
  const onVisible = () => {
    if (!globalThis.document?.hidden && !running) {
      if (timer) globalThis.clearTimeout(timer);
      run();
    }
  };

  globalThis.document?.addEventListener?.("visibilitychange", onVisible);
  run();
  autoSyncStop = () => {
    stopped = true;
    if (timer) globalThis.clearTimeout(timer);
    globalThis.document?.removeEventListener?.("visibilitychange", onVisible);
  };
  return autoSyncStop;
}
