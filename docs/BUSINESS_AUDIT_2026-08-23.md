# Conno business-system audit

Snapshot: August 23, 2026
Scope: `bitball41/Operationsworkflow`, `bitball41/Conno.fun`, live Operations, live Supabase, Cloudflare Workers, Whop ingress, and the Notion agency workspace.

## Executive verdict

The technical foundation is stronger than the product currently looks. The database boundary, Cloudflare Access model, signed webhooks, server-held provider credentials, and regression coverage are solid. The business itself is **not yet proven live**.

The main failure was truth and focus:

- example clients were mixed into client totals;
- an unlinked ElevenLabs test conversation appeared in both Sales and Clients;
- a $1 unlinked Whop receipt appeared as business revenue;
- Notion and Operations both acted like task systems;
- the public homepage led with a personal portfolio while the paid offer lived one click away;
- the real launch blockers were buried under general dashboard sections.

The redesign now makes the operating truth explicit. Nothing in this report is being presented as deployed unless it was verified in production.

## Live business truth

| Area | Verified state | Meaning |
|---|---:|---|
| Offer | $2,500 activation + $997/month | One focused roofing AI-receptionist package is defined consistently. |
| Leads | 12 total; 11 open, unassigned, and missing a next action | There is a prospect list, but almost no accountable sales execution. |
| Clients | 1 example client; 0 real active clients | The old “1 client” headline was misleading. |
| Voice agents | 2 records: 1 example and 1 real provider agent that is not linked to a client | ElevenLabs is connected, but the provider agent is not deployable as a client system yet. |
| Voice calls | 2 records: 1 example and 1 non-example test call that is not linked to a client | A provider call exists, but it is not end-to-end client proof. |
| Payments | One paid $1 Whop website-sale receipt, linked to neither a client nor project | Real assigned revenue is $0. The receipt needs reconciliation, not celebration. |
| Costs | $1.41 recorded | With $0 assigned revenue, recorded profit is negative. |
| Tasks | 2 Operations tasks, both closed; 18 open Notion tasks | Notion is the real planning system. Operations should not duplicate it. |
| Discovery | 24 runs, 51 results | Discovery works, but it is not the current bottleneck. |
| Auth | Cloudflare Access is the human identity boundary; 2 dormant Supabase Auth users remain | Supabase Auth is legacy state, not the active sign-in model. |

## What changed in this redesign

### Operations

- Renamed the primary “Dashboard” destination to **Today**.
- Reduced primary navigation from 8 destinations to 7 by removing Tasks from the sidebar while retaining its legacy route and data.
- Added a launch-readiness block with six evidence gates:
  - business identity;
  - server-side voice provider and signed webhook;
  - provider agent linked to a real client;
  - dedicated number and forwarding path;
  - live booking calendar;
  - signed end-to-end real-client call.
- Replaced the generic agency snapshot with **Business truth**:
  - real active clients only;
  - linked live agents only;
  - assigned revenue only;
  - explicitly labeled pipeline estimates.
- Excluded example clients from Client totals and lifecycle cards.
- Excluded unlinked and example receptionist calls from Clients.
- Removed receptionist calls from Sales call history entirely. Sales now contains manual sales outcomes only; receptionist transcripts stay in Agents.
- Changed a missing monthly quote from a false `$0` to **Not quoted**.
- Reworked Money so unassigned provider receipts remain visible but do not count as revenue or profit.
- Added a Settings boundary explaining that Operations owns live business records, Notion owns plans/playbooks, and Supabase remains server-only.
- Added tests for unassigned-receipt accounting and call-record isolation.

### Conno.fun

- Repositioned the homepage around one paid outcome: the roofing receptionist that picks up.
- Made the roofing package and live demo the two primary actions.
- Kept the project archive as proof of technical work rather than the main business identity.
- Removed age, relationship, phone-number, backup-email, TikTok, and Spotify details from the business-facing experience.
- Standardized every activation email link on `connor@conno.fun`.
- Added a Home link to the services navigation.
- Replaced the broken personal-number request page with a working business-contact page.
- Removed the unused Resend phone-request endpoint and its obsolete setup guide. This feature had no deployed Worker secret and was already nonfunctional; the removal is recoverable from Git history.

## The operating model

| System | Owns | Must not own |
|---|---|---|
| Operations | Leads, sales outcomes, meetings, clients, voice agents, client calls, assigned payments, costs | General project planning or duplicate launch checklists |
| Notion | Launch plan, priorities, delivery tasks, decisions, playbooks | A second CRM, client ledger, or call database |
| Supabase | Private business records and provider-ingestion state | Browser authentication secrets or a second human account system |
| Conno.fun | Offer, proof, demo path, business contact | Internal status, personal contact collection, or claims not backed by a working call |
| Cloudflare Worker/Access | Identity boundary, API authorization, server-only provider access, public routing | Frontend-held privileged credentials |

