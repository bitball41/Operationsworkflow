# Operations

A personal operations system for a website-selling business: find local
businesses without websites, build them a real demo site, send one email, and
follow the work through to a paid client — with automation doing the repetitive
part.

It is one person's control centre, not a SaaS product. Plain HTML, CSS and
JavaScript, with no browser framework or frontend build step.

## Running it

```bash
npx wrangler dev     # dashboard + the /api worker that holds the keys
# open http://localhost:8787
```

`python3 -m http.server 4173` still serves the dashboard, but without the worker
there is no `/api`, so every key-backed feature reports itself as not connected.

Cloudflare Access is the only sign-in boundary. The application has no accounts,
password form, sign-up flow, or browser-side Supabase session. After Access
admits the request, the Worker opens the one configured Operations workspace.
There is no sample data anywhere in the application, so every lead, email,
number and statistic on screen comes from the database.
The realistic workspace used to exercise the pages lives in
`tests/fixtures/sample-workspace.js` and is reachable only from the tests.

```bash
npm test   # OpenScout engine + application, Worker and security tests
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
    data.js          account-free workspace client
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

## Security and data

`operations.conno.fun` is private behind Cloudflare Access. The Worker verifies
the Access JWT signature, issuer, audience and expiry before it serves either
the dashboard or a credential-backed API route. Merely sending an Access header
is not enough.

The browser talks only to same-origin `/api/workspace` routes. Supabase remains
the database and private-asset store, but its secret key is held by the Worker
and never reaches browser code. The deployment is configured with one neutral
`OPERATIONS_WORKSPACE_ID`; it is not a user account.

A failed Worker or database connection shows a retry gate, never an email and
password form. Operational records are not cached, queued, or recovered from
browser storage. Legacy workspace keys and obsolete Supabase auth tokens are
erased without being imported.

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
the Operations workspace connects a Microsoft mailbox from Integrations.
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
    `get_status`, `get_follow_ups`, `get_integrations`,
    `record_payment`, `record_expense`
  - *Workspace* — `create_task`, `complete_task`, `create_note`,
    `create_calendar_event`, `get_activity`
  - *Automation* — `start_automation`, `stop_automation`, `run_one_lead`

  `toolSchema()` emits them in the shape a model API expects, so the same
  registry can back an MCP server later.
- **Permission modes** — access is selected from the assistant toolbar or
  Settings and saved with the user's workspace preferences:
  - *View only* exposes read tools.
  - *Work in workspace* (the default) also allows record changes, while blocking
    anything that leaves the app.
  - *Full control* enables connected external tools such as research, email,
    publishing and automation.

  The model only receives the schema for its current mode, and `runTool()`
  enforces the same boundary again before execution. Changing the selector
  applies to the next message. Direct commands remain explicit user actions.
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

Conversation history is provider-neutral and persistent. Each conversation is
saved in the workspace-scoped `assistant_conversations` table,
can be selected after a reload, and can be deleted from the assistant toolbar.
Large tool payloads are trimmed before they enter the transcript.

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

The repo catalogue remains the fallback, but Templates now accepts a portable
`index.html`, optional `style.css` and `script.js`, plus original PNG, JPEG,
WebP, GIF, AVIF or SVG assets. Images are uploaded through the Worker as their
original bytes to a private Supabase Storage bucket — no base64 conversion and
no recompression.
Reference them as `assets/filename.png`; previewing resolves short-lived signed
URLs and publishing copies the originals into the hosted bundle. Custom
templates can be deleted when no demo still depends on them. Unsafe filename
characters are normalized together with matching paths in the uploaded source.

A demo is a real bundle — `index.html`, `style.css`, `script.js` — stored on the
demo record. Website Studio previews that exact bundle in a sandboxed frame,
lets you edit the files directly, and offers a Site details drawer for the
handful of fields that usually need changing. The AI panel has the full editing
flow (request → proposed change → diff → apply/revert); the request step waits
for a provider.

Publishing is backed by the Worker's `DEMO_SITES` R2 binding. Each publish
uploads a versioned bundle and then atomically swaps `current.json`, so visitors
never receive half of a deployment. The public URL is
`https://demos.conno.fun/<client-number>/`; the Worker verifies that the demo
belongs to the configured Operations workspace before accepting an upload.

