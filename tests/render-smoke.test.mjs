import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/* Minimal browser shims: the OpenScout engine is a classic browser module and
   the app reads localStorage for preferences. */
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

const { NAV_GROUPS, ROUTES, FULL_BLEED_ROUTES } = await import("../js/config.js");
const { createSeedData } = await import("./fixtures/sample-workspace.js");
const { getState, setData, setState, setStudio } = await import("../js/core/state.js");
const home = await import("../js/pages/home.js");
const assistant = await import("../js/pages/assistant.js");
const automation = await import("../js/pages/automation.js");
const sales = await import("../js/pages/sales.js");
const outreach = await import("../js/pages/outreach.js");
const studio = await import("../js/pages/studio.js");
const websites = await import("../js/pages/websites.js");
const clients = await import("../js/pages/clients.js");
const business = await import("../js/pages/business.js");
const workspace = await import("../js/pages/workspace.js");
const system = await import("../js/pages/system.js");

setData(createSeedData(), { silent: true });
setState({ route: "home", routeParams: {} }, { silent: true });

const renderers = {
  home: home.renderHome,
  assistant: assistant.renderAssistant,
  automation: automation.renderAutomation,
  discovery: sales.renderDiscovery,
  leads: sales.renderLeads,
  pipeline: sales.renderPipeline,
  outreach: outreach.renderOutreach,
  inbox: outreach.renderInbox,
  "follow-ups": outreach.renderFollowUps,
  studio: studio.renderStudio,
  templates: websites.renderTemplates,
  demos: websites.renderDemos,
  deployments: websites.renderDeployments,
  clients: clients.renderClients,
  projects: clients.renderProjects,
  maintenance: clients.renderMaintenance,
  payments: business.renderPayments,
  analytics: business.renderAnalytics,
  costs: business.renderCosts,
  pricing: business.renderPricing,
  tasks: workspace.renderTasks,
  calendar: workspace.renderCalendar,
  notes: workspace.renderNotes,
  activity: workspace.renderActivity,
  integrations: system.renderIntegrations,
  settings: system.renderSettings,
};

for (const [route, render] of Object.entries(renderers)) {
  test(`${route} renders`, () => {
    setState({ route, routeParams: {} }, { silent: true });
    const html = render();
    assert.equal(typeof html, "string");
    assert.ok(html.length > 200, `${route} produced only ${html.length} characters`);
    assert.doesNotMatch(html, />\s*undefined\s*</i, `${route} rendered an undefined value`);
    assert.doesNotMatch(html, /\[object Object\]/, `${route} rendered an object`);
  });
}

test("every route has a renderer and every renderer has a route", () => {
  assert.deepEqual([...ROUTES].sort(), Object.keys(renderers).sort());
  assert.equal(new Set(ROUTES).size, ROUTES.length);
});

test("navigation includes the AI Assistant and Automation routes", () => {
  const labels = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label));
  assert.ok(labels.includes("AI Assistant"));
  assert.ok(labels.includes("Automation"));
  assert.ok(ROUTES.includes("assistant"));
  assert.ok(ROUTES.includes("automation"));
});

test("assistant and studio own the full viewport", () => {
  assert.deepEqual([...FULL_BLEED_ROUTES], ["assistant", "studio"]);
});

test("the shell has one navigation system and no auth wall", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(!/mobile-dock|dock-item|bottom-dock/i.test(html), "mobile bottom dock must be gone");
  assert.ok(!/auth-screen|auth-form|preview-button|Create owner account/i.test(html), "no auth screen in the shell");
  assert.ok(!/brand-mark/i.test(html), "no stylised brand mark");
  assert.ok(html.includes('id="sidebar"'), "sidebar is the navigation system");
  assert.ok(html.includes('id="page"'), "single page container");
  assert.equal((html.match(/<nav/g) || []).length, 1, "exactly one nav element");
});

test("marketing copy is gone", () => {
  const files = [
    "../index.html",
    "../js/config.js",
    "../js/components/shell.js",
    "../js/pages/home.js",
  ];
  const banned = ["Manual-first", "Owner access", "persistent manual control plane", "Command center", "Business command center"];
  for (const file of files) {
    const content = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const phrase of banned) {
      assert.ok(!content.includes(phrase), `"${phrase}" should not appear in ${file}`);
    }
  }
});

