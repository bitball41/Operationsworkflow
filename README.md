# Operations Workflow

A focused sales and fulfillment operating system for finding local-business leads, building website demos, managing outreach, and converting approved demos into finished client sites.

## Stack

- Plain HTML, CSS, and JavaScript
- Supabase Auth, Postgres, Realtime, and Storage
- Static hosting compatible with Cloudflare Pages

No frontend framework or build step is required.

## Local preview

Serve the repository from any static web server and open `index.html`. The login screen includes a preview workspace that uses clearly labeled sample data without writing to Supabase.

## Supabase

The browser client uses the publishable key in `js/config.js`; it is safe to expose. Never place a secret key or service-role key in the browser.

The database migration lives at:

`supabase/migrations/001_operations_schema.sql`

After creating an account, use **Load starter workspace** from the Command Center empty state if you want editable starter records in your own account.

## External integrations

OpenScout, Gmail, Whop, Cloudflare deployment, model providers, and the custom MCP are intentionally represented as disconnected adapters in Settings. The frontend data model is ready for them, but no external API calls are implemented yet.