One-time Cloudflare setup:

```bash
# First enable R2 for the account in the Cloudflare dashboard.
npx wrangler r2 bucket create operationsworkflow-demos
npx wrangler deploy
```

Then attach `demos.conno.fun` as a Custom Domain for this Worker. The dashboard
and demo host can point to the same Worker; host-aware routing keeps
`demos.conno.fun/41/` public while the application and authenticated publisher
stay on the operations host.

## Lead discovery

OpenScout's engine is used unmodified in `services/openscout/` — search,
classification, chain exclusion, confidence scoring, duplicate merging and live
verification. `adapter.js` is the only boundary; it converts a place into the
normalised lead schema and keeps the source evidence.

The page asks for three things: niche, location, how many. Radius, depth,
minimum confidence, minimum rating, verification, phone requirement and
deduplication live under **Advanced**. The current business rule is mandatory:
every surfaced candidate has no Google-listed website, no identity-matched
official website found by the independent web check, and a publicly linked email
address. Businesses without a verified public email never enter the review queue.

Google Places does not expose business email addresses and can omit a website
that exists. After OpenScout finds candidates with a blank website field, the
Browser Run binding searches public results and opens likely first-party pages.
A page only disqualifies the candidate when its phone matches, or its business
name and locality/address both match. Social profiles, directories, booking and
ordering pages, marketplaces, link-in-bio pages and parked domains do not count;
identity-matched hosted builders do. Inconclusive checks stay reviewable with a
warning. The same request then finds an address shown beside matching business
identity evidence and stores both checks with the candidate.

Lead discovery needs a Google Maps browser key with Places enabled. Set
`GOOGLE_MAPS_API_KEY` on the worker and every browser gets it; otherwise paste
it must be configured on the Cloudflare Worker; the browser does not retain it.

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
| Whop | `https://hooks.conno.fun/whop` → signed Worker webhook → Supabase receipt RPC | Worker secrets |
| Outlook (send) | `services/email/outreach.js` → `sendEmail` | worker OAuth + Graph |
| Outlook (inbox) | `services/email/inbox.js` → `syncInbox` | worker OAuth + Graph |
| Cloudflare hosting | `services/sites/publish.js` → R2 versioned bundles | R2 binding |
| Research tool | `services/research/research.js` → Browser Run markdown | Browser binding |
| MCP | `/mcp` → status + browser research tools | worker bearer token |

## API keys

Every key lives in the Cloudflare Worker (`worker/index.js`) as a secret. The
browser never receives one; it calls `/api/...` on the same origin and the worker
adds the credential on the way out.

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put WHOP_WEBHOOK_SECRET
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put GOOGLE_MAPS_API_KEY
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET
npx wrangler secret put OUTLOOK_TOKEN_ENCRYPTION_KEY
npx wrangler secret put MCP_API_TOKEN
```

`wrangler.jsonc` pins the non-secret workspace UUID, Cloudflare Access team
domain, and application audience. It also disables `workers.dev` and preview
URLs so the dashboard is not accidentally published on an unprotected hostname.
Production requests fail closed if Access verification is missing or invalid.
`ALLOW_LOCAL_DEVELOPMENT=true` bypasses Access only on `localhost`,
`127.0.0.1`, or `::1`.

Set `MICROSOFT_TENANT=common` in `.dev.vars` locally or as a non-secret Worker
variable. The Entra app must register the exact production callback
`https://operations.conno.fun/api/outlook/callback`, and needs delegated
`Mail.Send` **and** `Mail.Read` — without the second one the mailbox is
write-only and the Inbox stays empty forever.

