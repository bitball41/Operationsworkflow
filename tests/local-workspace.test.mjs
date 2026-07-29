import assert from "node:assert/strict";
import test from "node:test";

globalThis.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
  key(index) { return [...this.values.keys()][index] ?? null; },
  get length() { return this.values.size; },
};

const { clearLocalWorkspace } = await import("../js/services/data.js");

test("release clears legacy business records and obsolete account sessions", () => {
  localStorage.setItem("operations.data.v2", JSON.stringify({ leads: [{ id: "old-lead" }] }));
  localStorage.setItem("operations.data.v2.cloud-signature", "old-signature");
  localStorage.setItem("operations.automation", JSON.stringify({ running: true }));
  localStorage.setItem("openscout.googleMapsApiKey", "old-browser-key");
  localStorage.setItem("openscout.lastLocationGuess", JSON.stringify({ city: "Austin" }));
  localStorage.setItem("sb-yswxdsagoywzevwgarbf-auth-token", "supabase-session");
  localStorage.setItem("operations.navCollapsed", "true");

  clearLocalWorkspace();

  for (const key of [
    "operations.data.v2",
    "operations.data.v2.cloud-signature",
    "operations.automation",
    "openscout.googleMapsApiKey",
    "openscout.lastLocationGuess",
  ]) assert.equal(localStorage.getItem(key), null, `${key} must be removed`);

  assert.equal(localStorage.getItem("sb-yswxdsagoywzevwgarbf-auth-token"), null);
  assert.equal(localStorage.getItem("operations.navCollapsed"), "true");
});

test("there is no local workspace loader or upload bridge", async () => {
  const data = await import("../js/services/data.js");
  assert.equal(data.loadLocalWorkspace, undefined);
  assert.equal(data.pushLocalWorkspaceToCloud, undefined);
});