test("home shows attention, automation and today without a metric wall", () => {
  setState({ route: "home", routeParams: {} }, { silent: true });
  const html = renderers.home();
  assert.match(html, /Needs attention/);
  assert.match(html, /Today/);
  assert.match(html, /sent today/);
  /* Home should stay light: no more than a handful of stat blocks. */
  assert.ok((html.match(/class="stat"/g) || []).length <= 8);
});

test("lead discovery leads with three inputs and hides the rest", () => {
  setState({ route: "discovery", routeParams: {} }, { silent: true });
  const html = renderers.discovery();
  assert.match(html, /name="business_type"/);
  assert.match(html, /name="location"/);
  assert.match(html, /name="limit"/);
  assert.match(html, /Find leads/);
  assert.match(html, /<details class="advanced"/);
  const advancedIndex = html.indexOf('<details class="advanced"');
  for (const advancedField of ["radius_km", "min_confidence", "depth", "min_rating"]) {
    assert.ok(html.indexOf(`name="${advancedField}"`) > advancedIndex, `${advancedField} must live under Advanced`);
  }
});

test("lead discovery reports filtered websites and marks uncertain checks", () => {
  const previousDiscovery = structuredClone(getState().discovery);
  try {
    const presence = {
      status: "unknown",
      reason: "A plausible website could not be opened.",
      searched_url: "https://www.bing.com/search?q=uncertain",
    };
    setState({
      route: "discovery",
      routeParams: {},
      discovery: {
        ...previousDiscovery,
        results: [{
          id: "uncertain-result",
          decision: "pending",
          business_name: "Uncertain Electric",
          website_status: "Website check uncertain",
          lead_score: 88,
          normalized_data: {
            business_name: "Uncertain Electric",
            category: "Electrician",
            city: "Austin",
            region: "TX",
            email: "hello@example.com",
            phone: "(512) 555-0199",
            has_website: false,
            website_status: "Website check uncertain",
            source_metadata: { web_presence: presence },
          },
          raw_source_metadata: {
            openscout: { rating: 4.8, ratingCount: 21 },
            web_presence: presence,
          },
        }],
        summary: {
          webPresenceChecked: 7,
          excludedExistingWebsite: 3,
          inconclusiveWebsiteChecks: 1,
        },
      },
    }, { silent: true });

    const html = renderers.discovery();
    assert.match(html, /Web checked 7/);
    assert.match(html, /3 official sites filtered/);
    assert.match(html, /Check uncertain/);
  } finally {
    setState({ discovery: previousDiscovery }, { silent: true });
  }
});

test("studio previews the real bundle in a sandboxed frame", () => {
  setState({ route: "studio", routeParams: {} }, { silent: true });
  const html = renderers.studio();
  assert.match(html, /<iframe/);
  assert.match(html, /srcdoc="/);
  assert.match(html, /sandbox="allow-scripts allow-popups"/);
  /* The preview is the dominant surface, and the AI panel sits beside it. */
  assert.match(html, /class="studio__stage"/);
  assert.match(html, /Edit with AI/);
  assert.match(html, /Site details/);
});

test("studio exposes the real bundle files in the code view", () => {
  setStudio({ view: "code" }, { silent: true });
  const html = renderers.studio();
  for (const file of ["index.html", "style.css", "script.js"]) {
    assert.ok(html.includes(file), `${file} should be editable`);
  }
  assert.match(html, /class="code-editor"/);
  setStudio({ view: "preview" }, { silent: true });
});

test("assistant page exposes conversations, access and tools without faking answers", () => {
  setState({ route: "assistant", routeParams: {} }, { silent: true });
  const html = renderers.assistant();
  assert.match(html, /Operations AI/);
  assert.match(html, /Model offline|Direct commands available/);
  assert.match(html, /Full access|Full control/);
  assert.match(html, /Context/);
  assert.match(html, /get_next_lead|Direct commands/);
  assert.ok(!/I think|Here is what I found/.test(html), "no fabricated assistant reply");
});

test("assistant has a dedicated mobile chat structure", () => {
  const page = readFileSync(new URL("../js/pages/assistant.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/components.css", import.meta.url), "utf8");
  assert.match(page, /class="chat__mobile-head"/);
  assert.match(page, /class="chat__mobile-actions"/);
  assert.match(css, /grid-template-areas:\s*[\s\S]*mobile-head mobile-head/);
  assert.match(css, /grid-area: conversations/);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /max-height: min\(78dvh, 680px\)/);
});

