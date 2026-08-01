# AI agency OS migration

## Product direction

Operations Workflow remains the same private, server-backed business OS. Cloudflare Access stays the human sign-in boundary, the Worker remains the only holder of privileged credentials, Supabase remains the system of record, and the plain HTML/CSS/JavaScript architecture stays intact.

The primary operating path becomes:

`lead -> call -> meeting -> proposal -> collected setup payment -> client -> onboarding -> automation project -> deployment -> monitoring -> recurring management`

## Reuse

- Keep OpenScout search, source evidence, deduplication, and geographic coverage. Website presence becomes context, not the default qualification gate.
- Keep the generic workspace CRUD API, atomic Supabase snapshot, activity log, tasks, calendar, notes, notifications, approvals, payments, expenses, and assistant tool boundary.
- Keep the existing pipeline board, responsive table/card system, Cloudflare Access validation, Outlook integration, Whop webhook, and server-side secrets.
- Preserve website studio, template, demo, and R2 publishing code outside the primary navigation until it is either reused for client assets or removed in a later cleanup.

## Phases

### 1. Core agency workflow

- Replace website-sale navigation, terminology, pipeline stages, pricing defaults, dashboard metrics, and primary forms.
- Add team assignment metadata, automation-opportunity fields, call outcomes, meetings, structured onboarding, automation projects, setup/recurring payments, subscriptions, and commissions.
- Make call results and collected setup payments create the related activity, follow-up, meeting, and commission records instead of leaving disconnected pages.

### 2. Automation operations

- Expand Automation Studio into agent configuration, structured knowledge, workflows, reusable tests, deployments, monitoring alerts, and support requests.
- Add Retell, Vapi, n8n, telephony, calendar, CRM, and messaging adapters only when credentials and provider contracts are available.
- Keep manual test and deployment records honest until provider APIs supply real execution and telemetry.

### 3. Permissions and activation

- Map verified Cloudflare Access identity claims to `team_members` and enforce role permissions in Worker routes. Do not reintroduce application passwords or browser-held Supabase sessions.
- Prove owner and salesperson allowed/denied paths before enabling multi-user access.
- Apply migrations and deploy through an isolated Supabase branch or coordinated release. Verify the snapshot, representative writes, RLS/grants, advisors, and provider health before production activation.

## Migration and rollback

Schema changes are additive except for intentional status-value translations. Existing website records and tables are not dropped. New public tables have RLS enabled, browser roles receive no grants, and only the server-side `service_role` can access them. The snapshot RPC remains `security invoker` with an empty search path.

Before the migration is applied, rollback is a normal code revert. After it is applied, rollback should be a forward migration that restores constraints or hides new objects; applied migration files must never be edited or deleted.
