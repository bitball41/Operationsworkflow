/* Maps Whop payment payloads into the fields Operations owns. This module has
   no browser or Worker dependencies so webhook tests and the Worker share the
   exact same accounting rules. */

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

function paymentStatus(payment) {
  const status = String(payment?.status || payment?.state || "").toLowerCase();
  if (Number(payment?.refunded_amount) > 0 || status.includes("refund")) return "refunded";
  if (["failed", "canceled", "cancelled", "disputed", "chargeback"].some((value) => status.includes(value))) return "failed";
  if (["paid", "succeeded", "success", "completed", "settled", "active"].some((value) => status.includes(value))) return "paid";
  if (status.includes("available")) return "available";
  return "pending";
}

function paymentType(payment) {
  const plan = String(payment?.plan_type || payment?.billing_period || payment?.plan?.plan_type || "").toLowerCase();
  return plan.includes("renewal") || plan.includes("recurring") || plan.includes("month") || plan.includes("year")
    ? "maintenance"
    : "website_sale";
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