test("assistant response text supports safe Markdown formatting", () => {
  const previousAssistant = structuredClone(getState().assistant);
  try {
    setState({
      assistant: {
        ...previousAssistant,
        messages: [{
          id: "markdown-test",
          role: "assistant",
          text: "## Ready\n- **Build** the demo\n- Send \`one email\`\n\n<img src=x onerror=alert(1)>",
        }],
      },
    }, { silent: true });
    const html = renderers.assistant();
    assert.match(html, /<strong>Build<\/strong>/);
    assert.match(html, /<ul>/);
    assert.match(html, /<code>one email<\/code>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img src=x onerror=/);
  } finally {
    setState({ assistant: previousAssistant }, { silent: true });
  }
});

test("an underfilled discovery stays visibly unfinished and returns to the agent", () => {
  const previousAssistant = structuredClone(getState().assistant);
  try {
    setState({
      assistant: {
        ...previousAssistant,
        messages: [{
          id: "partial-discovery",
          role: "tool",
          tool: "discover_leads",
          result: {
            ok: true,
            complete: false,
            summary: "Saved 2 of 5 requested leads from 48 businesses scanned.",
          },
        }],
      },
    }, { silent: true });
    const html = renderers.assistant();
    assert.match(html, /Short of target/);
    assert.doesNotMatch(html, />Completed</);

    const actions = readFileSync(new URL("../js/actions.js", import.meta.url), "utf8");
    assert.match(actions, /result\.complete === false && providerReady\(\)/);
    assert.match(actions, /transcript: commandMessages/);
  } finally {
    setState({ assistant: previousAssistant }, { silent: true });
  }
});

test("settings exposes all three AI permission modes", () => {
  setState({ route: "settings", routeParams: {} }, { silent: true });
  const html = renderers.settings();
  assert.match(html, /AI access/);
  assert.match(html, /View only/);
  assert.match(html, /Work in workspace/);
  assert.match(html, /Full control/);
  assert.match(html, /ai_permission_mode/);
});

test("integrations renders every capability from a reachable Worker", () => {
  const previousServices = structuredClone(getState().services);
  try {
    setState({
      services: {
        ...previousServices,
        reachable: true,
        providers: {
          outlook: true,
          anthropic: true,
          openai: true,
          whop: true,
          google_maps: true,
          cloudflare: true,
          research: true,
          mcp: false,
        },
        outlook: { configured: true, connected: true, can_read_mail: true, account: "owner@example.com" },
      },
    }, { silent: true });
    const html = renderers.integrations();
    for (const label of ["Cloudflare", "Browser research", "MCP tool server"]) {
      assert.match(html, new RegExp(label), `${label} needs an integration card`);
    }
  } finally {
    setState({ services: previousServices }, { silent: true });
  }
});

test("automation page stays operational, not a settings dashboard", () => {
  setState({ route: "automation", routeParams: {} }, { silent: true });
  const html = renderers.automation();
  assert.match(html, /Start|Stop/);
  assert.match(html, /Processed/);
  assert.match(html, /Sent today/);
  assert.match(html, /Failed/);
  assert.match(html, /Recent events/);
  assert.match(html, /<details class="advanced"/);
});

test("seed workspace fills every collection the pages read", () => {
  const { data } = getState();
  for (const key of [
    "leads", "discoveryRuns", "discoveryResults", "templates", "demos", "drafts",
    "emailThreads", "emails", "followUps", "clients", "projects", "payments",
    "expenses", "tasks", "calendarEvents", "notes", "deployments", "activity",
    "maintenanceSubscriptions", "integrations",
  ]) {
    assert.ok(Array.isArray(data[key]), `${key} should be an array`);
    assert.ok(data[key].length > 0, `${key} should have starter records`);
  }
  /* Nothing pretends an AI provider has run. */
  assert.equal(data.aiUsage.length, 0);
  assert.equal(data.approvals.length, 0);
});

test("overlays never stop click propagation", () => {
  /* Every action is handled by one delegated listener on document, so an
     overlay that calls stopPropagation silently disables every button inside
     it. Backdrops must close by checking event.target instead. */
  for (const file of ["../js/components/ui.js", "../js/components/command-palette.js"]) {
    const content = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(!content.includes("stopPropagation"), `${file} must not stop click propagation`);
  }
});
