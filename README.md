# Operations

A personal operations system for a website-selling business: find local
businesses without websites, build them a real demo site, send one email, and
follow the work through to a paid client — with automation doing the repetitive
part.

It is one person's control centre, not a SaaS product. Plain HTML, CSS and
JavaScript, no framework, no build step, no dependencies at runtime.

## Running it

```bash
npx wrangler dev     # dashboard + the /api worker that holds the keys
# open http://localhost:8787
```

`python3 -m http.server 4173` still serves the dashboard, but without the worker
there is no `/api`, so every key-backed feature reports itself as not connected.

The dashboard opens straight into the workspace. There is no sign-in wall, and
it is empty until you put something in it — there is no sample data anywhere in
the application, so every lead, email, number and statistic on screen is real.
The realistic workspace used to exercise the pages lives in
`tests/fixtures/sample-workspace.js` and is reachable only from the tests.

```bash
npm test   # 49 OpenScout engine tests + 111 application tests
```

## How it is put together

```text
index.html
worker/          the Cloudflare Worker: every API key lives here, only here
styles/          tokens, base primitives, layout shell, feature surfaces
js/
  app.js         boot, routing, render loop
  actions.js     one delegated handler for clicks, submits and changes
  config.js      navigation, pipeline stages, outreach copy, defaults
  core/          state, router, utils, icons
  components/    ui primitives, shell, modal forms, command palette
  pages/         one module per area, each returning an HTML string
  services/
    api.js           client for the worker's /api routes
    data.js          storage (Supabase when signed in, local otherwise)
    operations.js    every business action, exactly once
    integrations.js  "is this service actually connected?"
    automation/      the batch engine
    ai/              provider boundary, context adapter, tool registry, commands
    sites/           template layouts, bundle builder, publish boundary
    email/           outreach copy and the send boundary
    research/        business research boundary
    openscout/       the unmodified discovery engine + one adapter
  data/            template catalogue, model catalogue
```

Pages render strings, `actions.js` mutates through `services/operations.js`, and
state changes trigger a coalesced re-render. That is the whole architecture.

## Data: local first, cloud when you want it

`services/data.js` has two backends behind one CRUD API:

- **Local** (default) — everything persists to `localStorage`. Works offline and
  starts instantly. A new workspace is empty and nothing in the application can
  seed it. A browser still holding records from the old starter workspace has
  them swept out on load, so invented emails and revenue cannot reappear.
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

**Outlook sends through Microsoft Graph.** The send step remains blocked until
the signed-in Supabase user connects a Microsoft mailbox from Integrations.
Nothing is marked as sent unless Graph accepts the request.

## AI Assistant

A full-page workspace at `#/assistant`. Three parts already work:

- **Context adapter** (`services/ai/context.js`) — turns the whole workspace
  into a structured snapshot: current route and selection, automation state,
  today's numbers, what needs attention, money, pipeline, and slim projections
  of every collection.
- **Tool registry** (`services/ai/tools.js`) — validated operations covering
  every stage of the workflow, not just reading it:
  - *Discovery* — `discover_leads` (a real Google Places search that adds
    leads), `save_discovered_leads`
  - *Leads* — `get_next_lead`, `search_leads`, `get_lead`, `create_lead`,
    `update_lead`, `research_business`, `update_pipeline`
  - *Websites* — `list_templates`, `choose_template`, `create_demo`,
    `update_demo`, `publish_demo`
  - *Outreach* — `draft_email`, `send_draft`, `send_email` (any address, lead
    or not), `reply_to_thread`, `sync_inbox`, `create_followup`, `get_inbox`,
    `classify_reply`
  - *Business* — `get_clients`, `get_payments`, `get_revenue`, `get_tasks`,
    `get_status`, `get_follow_ups`, `get_integrations`, `sync_whop_payments`,
    `record_payment`, `record_expense`
  - *Workspace* — `create_task`, `complete_task`, `create_note`,
    `create_calendar_event`, `get_activity`
  - *Automation* — `start_automation`, `stop_automation`, `run_one_lead`

  `toolSchema()` emits them in the shape a model API expects, so the same
  registry can back an MCP server later.
