# Operations Workflow

A desktop-first, mobile-responsive operating system for a website-selling
business. It connects lead discovery, qualification, demo creation, outreach,
follow-ups, client fulfillment, deployments, maintenance, revenue, and costs in
one plain JavaScript application.

## Stack

- Plain HTML, CSS, and modular JavaScript
- Supabase Auth, Postgres, Storage, and Realtime
- OpenScout's real browser-based Google Places discovery engine
- Static hosting compatible with Cloudflare Pages

There is no frontend framework, bundler, or runtime dependency.

## Local preview

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`, then either sign in with Supabase Auth or choose
**Open preview workspace**. Preview mode loads realistic local data and does not
write to Supabase.

Run the verification suite with:

```bash
npm test
```

The suite includes the 49 upstream OpenScout classification, scoring,
deduplication, verification, and location tests, plus render smoke tests for all
24 dashboard routes and the normalization boundary.

## OpenScout integration

The discovery engine was copied from `bitball41/openscout` commit
`6058ef5b0daec85399b523f8c42d23b6d32ef1d5`. Its working implementation remains
in isolated classic browser modules under `js/services/openscout/`:

- `google-places.js` — Google Maps loader, location resolution, tiled Places
  Text Search, adaptive subdivision, result parsing, and progress reporting
- `classify.js` — weak-site detection, chain exclusion, confidence scoring, and
  strongest-presence duplicate merging
- `verify.js` — conservative live-site verification across URL variants
- `location.js` — GPS fusion and multi-provider IP location fallback
- `storage.js` — browser-local Google Maps API key storage

`adapter.js` is the only Operations Workflow boundary. It converts an OpenScout
place to the dashboard's normalized lead schema and preserves the raw source
evidence needed to debug later. The only search-engine behavior change is a
bounded `radiusKm` override (1–80 km); OpenScout's existing search, filtering,
ranking, verification, and deduplication behavior is otherwise preserved.

Lead Discovery requires a Google Maps browser key with the Maps JavaScript API
and Places enabled. Enter the key on the Lead Discovery page. It is stored only
in that browser's `localStorage`; it is never committed or written to Supabase.
Restrict the key to the dashboard's deployed origins and set an appropriate
Google Cloud quota.

OpenScout does not extract email addresses. The dashboard presents this
accurately: phone, listing, location, source evidence, website status, and score
come from OpenScout, while email can be added during qualification or supplied
by a future enrichment service.

## Discovery data flow

```text
OpenScout place
  -> normalizeLead()
  -> lead_discovery_results
  -> operator save/reject/deduplicate
  -> leads
  -> pipeline, demos, outreach, and follow-ups
```

Each run stores the query, engine version, counts, progress summary, errors, and
timestamps. Each candidate stores normalized data, raw source metadata,
website evidence, score, decision, duplicate match, and decision reason.

## Supabase

The checked-in migrations are in `supabase/migrations/` and have been applied to
the connected project.

Core records:

- `profiles`, `leads`, `lead_discovery_runs`, `lead_discovery_results`
- `site_templates`, `demos`, `demo_versions`, `message_drafts`
- `email_threads`, `emails`, `follow_ups`
- `clients`, `client_sites`, `projects`, `project_tasks`
- `maintenance_subscriptions`, `maintenance_requests`
- `payments`, `expenses`, `ai_usage`, `pricing_experiments`
- `agent_runs`, `agent_events`, `approvals`, `notifications`, `activity_log`
- `tasks`, `calendar_events`, `notes`, `deployments`, `settings`
- `integration_connections`

All browser-facing business tables are owner-scoped and protected by row-level
security. The `demo-assets` bucket is private and uses owner-folder storage
policies. Realtime is enabled for approvals, notifications, orchestrator runs,
activity, inbox threads, and tasks. Relationship and list-view indexes support
the dashboard's common access paths.

The browser client uses only the modern Supabase publishable key. Never put a
secret or service-role key in frontend code.

## Functional now

- Supabase email/password auth, persistent sessions, protected workspace,
  profile, logout, and no-write preview mode
- Full sidebar/topbar shell, mobile drawer/dock, command search, orchestrator,
  approval, and notification panels
- Real OpenScout discovery with saved runs/results, filtering, scoring,
  multi-select, bulk save/reject, and lead deduplication
- Lead CRUD/detail views, table filters, CSV export, and persisted Kanban moves
- Demo/template records, Website Studio content/theme controls, private version
  uploads, and demo-to-client conversion
- Outreach and follow-up draft preparation with approval records
- Inbox threading and classifications for persisted records
- Clients, projects, project progression, maintenance plans/requests, payments,
  expenses, pricing experiments, tasks, calendar events, and notes
- Business metrics, funnel, revenue/cost charts, and activity history derived
  from stored records
- Realistic opt-in starter data for authenticated empty workspaces

## Deliberate placeholders

The interfaces and data boundaries exist, but these services make no external
calls yet:

- Gmail and Google Pub/Sub transport
- Whop payments and webhooks
- Cloudflare production deployment actions
- OpenAI and Anthropic model calls
- Custom MCP server

Send, schedule, deploy, rollback, and model-assisted controls are clearly
labelled and either create an approval/intention record or show a placeholder
notice. They do not pretend an external action occurred.

## Architecture

Pages read and mutate a shared client state through `js/services/data.js`.
That service owns the current Supabase persistence contract. OpenScout stays
behind its adapter so no other feature depends on its internal object shape.

The intended next backend boundary is:

```text
Dashboard / Orchestrator / future MCP
                -> Operations API
                -> OpenScout, Supabase, Gmail, Whop, Cloudflare, model providers
```

This keeps approvals, permissions, idempotency, audit logging, and future
external actions in one business-logic layer instead of duplicating them across
the dashboard and MCP.

## Known limitations

- A Google Maps browser key and available Places quota are required for live
  discovery.
- Google Places Text Search returns at most 20 results per tile. OpenScout
  mitigates this with adaptive subdivision, but coverage is still bounded by
  scan depth and tile budget.
- Browser/network privacy controls can make site verification inconclusive.
  OpenScout keeps ambiguous checks as `unknown` instead of falsely marking a
  live website as dead.
- The Supabase project advisor still recommends enabling leaked-password
  protection in Auth settings. Empty-table index usage notices are expected
  until production data and queries accumulate.