`OUTLOOK_TOKENS` is a Workers KV binding declared in `wrangler.jsonc`; it holds
one-time OAuth state and AES-GCM-encrypted tokens for the Operations workspace.
This repository is already bound to the existing
`operationsworkflow-outlook-tokens` namespace so unattended Git builds do not
need a provisioning prompt. A deployment to another Cloudflare account must
create its own namespace and replace the configured id:

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
| `GET /api/workspace` | atomic Operations workspace snapshot |
| `POST/PATCH/DELETE /api/workspace/records/...` | workspace-scoped database changes |
| `/api/workspace/assets...` | private storage upload, signing, download and delete |
| `GET /api/status` | which providers have a key |
| `POST /api/outlook/connect` | begin Microsoft OAuth for the workspace |
| `GET /api/outlook/callback` | validate OAuth state and store encrypted tokens |
| `POST /api/outlook/send` | send one message through Microsoft Graph |
| `POST /api/outlook/reply` | reply inside an existing Outlook conversation |
| `GET /api/outlook/messages` | recent inbox messages, newest first |
| `POST /api/outlook/disconnect` | remove the workspace's Outlook tokens |
| `GET /api/maps/key` | the Google Maps browser key |
| `POST /api/maps/places/search-text` | Places API (New) |
| `POST /api/browser/research` | authenticated public-page research through Browser Run |
| `POST /api/browser/contact-email` | evidence-matched public business email lookup |
| `POST /api/browser/business-presence` | independent official-website check plus evidence-matched public email lookup |
| `POST /api/demos/publish` | authenticated multipart demo bundle upload to R2 |
| `POST /api/ai/anthropic/messages` | Anthropic Messages API |
| `POST /api/ai/openai/responses` | OpenAI Responses API |
| `POST https://hooks.conno.fun/whop` | signed Whop webhook receiver only |
| `POST /mcp` | JSON-RPC MCP foundation (`operations_api_status`, `browser_research`) |

Every route refuses cross-origin requests, never echoes a key back, and returns
503 with the exact secret name to set when one is missing. Worker source,
migrations, tests and `.dev.vars` are excluded from the static assets in
`.assetsignore`, so none of them are reachable over HTTP.

## Supabase

Migrations are in `supabase/migrations/` and are applied to the connected
project. Apply `20260728221132_cloudflare_access_only_workspace.sql` before
deploying this code. It creates `operations_workspaces`, preserves the existing
workspace UUID and records, moves public foreign keys away from `auth.users`,
removes browser grants and authenticated policies, and adds the atomic snapshot
RPC used by the Worker.

Supabase Auth is not used by the application. There is no publishable key in
the browser and no direct Data API or Storage call from browser code. RLS stays
enabled as defense in depth, while direct `anon` and `authenticated` grants are
revoked. The Worker uses `SUPABASE_SECRET_KEY`; the legacy
`SUPABASE_SERVICE_ROLE_KEY` name is accepted only as a deployment transition.

Safe activation order:

1. Keep the existing `SUPABASE_SERVICE_ROLE_KEY` in place for the transition,
   or set the newer `SUPABASE_SECRET_KEY`.
2. Deploy this Worker. Its temporary snapshot fallback supports the current
   pre-migration schema.
3. Apply `20260728221132_cloudflare_access_only_workspace.sql`.
4. Verify workspace reads, one write, one private asset, and Outlook status.
5. Remove dormant Supabase Auth users after that verification.

The Whop receipt table is RLS-protected, has no browser grants, and can only be
written through the service-role webhook RPC. The payments unique index keeps a
Whop transaction id idempotent per workspace.

After the migration and Worker deployment have been verified, old Supabase Auth
users can be removed as separate cleanup. They are no longer referenced or
required by Operations, but the migration deliberately does not delete them.

## Known limits

- R2 must be enabled, the bucket created and the `demos.conno.fun` Custom Domain
  attached before public demo publishing can succeed.
- Browser Run currently extracts public pages into markdown for the assistant;
  it is a narrow research browser, not an unrestricted interactive browser.
- The MCP endpoint is a deployable two-tool foundation protected by
  `MCP_API_TOKEN`. A public third-party MCP release still needs OAuth 2.1 and the
  rest of the application tool registry exposed intentionally.
- Whop automatic updates start after its dashboard webhook is created with API
  version `v1` and the generated signing secret plus the Supabase service-role
  key are saved as Worker secrets. There is intentionally no manual or polling
  reconciliation path.
- Outlook connections made before `Mail.Read` was requested can send but not
  read. Disconnect and reconnect from Integrations to re-consent.
- Live discovery needs a Google Maps key, Places quota, and the Browser Run binding; independently screened discovery may return fewer leads than requested when official sites are found or public addresses are unavailable.
- Website verification only runs direct probes on local previews; hosted builds
  keep a narrow CSP.
