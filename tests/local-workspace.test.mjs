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

const { COLLECTIONS, clearLocalWorkspace, loadCloudWorkspace, reloadWorkspace } = await import("../js/services/data.js");
const { getState, setState } = await import("../js/core/state.js");

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

test("a failed refresh never leaves the workspace claiming it is synced", async () => {
  const snapshot = Object.fromEntries(Object.keys(COLLECTIONS).map((key) => [key, []]));
  await loadCloudWorkspace({ ...snapshot, profile: null, workspace: { id: "test-workspace" } });
  const lastSyncedAt = getState().connection.lastSyncedAt;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network offline"); };
  try {
    await assert.rejects(reloadWorkspace(), /Could not reach the API worker/);
    assert.equal(getState().connection.ok, false);
    assert.equal(getState().connection.status, "degraded");
    assert.equal(getState().connection.lastSyncedAt, lastSyncedAt);
  } finally {
    globalThis.fetch = originalFetch;
    setState({ connection: { ok: false, status: "loading", message: "", lastSyncedAt: null } }, { silent: true });
  }
});