- **Commands** (`services/ai/commands.js`) — `go`, `go 12`, `stop`, `status`,
  `next`, `revenue`, `inbox` run real operations with no model involved.

`runAgentLoop` (`services/ai/agent.js`) drives the actual conversation: it calls
the model, runs whatever tools come back through the same registry the commands
use, feeds the results back as `tool_result` blocks, and repeats until the model
answers or the step budget (8) runs out. The workspace snapshot is rebuilt on
every step, so a tool that just created a lead is visible to the next one.

Results are trimmed before they are returned to the model
(`serializeToolResult`): the summary always survives, and oversized payloads —
a lead's raw OpenScout blob, a demo's whole file bundle — are reported as
truncated rather than silently eating the context window.

With no key on the worker, anything that is not a known command is not answered
— the assistant says so instead of inventing a reply.

## Choosing a model

Model and effort are picked in Settings and on the assistant's own toolbar, and
both take effect immediately — the reason to switch is usually that the current
choice is costing too much right now.

| Model | Per million tokens | Use it for |
| --- | --- | --- |
| Haiku 4.5 | $1 / $5 | Lookups, classification, short answers |
| Sonnet 5 | $3 / $15 | The default — near-Opus on agentic work at a third of the price |
| Opus 5 | $5 / $25 | Hardest reasoning and long multi-step work |
| Opus 4.8 | $5 / $25 | Fallback if Opus 5 refuses a request |

**Effort is the larger lever.** It controls how much the model thinks, and moving
from `high` to `medium` often saves more than dropping a model tier. The default
here is `medium`, deliberately below the provider's own default, because this
dashboard mostly asks short operational questions. Haiku has no effort control,
so none is sent to it.

`js/data/models.js` is the single source of truth, imported by both the browser
and the worker — the worker rejects any model id that is not in it, so a typo
cannot quietly bill against something expensive.

Every turn writes its real token counts and cost to `ai_usage`, which is what
Settings, Costs and Analytics read. OpenAI models are selectable but unpriced
here; their spend shows as tokens rather than as a dollar figure that might be
wrong.

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

Lead discovery needs a Google Maps browser key with Places enabled. Set
`GOOGLE_MAPS_API_KEY` on the worker and every browser gets it; otherwise paste
one on the Lead Discovery page and it stays in that browser's `localStorage`.

A Maps JavaScript key cannot be kept secret — the SDK runs in the page, so the
key is visible in network traffic wherever it is stored. Restrict it by HTTP
referrer in Google Cloud and enable only Maps JavaScript API and Places API.

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

| Service | Boundary | Key |
| --- | --- | --- |
| Model provider | `services/ai/provider.js` → `runAssistantTurn` | worker |
| Google Maps | `services/openscout/adapter.js` → `resolveMapsKey` | worker |
| Whop | `services/payments/whop.js` → `syncWhopPayments` | worker |
| Outlook (send) | `services/email/outreach.js` → `sendEmail` | worker OAuth + Graph |
| Outlook (inbox) | `services/email/inbox.js` → `syncInbox` | worker OAuth + Graph |
| Cloudflare hosting | `services/sites/publish.js` → `publishBundle` | not wired |
| Research tool | `services/research/research.js` → `researchBusiness` | not wired |
| MCP | `services/ai/tools.js` → `toolSchema` | not wired |

## API keys

