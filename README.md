# Operations

A personal operations system for a website-selling business: find local
businesses without websites, build them a real demo site, send one email, and
follow the work through to a paid client — with automation doing the repetitive
part.

It is one person's control centre, not a SaaS product. Plain HTML, CSS and
JavaScript, no framework, no build step, no dependencies at runtime.

## Running it

```bash
python3 -m http.server 4173
# open http://localhost:4173
```

The dashboard opens straight into the workspace. There is no sign-in wall.

```bash
npm test   # 49 OpenScout engine tests + 68 application tests
```

## How it is put together

```text
index.html
styles/          tokens, base primitives, layout shell, feature surfaces
js/
  app.js         boot, routing, render loop
  actions.js     one delegated handler for clicks, submits and changes
  config.js      navigation, pipeline stages, outreach copy, defaults
  core/          state, router, utils, icons
  components/    ui primitives, shell, modal forms, command palette
  pages/         one module per area, each returning an HTML string
  services/
    data.js          storage (Supabase when signed in, local otherwise)
    operations.js    every business action, exactly once
    integrations.js  "is this service actually connected?"
    automation/      the batch engine
    ai/              provider boundary, context adapter, tool registry, commands
    sites/           template layouts, bundle builder, publish boundary
    email/           outreach copy and the send boundary
    research/        business research boundary
    openscout/       the unmodified discovery engine + one adapter
  data/            template catalogue, starter workspace
```

Pages render strings, `actions.js` mutates through `services/operations.js`, and
state changes trigger a coalesced re-render. That is the whole architecture.

## Data: local first, cloud when you want it

`services/data.js` has two backends behind one CRUD API:

- **Local** (default) — everything persists to `localStorage`. Works offline,
  starts instantly, seeded with a realistic starter workspace on first run.
- **Cloud** — used automatically when a Supabase session exists in the browser.
  Sign in from Settings if you want sync; the Supabase SDK is not even
  downloaded until then.

If the database cannot be read, the app keeps working locally and shows a small
warning in the sidebar. It never replaces the dashboard with a login screen.

## Automation

`services/automation/engine.js` runs a fixed sequence per lead, built from the
deterministic operations layer:

```text
select lead → gather info → research → pick template → build site
→ publish demo → draft email → send → update pipeline → schedule follow-up
```

Research and template selection run in parallel; everything else is ordered
because it depends on the previous step. A lead takes a couple of seconds, not
minutes. The AI is never inside this loop — it only starts and stops it.

Start it from the Automation page, from Home, from the command palette, or by
typing `go` to the assistant. Settings (daily target, price, niche and location
filters, follow-up cadence, pacing) live behind one disclosure with working
defaults.

**Gmail is not connected**, so the send step cannot complete. Automation runs
every other step for real and leaves each email in `ready`. Nothing is ever
marked as sent, and the page says so.

## AI Assistant

A full-page workspace at `#/assistant`. Three parts already work:

- **Context adapter** (`services/ai/context.js`) — turns the whole workspace
  into a structured snapshot: current route and selection, automation state,
  today's numbers, what needs attention, money, pipeline, and slim projections
  of every collection.
- **Tool registry** (`services/ai/tools.js`) — 23 validated operations
  (`get_next_lead`, `search_leads`, `get_lead`, `research_business`,
  `list_templates`, `choose_template`, `create_demo`, `update_demo`,
  `publish_demo`, `draft_email`, `send_email`, `create_followup`,
  `update_pipeline`, `get_inbox`, `classify_reply`, `get_clients`,
  `get_payments`, `get_revenue`, `get_tasks`, `get_status`,
  `start_automation`, `stop_automation`, `run_one_lead`). `toolSchema()` emits
  them in the shape a model API expects, so the same registry can back an MCP
  server later.
- **Commands** (`services/ai/commands.js`) — `go`, `go 12`, `stop`, `status`,
  `next`, `revenue`, `inbox` run real operations with no model involved.

No model provider is connected and no key is in this repository. Anything that
is not a known command is not answered — the assistant says so instead of
inventing a reply. `runAssistantTurn({ messages, context, tools })` is the one
function to fill in.

## Websites

Templates are known-good foundations kept in the repo
(`data/site-templates.js` + `services/sites/layouts.js`), not generated from
scratch per prospect. Automation matches the lead's niche to a template and
injects the business data.

A demo is a real bundle — `index.html`, `style.css`, `script.js` — stored on the
demo record. Website Studio previews that exact bundle in a sandboxed frame,
lets you edit the files directly, and offers a Site details drawer for the
handful of fields that usually need changing. The AI panel has the full editing
flow (request → proposed change → diff → apply/revert); the request step waits
for a provider.

Hosting is not connected, so publishing reserves the preview URL, stores the
bundle and reports `not hosted`. "Open" renders the real site in a browser tab
from the stored files.

## Lead discovery

OpenScout's engine is used unmodified in `services/openscout/` — search,
classification, chain exclusion, confidence scoring, duplicate merging and live
verification. `adapter.js` is the only boundary; it converts a place into the
normalised lead schema and keeps the source evidence.

The page asks for three things: niche, location, how many. Radius, depth,
minimum confidence, minimum rating, verification, phone requirement and
deduplication live under **Advanced** with defaults that match the business
model (no website, has a phone, skip businesses already saved).

Lead discovery needs a Google Maps browser key with Places enabled. It is
stored only in that browser's `localStorage`.

## Outreach

One email, one price, no fluff:

```text
Hey,

I came across {{business}} and noticed you didn't have a website, so I went
ahead and made one for you.

Here's the preview: {{link}}

If you like it, I can customize anything you want, connect your domain, and get
the full site live.

I charge a one-time fee of ${{price}}.
If you don't like it, you don't pay.

Interested?

{{owner}}
```

States are explicit: `draft` → `ready` → `sent`, with `failed` kept separate.
Every sent email can create its follow-up automatically.

## Integration boundaries

Each of these has its UI, records and tool calls in place, and refuses to fake
a result until credentials exist:

| Service | Boundary |
| --- | --- |
| Model provider | `services/ai/provider.js` → `runAssistantTurn` |
| Gmail | `services/email/outreach.js` → `sendEmail` |
| Cloudflare | `services/sites/publish.js` → `publishBundle` |
| Research tool | `services/research/research.js` → `researchBusiness` |
| MCP | `services/ai/tools.js` → `toolSchema` |

## Supabase

Migrations are in `supabase/migrations/` and are applied to the connected
project. Browser-facing tables are owner-scoped with row-level security, and the
browser only ever uses the publishable key.

## Known limits

- Sending, hosting, research and model replies are boundaries, not features yet.
- Live discovery needs a Google Maps key and available Places quota.
- Local storage is capped by the browser; a warning appears if a write fails.
- Website verification only runs direct probes on local previews; hosted builds
  keep a narrow CSP.