The current [Notion agency command center](https://app.notion.com/p/3bca21ada60081ba9640cd1c65e8f145) already states the right sequence: working demo → prospecting → sales demo → payment → onboarding → verified go-live. That sequence should remain the launch plan; Operations should show the evidence produced by it.

## Supabase audit

### Good

- The project is active on PostgreSQL 17.6.
- All 49 public tables have RLS enabled.
- The browser roles have no direct table grants; the Cloudflare Worker is the data boundary.
- Provider secrets are not in the frontend.
- The two public `SECURITY DEFINER` functions use an empty `search_path`, have no public/anon/authenticated execute grant, and enforce the current fixed $350 activation commission.
- The ElevenLabs management function independently authenticates its Worker bridge.
- The ElevenLabs webhook validates the provider HMAC, limits body size, checks age, deduplicates receipts, and quarantines unknown agents.
- The Whop endpoint rejected an unsigned probe with `401 invalid_signature`.

Supabase treats grants and RLS as separate controls; the current no-browser-grants design is intentional, even though the advisor reports informational “RLS enabled, no policy” findings. See [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) and [Database Advisors](https://supabase.com/docs/guides/database/database-advisors).

### Needs attention

- Security advisors report one warning: leaked-password protection is disabled. Because Supabase Auth is not the active identity system, the decision is either to remove the dormant Auth footprint after validation or enable the protection if those users remain. See [Password security](https://supabase.com/docs/guides/auth/password-security).
- Local migration filenames and remote migration versions do not match for several already-applied changes. Do not rename or replay them blindly. Build an explicit equivalence map first.
- There are 48 informational no-policy findings and 54 performance informational findings, mostly unused indexes on a tiny dataset. These are not production emergencies.
- `verify_jwt=false` is acceptable for the two Edge Functions only because their code performs the required custom shared-secret or HMAC verification. That assumption must stay covered by tests.
- The Google Maps key is intentionally browser-delivered for Maps/Places use; its Cloud project should be checked for strict hostname and API restrictions.
- No database migration or destructive data cleanup was applied during this audit.

### Migration equivalence work required

The following local migrations correspond to differently versioned remote entries and need a documented map before the next schema change:

- initial `001_` / `002_` migrations vs remote `202607...` versions;
- `20260801222413_ai_agency_core.sql` vs remote `20260801233156`;
- `20260801233339_agency_fk_indexes.sql` vs remote `20260801233426`;
- `20260803124525_voice_agent_agency_dashboard.sql` vs remote `20260817034517`;
- `20260817032433_elevenlabs_client_os.sql` vs remote `20260817034529`;
- `20260822203000_core_workflow_integrity.sql` vs remote `20260823043956`.

## Highest-priority operating work

1. **Finish the real call proof.** Create or choose a real internal-pilot client record, link `My Agent`, record the dedicated number and routing mode, connect real calendar availability, call from an unrelated phone, and verify the booking plus signed post-call record.
2. **Set the business identity.** The Operations business-name field is blank. Decide the authoritative commercial name and save it before generating customer-facing work.
3. **Turn the lead list into a call queue.** Assign the 11 open leads and give each a concrete next action. Discovery is not the constraint.
4. **Reconcile the $1 Whop receipt.** Link it to the correct business record if legitimate or mark/document it as a test. Do not count it as revenue while unassigned.
5. **Close the Notion P0s.** The launch plan has 18 open tasks and several overdue P0 items. Finish the call flow, calendar, number, prompt, consent behavior, transcript, and end-to-end test before adding platform scope.
6. **Document production migration equivalence.** This is required before the next Supabase migration.
7. **Retire dormant Auth deliberately.** Confirm the two legacy users are unused, then remove or retain them through an explicit migration—not an ad hoc delete.
8. **Finish the deployment boundary.** Operations was automatically published by its Cloudflare Git integration from the pull-request commit and now needs an authenticated hosted-UI recheck. Conno.fun passed its Cloudflare build check but did not create or activate a new Worker version; its production site still needs deployment and hosted-asset verification.

## Verification performed

- Operations: 49 OpenScout tests plus 207 Node tests passed.
- Conno.fun: 7 site tests passed.
- Both dependency audits reported 0 known vulnerabilities.
- Targeted committed-secret scans found no live credential. The only Resend match was the now-removed placeholder setup guide.
- Desktop and 390×844 mobile layouts were visually inspected.
- Live Operations, Clients, Agents, Sales, Money, Settings, Conno.fun, and the services page were inspected before implementation.
- Supabase schema, grants, policies, functions, rows, Edge Functions, logs, advisors, and migration history were read directly.
- Cloudflare deployment history was inspected for both Workers.
- No manual production deployment, payment mutation, provider mutation, or database DDL was performed. Pushing the Operations pull-request branch triggered the repository's existing Cloudflare Git integration, which automatically uploaded and activated that commit.

## Deployment truth

Both redesigns are implemented, tested, pushed on `codex/business-truth-usability`, and open for review.

- **Operations:** Cloudflare's Git integration automatically published the functional redesign commit `40d06fd8` at 21:27 UTC. Worker deployment history confirmed version `db8e862b-894b-436b-aacb-59f2feb627cb` at 100% during inspection. The public route remains behind Cloudflare Access, so the new authenticated UI still needs a post-deployment browser check by an allowed user.
- **Conno.fun:** Cloudflare's pull-request check passed for commit `8b05d5bf`, but Worker version and deployment history still stop at August 17, 2026 at 04:22 UTC. Direct production checks still show the old homepage, old phone-request form, and old contact email. Treat this redesign as **reviewed branch code, not production** until the hosted artifact changes and is rechecked.