Every key lives in the Cloudflare Worker (`worker/index.js`) as a secret. The
browser never receives one; it calls `/api/...` on the same origin and the worker
adds the credential on the way out.

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put WHOP_API_KEY
npx wrangler secret put GOOGLE_MAPS_API_KEY
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET
npx wrangler secret put OUTLOOK_TOKEN_ENCRYPTION_KEY
```

Set `MICROSOFT_TENANT=common` in `.dev.vars` locally or as a non-secret Worker
variable. The Entra app must register the exact production callback
`https://operations.conno.fun/api/outlook/callback`, and needs delegated
`Mail.Send` **and** `Mail.Read` — without the second one the mailbox is
write-only and the Inbox stays empty forever.

`OUTLOOK_TOKENS` is a Workers KV binding declared in `wrangler.jsonc`; it holds
one-time OAuth state and AES-GCM-encrypted tokens keyed by the verified Supabase
user id. **It must resolve to a real namespace.** Wrangler can provision one
during an interactive deploy, but a CI or dashboard build has nobody to answer
the prompt, so create it once and paste the id into `wrangler.jsonc`:

```bash
npx wrangler kv namespace create OUTLOOK_TOKENS
```

Until it exists, every Outlook route answers 503 and names `OUTLOOK_TOKENS` in
the missing list — which Integrations shows on screen.

Locally, copy `.dev.vars.example` to `.dev.vars` (git-ignored) and fill in what
you have. `GET /api/status` reports which keys exist — never their values — and
Integrations reads it, so a service shows as connected only when the worker can
actually reach it.

| Route | Upstream |
| --- | --- |
| `GET /api/status` | which providers have a key |
| `POST /api/outlook/connect` | begin Microsoft OAuth for the signed-in user |
| `GET /api/outlook/callback` | validate OAuth state and store encrypted tokens |
| `POST /api/outlook/send` | send one message through Microsoft Graph |
| `POST /api/outlook/reply` | reply inside an existing Outlook conversation |
| `GET /api/outlook/messages` | recent inbox messages, newest first |
| `POST /api/outlook/disconnect` | remove the signed-in user's Outlook tokens |
| `GET /api/maps/key` | the Google Maps browser key |
| `POST /api/maps/places/search-text` | Places API (New) |
| `POST /api/ai/anthropic/messages` | Anthropic Messages API |
| `POST /api/ai/openai/responses` | OpenAI Responses API |
| `GET /api/whop/*` | Whop v5, read-only, allow-listed paths |

Every route refuses cross-origin requests, never echoes a key back, and returns
503 with the exact secret name to set when one is missing. Worker source,
migrations, tests and `.dev.vars` are excluded from the static assets in
`.assetsignore`, so none of them are reachable over HTTP.

## Supabase

Migrations are in `supabase/migrations/` and are applied to the connected
project. Browser-facing tables are owner-scoped with row-level security, and the
browser only ever uses the publishable key.

Signing in is optional and never blocks the dashboard, but two things depend on
it: cloud sync, and Outlook — a mailbox connection is stored against the
verified Supabase user id, so there is nowhere to put one until you are signed
in. The form is on Settings, and Integrations links to it when Outlook is
waiting on it.

Work done before signing in stays in this browser. **Settings → Data → Upload to
Supabase** copies it up: records are inserted parents-first and their foreign
keys are rewritten to the ids the database assigns, so leads keep their demos,
demos keep their drafts, and local storage is left untouched either way.

A table that cannot be read no longer takes the whole workspace down with it.
The rest still opens and the connection banner names what failed.

## Known limits

- Hosting and research are boundaries, not features yet: `publishBundle`
  records a demo as ready and never claims it is served on a public domain.
- Outlook connections made before `Mail.Read` was requested can send but not
  read. Disconnect and reconnect from Integrations to re-consent.
- Live discovery needs a Google Maps key and available Places quota.
- Preview links point at this app's own origin until a real preview domain is
  set in Settings, and nothing is hosted until Cloudflare Pages is wired up.
- Local storage is capped by the browser; a warning appears if a write fails.
- Website verification only runs direct probes on local previews; hosted builds
  keep a narrow CSP.
