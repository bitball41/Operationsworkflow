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

await import("../js/services/openscout/storage.js");
await import("../js/services/openscout/classify.js");
await import("../js/services/openscout/verify.js");
await import("../js/services/openscout/location.js");
await import("../js/services/openscout/google-places.js");

const { NAV_GROUPS } = await import("../js/config.js");
const { createSampleData } = await import("../js/data/sample-data.js");
const { getState, setData, setState } = await import("../js/core/state.js");
const { normalizeLead, duplicateKey, splitAddress } = await import("../js/services/openscout/adapter.js");
const overview = await import("../js/pages/overview.js");
const sales = await import("../js/pages/sales.js");
const communication = await import("../js/pages/communication.js");
const websites = await import("../js/pages/websites.js");
const clients = await import("../js/pages/clients.js");
const business = await import("../js/pages/business.js");
const workspace = await import("../js/pages/workspace.js");
const system = await import("../js/pages/system.js");

setData(createSampleData(), { silent: true });
setState({ mode: "preview", route: "home", routeParams: {} }, { silent: true });

const renderers = {
  home: overview.renderHome,
  activity: overview.renderActivity,
  tasks: overview.renderTasks,
  calendar: overview.renderCalendar,
  discovery: sales.renderDiscovery,
  leads: sales.renderLeads,
  pipeline: sales.renderPipeline,
  outreach: communication.renderOutreach,
  inbox: communication.renderInbox,
  "follow-ups": communication.renderFollowUps,
  studio: websites.renderStudio,
  templates: websites.renderTemplates,
  demos: websites.renderDemos,
  deployments: websites.renderDeployments,
  clients: clients.renderClients,
  projects: clients.renderProjects,
  maintenance: clients.renderMaintenance,
  payments: business.renderPayments,
  analytics: business.renderAnalytics,
  pricing: business.renderPricing,
  costs: business.renderCosts,
  notes: workspace.renderNotes,
  integrations: system.renderIntegrations,
  settings: system.renderSettings,
};

for (const [route, render] of Object.entries(renderers)) {
  test(`${route} renders a complete view with sample data`, () => {
    setState({ route, routeParams: {} }, { silent: true });
    const html = render();
    assert.equal(typeof html, "string");
    assert.ok(html.length > 300, `${route} returned only ${html.length} characters`);
    assert.doesNotMatch(html, />\s*undefined\s*</i);
  });
}

test("sidebar and renderer maps stay aligned", () => {
  const configuredRoutes = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
  assert.deepEqual(configuredRoutes.sort(), Object.keys(renderers).sort());
  assert.equal(new Set(configuredRoutes).size, configuredRoutes.length);
});

test("sidebar excludes intentionally top-right and out-of-scope pages", () => {
  const labels = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label)).join(" ");
  for (const forbidden of ["AI Agents", "Approval Queue", "Notifications", "Personal Finance", "Automations"]) {
    assert.ok(!labels.includes(forbidden), `${forbidden} should not be a sidebar destination`);
  }
});

test("OpenScout adapter preserves source evidence and normalizes the lead boundary", () => {
  const lead = normalizeLead({
    id: "google-place-123",
    name: "North Star Tree Care",
    address: "1400 Oak Street, Arlington, TX 76010, USA",
    phone: "(817) 555-0148",
    website: "",
    googleMapsURL: "https://maps.google.com/?cid=123",
    primaryType: "tree_service",
    rating: 4.8,
    ratingCount: 37,
    businessStatus: "OPERATIONAL",
    isLead: true,
    leadTier: "none",
    leadCategory: "none",
    leadType: "No website",
    confidence: 96,
    reasons: ["Google lists no website", "Has a phone number"],
    verification: "",
    lat: 32.7357,
    lng: -97.1081,
  }, { location: "Arlington, TX", category: "tree service" });

  assert.equal(lead.source, "openscout");
  assert.equal(lead.source_key, "google-place-123");
  assert.equal(lead.city, "Arlington");
  assert.equal(lead.region, "TX");
  assert.equal(lead.postal_code, "76010");
  assert.equal(lead.has_website, false);
  assert.equal(lead.lead_score, 96);
  assert.equal(lead.email, "");
  assert.equal(lead.source_metadata.openscout.ratingCount, 37);
  assert.equal(duplicateKey(lead), "source:google-place-123");
});

test("address fallback is deterministic", () => {
  assert.deepEqual(splitAddress("1400 Oak Street, Arlington, TX 76010, USA"), {
    city: "Arlington",
    region: "TX",
    postalCode: "76010",
    country: "USA",
  });
  assert.deepEqual(splitAddress(""), { city: "", region: "", postalCode: "", country: "" });
});

test("preview mode loads every expected data collection", () => {
  const data = getState().data;
  for (const key of [
    "leads", "discoveryRuns", "discoveryResults", "templates", "demos", "drafts",
    "emailThreads", "emails", "followUps", "clients", "projects",
    "maintenanceSubscriptions", "payments", "expenses", "aiUsage", "tasks",
    "calendarEvents", "notes", "deployments", "approvals", "notifications", "activity",
  ]) {
    assert.ok(Array.isArray(data[key]), `${key} should be an array`);
    assert.ok(data[key].length > 0, `${key} should have realistic preview records`);
  }
});
