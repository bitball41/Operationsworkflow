/**
 * The dashboard must never put invented records in front of the person using
 * it. These tests pin that: a fresh workspace is empty, and a browser that
 * still holds records from the old starter workspace has them swept out.
 */
import assert from "node:assert/strict";
import test from "node:test";

globalThis.localStorage = {
  values: new Map(),
  get length() {
    return this.values.size;
  },
  key(index) {
    return [...this.values.keys()][index] ?? null;
  },
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

await import("../js/services/openscout/storage.js");
await import("../js/services/openscout/classify.js");
await import("../js/services/openscout/verify.js");
await import("../js/services/openscout/location.js");
await import("../js/services/openscout/google-places.js");

const { loadLocalWorkspace } = await import("../js/services/data.js");
const { getState } = await import("../js/core/state.js");

const LOCAL_KEY = "operations.data.v2";
const SAMPLE_ID = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function writeLocal(snapshot) {
  globalThis.localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
}

test("a workspace that has never been used opens empty", () => {
  globalThis.localStorage.removeItem(LOCAL_KEY);
  loadLocalWorkspace();
  const { data } = getState();

  for (const key of ["leads", "clients", "payments", "emails", "demos", "activity", "expenses"]) {
    assert.deepEqual(data[key], [], `${key} should start empty`);
  }
  assert.equal(data.profile, null);
});

test("records left behind by the old starter workspace are swept out", () => {
  writeLocal({
    profile: { id: "local", full_name: "Owner" },
    leads: [
      { id: SAMPLE_ID(1), business_name: "Invented Tree Care", updated_at: "2026-07-01T00:00:00.000Z" },
      { id: "real-lead", business_name: "A business I actually found", updated_at: "2026-07-02T00:00:00.000Z" },
    ],
    payments: [{ id: SAMPLE_ID(200), amount: 500, created_at: "2026-07-01T00:00:00.000Z" }],
    emails: [{ id: SAMPLE_ID(70), subject: "Invented reply", created_at: "2026-07-01T00:00:00.000Z" }],
  });

  loadLocalWorkspace();
  const { data } = getState();

  assert.equal(data.leads.length, 1, "only the real lead survives");
  assert.equal(data.leads[0].id, "real-lead");
  assert.deepEqual(data.payments, [], "invented revenue is gone");
  assert.deepEqual(data.emails, [], "invented emails are gone");
});

test("the sweep is persisted, so invented records do not come back on reload", () => {
  writeLocal({ leads: [{ id: SAMPLE_ID(3), business_name: "Invented", updated_at: "2026-07-01T00:00:00.000Z" }] });
  loadLocalWorkspace();

  /* The write is debounced; give it a beat, then reload from storage. */
  return new Promise((resolve) => setTimeout(() => {
    const stored = JSON.parse(globalThis.localStorage.getItem(LOCAL_KEY));
    assert.deepEqual(stored.leads, [], "storage no longer holds the sample lead");
    resolve();
  }, 500));
});

test("nothing in the application can seed a workspace", async () => {
  const data = await import("../js/services/data.js");
  assert.equal(data.loadSampleWorkspace, undefined, "there is no sample-loading export");
});
