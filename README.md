# Operations Workflow

A focused sales and fulfillment operating system for finding local-business leads, building website demos, managing outreach, and converting approved demos into finished client sites.

## Stack

- Plain HTML, CSS, and JavaScript — no framework, no build step
- A small Cloudflare Worker that serves the static files and owns the password gate
- Supabase for Postgres, Realtime, and Storage

## Signing in

There is one user, so there is one password. It lives as a Cloudflare Worker
secret — there is no signup, no email confirmation, and no OAuth.

```sh
npx wrangler secret put DASHBOARD_PASSWORD
```

The Worker verifies the password, sets a signed `HttpOnly` cookie, and hands the
browser a real Supabase session so row level security keeps protecting the data.
Changing `DASHBOARD_PASSWORD` immediately invalidates every session that is
already signed in.

### Connecting live Supabase data

The dashboard reads and writes as one Supabase account. Give the Worker that
account's credentials so it can mint sessions for you:

```sh
npx wrangler secret put SUPABASE_OWNER_EMAIL
npx wrangler secret put SUPABASE_OWNER_PASSWORD
```

Without those two secrets the password still works, and the dashboard opens on
local sample data with a notice saying so. Nothing is written to Supabase in that
mode.

The publishable Supabase key in `js/config.js` is safe to expose. Never put a
secret key or the service-role key in the browser.

## Deploying

```sh
npx wrangler deploy
```

Set the three secrets once; they persist across deploys.

## Local development

```sh
cp .dev.vars.example .dev.vars   # fill in DASHBOARD_PASSWORD
npx wrangler dev
```

`wrangler dev` serves the assets and the `/api/*` routes together, which is the
only way to exercise sign-in locally. `.dev.vars` is git-ignored.

## Worker API

| Route | Purpose |
| --- | --- |
| `GET /api/session` | Is this browser unlocked? Is Supabase configured? |
| `POST /api/login` | Check the password, set the cookie, return Supabase tokens |
| `POST /api/supabase-session` | Fresh Supabase tokens for an already-unlocked browser |
| `POST /api/logout` | Clear the cookie |

## Database

The schema lives in `supabase/migrations/`. After signing in, use **Load starter
workspace** from the Command Center empty state if you want editable starter
records in your own account.

## Interface

- Pitch-black background, orange accent, white text
- Colour is only used to carry meaning: green is good, red is bad, yellow is
  pending, blue is neutral
- The sidebar is the only navigation surface. On phones it becomes a drawer
  behind the top-left button; there is no bottom tab bar

## External integrations

OpenScout, Gmail, Whop, model providers, and the custom MCP are intentionally
represented as disconnected adapters in Settings. The frontend data model is
ready for them, but no external API calls are implemented yet.
