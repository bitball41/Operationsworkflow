import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

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

const { createSeedData } = await import("../js/data/seed-data.js");
const { getState, setData, setState } = await import("../js/core/state.js");
const { buildBundleForLead, chooseTemplate, composeDocument, BUNDLE_FILES } = await import("../js/services/sites/bundle.js");
const { TEMPLATE_CATALOG, templateByKey } = await import("../js/data/site-templates.js");
const operations = await import("../js/services/operations.js");
const { AUTOMATION_STEPS, automationSettings } = await import("../js/services/automation/engine.js");
const { listTools, runTool, toolSchema, getTool } = await import("../js/services/ai/tools.js");
const { buildContext, contextSections } = await import("../js/services/ai/context.js");
const { matchCommand } = await import("../js/services/ai/commands.js");
const { isConnected, integrationList } = await import("../js/services/integrations.js");
const { providerReady } = await import("../js/services/ai/provider.js");
const { canSend } = await import("../js/services/email/outreach.js");
const { normalizeLead, duplicateKey, splitAddress } = await import("../js/services/openscout/adapter.js");

const seed = createSeedData();
setData(seed, { silent: true });
setState({ route: "home", routeParams: {}, storage: "local" }, { silent: true });

/* ---------- site bundles ---------- */

test("a template plus a lead produces real site files", () => {
  const lead = getState().data.leads[0];
  const entry = templateByKey("timberline");
  const { files, site } = buildBundleForLead(lead, entry);
  assert.deepEqual(Object.keys(files).sort(), [...BUNDLE_FILES].sort());
  assert.match(files["index.html"], /<!doctype html>/i);
  assert.match(files["index.html"], /<link rel="stylesheet" href="style\.css">/);
  assert.match(files["index.html"], /<script src="script\.js"><\/script>/);
  assert.ok(files["style.css"].includes("--accent"));
  assert.ok(files["index.html"].includes(lead.business_name));
  assert.equal(site.business, lead.business_name);
});

test("business data is escaped into the generated markup", () => {
  const { files } = buildBundleForLead({
    business_name: '<script>alert("x")</script> Tree Co',
    category: "Tree Service",
    city: "Arlington",
  }, templateByKey("timberline"));
  assert.ok(!files["index.html"].includes("<script>alert"));
  assert.ok(files["index.html"].includes("&lt;script&gt;"));
});

test("composeDocument inlines css and js for previewing", () => {
  const { files } = buildBundleForLead(getState().data.leads[0], templateByKey("pipeworks"));
  const document_ = composeDocument(files);
  assert.ok(!document_.includes('href="style.css"'));
  assert.ok(!document_.includes('src="script.js"'));
  assert.ok(document_.includes("<style>"));
  assert.ok(document_.includes("addEventListener"));
});

test("every catalogue template renders", () => {
  for (const entry of TEMPLATE_CATALOG) {
    const { files } = buildBundleForLead({ business_name: "Test Co", category: entry.category, city: "Dallas" }, entry);
    assert.ok(files["index.html"].length > 800, `${entry.key} produced a thin page`);
  }
});

test("templates are chosen by niche with a neutral fallback", () => {
  const templates = getState().data.templates;
  assert.equal(chooseTemplate({ category: "Tree Service" }, templates).record.name, "Timberline");
  assert.equal(chooseTemplate({ category: "Emergency Plumbing" }, templates).record.name, "Pipeworks");
  assert.equal(chooseTemplate({ category: "Alpaca Grooming" }, templates).record.layout_key, "mainstreet");
});

/* ---------- operations ---------- */

test("get_next_lead picks the best uncontacted lead and skips the rest", () => {
  const next = operations.getNextLead();
  assert.ok(next, "expected a lead");
  assert.ok(["new", "qualified", "demo_ready"].includes(next.status));
  assert.equal(next.last_contacted_at, null);
  assert.equal(next.has_website, false);

  const others = getState().data.leads.filter((lead) => lead.id !== next.id && !operations.hasBeenContacted(lead) && !lead.has_website);
  for (const lead of others) {
    assert.ok(Number(next.lead_score) >= Number(lead.lead_score), "expected the highest scoring lead first");
  }

  const skipped = operations.getNextLead({ skipIds: [next.id] });
  assert.notEqual(skipped?.id, next.id);
});

test("niche and location filters narrow lead selection", () => {
  const plumbing = operations.getNextLead({ niche: "plumbing" });
  assert.match(plumbing.category.toLowerCase(), /plumb/);
  const keller = operations.getNextLead({ location: "mansfield" });
  assert.match(`${keller.city}`.toLowerCase(), /mansfield/);
});

test("contacted leads are not offered again", () => {
  const contacted = getState().data.leads.find((lead) => lead.status === "contacted");
  assert.ok(operations.hasBeenContacted(contacted));
});

