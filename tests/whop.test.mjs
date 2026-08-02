import assert from "node:assert/strict";
import test from "node:test";

globalThis.localStorage = {
  values: new Map(),
  getItem(key) {
    return this.values.get(key) ?? null;
  },
  setItem(key, value) {
    this.values.set(key, String(value));
  },
  removeItem(key) {
    this.values.delete(key);
  },
};
globalThis.window = {};

const { toPaymentRecord } = await import("../js/services/payments/whop.js");

test("a settled Whop charge becomes a payment the revenue totals can use", () => {
  const record = toPaymentRecord({
    id: "pay_abc123",
    status: "succeeded",
    final_amount: 500,
    fee_amount: 14.5,
    metadata: { client_id: "11111111-1111-4111-8111-111111111111" },
    user: { name: "Dana Reyes", email: "dana@example.com" },
    created_at: 1785000000,
  });

  assert.equal(record.external_transaction_id, "pay_abc123");
  assert.equal(record.status, "paid");
  assert.equal(record.payment_type, "setup_fee");
  assert.equal(record.client_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(record.customer_name, "Dana Reyes");
  assert.equal(record.amount, 500);
  assert.equal(record.fee_amount, 14.5);
  assert.equal(record.source, "whop");
  assert.equal(record.paid_at, new Date(1785000000 * 1000).toISOString());
});

test("a recurring plan is filed as a recurring subscription, not setup revenue", () => {
  const record = toPaymentRecord({
    id: "pay_sub",
    status: "paid",
    final_amount: 50,
    plan_type: "renewal",
    user: { username: "acme" },
    paid_at: "2026-07-01T12:00:00Z",
  });

  assert.equal(record.payment_type, "recurring_subscription");
  assert.equal(record.customer_name, "acme");
  assert.equal(record.paid_at, "2026-07-01T12:00:00.000Z");
});

test("refunded and failed charges never count as revenue", () => {
  assert.equal(toPaymentRecord({ id: "a", status: "paid", final_amount: 100, refunded_amount: 100 }).status, "refunded");
  assert.equal(toPaymentRecord({ id: "b", status: "disputed", final_amount: 100 }).status, "failed");
  /* Anything Whop has not settled stays pending, which keeps it out of the
     totals until Whop says otherwise. */
  assert.equal(toPaymentRecord({ id: "c", status: "processing", final_amount: 100 }).status, "pending");
});

test("a charge with no usable amount is skipped rather than guessed at", () => {
  assert.equal(toPaymentRecord({ id: "d", status: "paid" }), null);
  assert.equal(toPaymentRecord({ id: "e", status: "paid", final_amount: 0 }), null);
});

test("an unnamed customer still produces a valid record", () => {
  const record = toPaymentRecord({ id: "f", status: "paid", amount: 25 });
  assert.equal(record.customer_name, "Whop customer", "customer_name is NOT NULL in the schema");
  assert.equal(record.amount, 25);
});
