-- Operations foundations: persistent assistant history, custom templates,
-- stable public demo numbers, and complete single-user Realtime coverage.
--
-- This migration is additive. Rolling the application back is safe because
-- old code ignores the new table and columns. A later forward migration can
-- remove them after data has been exported if the feature is retired.

begin;

alter table public.site_templates
  add column if not exists source_kind text not null default 'catalog',
  add column if not exists files jsonb not null default '{}'::jsonb,
  add column if not exists asset_manifest jsonb not null default '[]'::jsonb;

-- The outreach ready/failed migration replaced this index with the same
-- columns under a clearer name. Keeping both only doubles write overhead.
drop index if exists public.drafts_user_status_idx;

alter table public.site_templates
  drop constraint if exists site_templates_source_kind_check;
alter table public.site_templates
  add constraint site_templates_source_kind_check
  check (source_kind in ('catalog', 'custom'));

alter table public.site_templates
  drop constraint if exists site_templates_files_object_check;
alter table public.site_templates
  add constraint site_templates_files_object_check
  check (jsonb_typeof(files) = 'object');

alter table public.site_templates
  drop constraint if exists site_templates_asset_manifest_array_check;
alter table public.site_templates
  add constraint site_templates_asset_manifest_array_check
  check (jsonb_typeof(asset_manifest) = 'array');

create sequence if not exists public.demos_public_number_seq as bigint start with 1;

alter table public.demos
  add column if not exists public_number bigint;

alter table public.demos
  alter column public_number set default nextval('public.demos_public_number_seq'::regclass);

update public.demos
set public_number = nextval('public.demos_public_number_seq'::regclass)
where public_number is null;

select setval(
  'public.demos_public_number_seq'::regclass,
  greatest(coalesce((select max(public_number) from public.demos), 0), 1),
  exists (select 1 from public.demos)
);

alter sequence public.demos_public_number_seq owned by public.demos.public_number;
alter table public.demos alter column public_number set not null;
create unique index if not exists demos_public_number_unique
  on public.demos (public_number);

grant usage, select on sequence public.demos_public_number_seq to authenticated;

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  messages jsonb not null default '[]'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_conversations_messages_array_check
    check (jsonb_typeof(messages) = 'array')
);

create index if not exists assistant_conversations_user_recent_idx
  on public.assistant_conversations (user_id, last_message_at desc);

drop trigger if exists set_updated_at on public.assistant_conversations;
create trigger set_updated_at
before update on public.assistant_conversations
for each row execute function public.set_updated_at();

alter table public.assistant_conversations enable row level security;
revoke all on table public.assistant_conversations from anon;
grant select, insert, update, delete on table public.assistant_conversations to authenticated;

drop policy if exists "assistant_conversations_select_own" on public.assistant_conversations;
create policy "assistant_conversations_select_own"
on public.assistant_conversations for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "assistant_conversations_insert_own" on public.assistant_conversations;
create policy "assistant_conversations_insert_own"
on public.assistant_conversations for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "assistant_conversations_update_own" on public.assistant_conversations;
create policy "assistant_conversations_update_own"
on public.assistant_conversations for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "assistant_conversations_delete_own" on public.assistant_conversations;
create policy "assistant_conversations_delete_own"
on public.assistant_conversations for delete to authenticated
using ((select auth.uid()) = user_id);

-- Keep uploaded images as original objects. Supabase Storage does not transform
-- these files on upload; the deployed demo copies the same bytes to R2.
update storage.buckets
set allowed_mime_types = array[
  'application/zip',
  'application/x-zip-compressed',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml'
]
where id = 'demo-assets';

-- This is a small, single-user operations dashboard. Postgres Changes is the
-- simplest correct fit here; every table remains protected by its RLS policy.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'profiles', 'leads', 'lead_analyses', 'site_templates', 'demos',
    'demo_versions', 'message_drafts', 'communications', 'follow_ups',
    'approvals', 'agent_runs', 'agent_events', 'notifications', 'clients',
    'cost_events', 'pricing_experiments', 'integration_connections',
    'lead_discovery_runs', 'lead_discovery_results', 'email_threads', 'emails',
    'client_sites', 'projects', 'project_tasks', 'maintenance_subscriptions',
    'maintenance_requests', 'payments', 'expenses', 'ai_usage', 'activity_log',
    'tasks', 'calendar_events', 'notes', 'deployments', 'settings',
    'assistant_conversations'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;

commit;