test("attention items surface replies, overdue follow-ups and failed deployments", () => {
  const items = operations.attentionItems();
  const titles = items.map((item) => item.title).join(" | ");
  assert.match(titles, /replied/i);
  assert.match(titles, /follow-up/i);
  assert.match(titles, /deployment/i);
  assert.ok(items[0].weight <= items[items.length - 1].weight, "most urgent first");
});

test("today's numbers and revenue read from records", () => {
  const today = operations.todayStats();
  assert.equal(typeof today.sent, "number");
  assert.equal(typeof today.target, "number");
  assert.ok(today.revenue > 0, "seed data records a payment today");
  const revenue = operations.revenueSummary();
  assert.ok(revenue.gross > 0);
  assert.equal(revenue.profit, revenue.gross - revenue.fees - revenue.costs);
});

/* ---------- automation ---------- */

test("automation runs the intended sequence", () => {
  const ids = AUTOMATION_STEPS.map((step) => step.id);
  assert.deepEqual(ids, [
    "select", "gather", "research", "template", "build",
    "publish", "draft", "send", "pipeline", "followup",
  ]);
});

test("automation ships with usable defaults", () => {
  const settings = automationSettings();
  assert.ok(settings.batchTarget > 0);
  assert.ok(settings.price > 0);
  assert.equal(settings.autoFollowUp, true);
  assert.equal(settings.research, true);
});

/* ---------- tool registry ---------- */

test("the documented tool surface exists", () => {
  const names = listTools().map((tool) => tool.name);
  for (const expected of [
    "get_next_lead", "search_leads", "get_lead", "research_business", "list_templates",
    "choose_template", "create_demo", "update_demo", "publish_demo", "draft_email",
    "send_email", "create_followup", "update_pipeline", "get_inbox", "classify_reply",
    "get_clients", "get_payments", "get_tasks", "start_automation", "stop_automation",
  ]) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
});

test("tools expose a model-ready schema", () => {
  const schema = toolSchema();
  const lead = schema.find((tool) => tool.name === "get_lead");
  assert.equal(lead.input_schema.type, "object");
  assert.deepEqual(lead.input_schema.required, ["lead_id"]);
  assert.ok(schema.every((tool) => typeof tool.description === "string" && tool.description.length > 10));
});

test("required inputs are validated before a tool runs", async () => {
  const result = await runTool("get_lead", {});
  assert.equal(result.ok, false);
  assert.match(result.error, /lead_id/);
});

test("unknown tools fail cleanly", async () => {
  const result = await runTool("delete_everything", {});
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown tool/);
});

test("read tools return data from the workspace", async () => {
  const next = await runTool("get_next_lead", {});
  assert.equal(next.ok, true);
  assert.ok(next.data.business_name);

  const search = await runTool("search_leads", { query: "plumb" });
  assert.equal(search.ok, true);
  assert.ok(search.data.length >= 1);

  const status = await runTool("get_status", {});
  assert.equal(status.ok, true);
  assert.ok(Array.isArray(status.data.attention));
});

test("external tools report blocked instead of pretending", async () => {
  const draft = getState().data.drafts.find((item) => item.status === "ready");
  const result = await runTool("send_email", { draft_id: draft.id });
  assert.equal(result.ok, true, "the tool call itself succeeds");
  assert.equal(result.blocked, true, "sending is blocked");
  assert.match(result.summary, /not connected/i);
  assert.equal(getState().data.drafts.find((item) => item.id === draft.id).status, "ready", "nothing was marked sent");
});

test("research reports that the tool is not connected", async () => {
  const lead = getState().data.leads[0];
  const result = await runTool("research_business", { lead_id: lead.id });
  assert.equal(result.ok, true);
  assert.equal(result.data.connected, false);
  assert.equal(result.data.known.business, lead.business_name);
});

test("write tools mutate through the operations layer", async () => {
  const lead = getState().data.leads.find((item) => item.status === "new");
  const result = await runTool("update_pipeline", { lead_id: lead.id, status: "qualified" });
  assert.equal(result.ok, true);
  assert.equal(getState().data.leads.find((item) => item.id === lead.id).status, "qualified");

  const bad = await runTool("update_pipeline", { lead_id: lead.id, status: "not_a_stage" });
  assert.equal(bad.ok, false);
});

test("a demo can be built, published and drafted end to end", async () => {
  const lead = getState().data.leads.find((item) => item.status === "qualified" && !operations.demoForLead(item.id));
  const built = await runTool("create_demo", { lead_id: lead.id });
  assert.equal(built.ok, true);
  const demo = built.data;
  assert.ok(demo.content.files["index.html"].includes(lead.business_name));

  const published = await runTool("publish_demo", { demo_id: demo.id });
  assert.equal(published.ok, true);
  assert.equal(published.blocked, true, "hosting is not connected");
  /* No preview domain is configured and there is no browser origin under the
     test runner, so the link is root-relative rather than a domain nobody owns. */
  assert.match(getState().data.demos.find((item) => item.id === demo.id).preview_url, /^\/p\/[a-z0-9-]+$/);

  const drafted = await runTool("draft_email", { lead_id: lead.id });
  assert.equal(drafted.ok, true);
  assert.match(drafted.data.body, /I came across/);
  assert.match(drafted.data.body, new RegExp(lead.business_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(drafted.data.body, /one-time fee of \$\d+/);
  assert.equal(drafted.data.status, "ready");
});

test("follow-ups can be scheduled for a lead", async () => {
  const lead = getState().data.leads[0];
  const before = getState().data.followUps.length;
  const result = await runTool("create_followup", { lead_id: lead.id, days: 4 });
  assert.equal(result.ok, true);
  assert.equal(getState().data.followUps.length, before + 1);
  assert.ok(new Date(result.data.due_at) > new Date());
});

test("replies can be classified and move the lead", async () => {
  const thread = getState().data.emailThreads.find((item) => item.classification === "maybe");
  const result = await runTool("classify_reply", { thread_id: thread.id, classification: "interested" });
  assert.equal(result.ok, true);
  assert.equal(getState().data.emailThreads.find((item) => item.id === thread.id).is_unread, false);
  assert.equal(getState().data.leads.find((item) => item.id === thread.lead_id).status, "interested");
});

/* ---------- context adapter ---------- */

test("the context adapter exposes the whole system", () => {
  setState({ route: "leads", routeParams: { lead: "abc" } }, { silent: true });
  const context = buildContext();
  for (const key of [
    "view", "automation", "today", "attention", "money", "pipeline", "leads",
    "discovery", "templates", "demos", "outreach", "inbox", "follow_ups",
    "clients", "projects", "deployments", "payments", "expenses", "tasks",
    "calendar", "notes", "activity", "integrations",
  ]) {
    assert.ok(key in context, `context is missing ${key}`);
  }
  assert.equal(context.view.route, "leads");
  assert.equal(context.view.selected_lead, "abc");
  assert.ok(context.leads.length > 0);
  assert.ok(contextSections().length >= 15);
});

test("context leads are slim projections, not raw rows", () => {
  const [lead] = buildContext().leads;
  assert.ok("business" in lead && "score" in lead && "status" in lead);
  assert.ok(!("source_metadata" in lead), "raw source payloads stay out of context");
});

/* ---------- commands ---------- */

test("code words map to real operations", () => {
  assert.equal(matchCommand("go").tool, "start_automation");
  assert.equal(matchCommand("GO").tool, "start_automation");
  assert.equal(matchCommand("go 12").input.batchTarget, 12);
  assert.equal(matchCommand("stop").tool, "stop_automation");
  assert.equal(matchCommand("status").tool, "get_status");
  assert.equal(matchCommand("next").tool, "get_next_lead");
  assert.equal(matchCommand("write me a poem"), null);
});

/* ---------- integration boundaries ---------- */

test("no provider is connected and nothing claims otherwise", () => {
  assert.equal(providerReady(), false);
  assert.equal(canSend(), false);
  assert.equal(isConnected("cloudflare"), false);
  assert.equal(isConnected("openscout"), true);
  const providers = integrationList();
  assert.ok(providers.every((item) => item.status === "connected" || item.status === "not_connected"));
});

test("no API keys are committed", () => {
  const suspicious = /sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{20,}|AIza[0-9A-Za-z_-]{30,}/;
  for (const file of ["../js/config.js", "../js/services/ai/provider.js", "../js/services/email/outreach.js"]) {
    const content = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(!suspicious.test(content), `${file} looks like it contains a key`);
  }
});

/* ---------- OpenScout boundary ---------- */

test("the OpenScout adapter still normalizes leads the same way", () => {
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
    isLead: true,
    leadCategory: "none",
    leadType: "No website",
    confidence: 96,
    reasons: ["Google lists no website"],
  }, { location: "Arlington, TX", category: "tree service" });

  assert.equal(lead.source, "openscout");
  assert.equal(lead.city, "Arlington");
  assert.equal(lead.region, "TX");
  assert.equal(lead.postal_code, "76010");
  assert.equal(lead.has_website, false);
  assert.equal(lead.lead_score, 96);
  assert.equal(duplicateKey(lead), "source:google-place-123");
  assert.deepEqual(splitAddress("1400 Oak Street, Arlington, TX 76010, USA"), {
    city: "Arlington",
    region: "TX",
    postalCode: "76010",
    country: "USA",
  });
});
