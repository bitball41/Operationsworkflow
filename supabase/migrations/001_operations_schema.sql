-- Operations Workflow
-- Initial owner-scoped schema for the sales and fulfillment dashboard.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Owner',
  role text not null default 'owner' check (role in ('owner', 'operator', 'viewer')),
  preferences jsonb not null default '{"manual_mode": true, "email_approval_required": true, "demo_deploy_approval_required": true, "daily_cost_limit": 5}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  contact_name text,
  email text,
  phone text,
  city text,
  region text,
  website_url text,
  google_maps_url text,
  category text,
  source text not null default 'manual',
  status text not null default 'discovered' check (status in (
    'discovered', 'qualified', 'analyzed', 'demo_building', 'qa',
    'ready_to_contact', 'contacted', 'replied', 'follow_up', 'won', 'lost'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  asking_price numeric(12,2),
  next_action text,
  next_action_at timestamptz,
  tags text[] not null default '{}',
  source_payload jsonb not null default '{}'::jsonb,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  website_score integer check (website_score between 0 and 100),
  website_findings jsonb not null default '[]'::jsonb,
  review_score integer check (review_score between 0 and 100),
  review_findings jsonb not null default '[]'::jsonb,
  opportunity_summary text,
  recommended_template text,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id)
);

create table if not exists public.site_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  preview_url text,
  thumbnail_path text,
  accent_color text not null default '#7c5cff',
  layout_key text not null default 'standard',
  is_active boolean not null default true,
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  template_id uuid references public.site_templates(id) on delete set null,
  name text not null,
  status text not null default 'brief' check (status in (
    'brief', 'building', 'qa', 'ready', 'deployed', 'client_revision', 'production', 'archived'
  )),
  storage_prefix text,
  preview_url text,
  production_url text,
  qa_score integer check (qa_score between 0 and 100),
  qa_checklist jsonb not null default '{}'::jsonb,
  brief jsonb not null default '{}'::jsonb,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id)
);

create table if not exists public.demo_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  demo_id uuid not null references public.demos(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null,
  change_summary text,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (demo_id, version_number)
);

create table if not exists public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null default 'initial' check (kind in ('initial', 'follow_up', 'reply')),
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'changes_requested', 'sent', 'cancelled'
  )),
  scheduled_for timestamptz,
  sent_at timestamptz,
  external_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  draft_id uuid references public.message_drafts(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null default 'gmail',
  subject text,
  body_preview text,
  external_message_id text,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative', 'unknown')),
  reply_classification text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  draft_id uuid references public.message_drafts(id) on delete set null,
  sequence_number integer not null default 1 check (sequence_number between 1 and 12),
  due_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'due', 'drafted', 'sent', 'skipped', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  approval_type text not null check (approval_type in ('email_send', 'demo_deploy', 'client_handoff', 'agent_action', 'data_change')),
  title text not null,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'changes_requested')),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  requested_by_agent text check (requested_by_agent in ('orchestrator', 'designer', 'writer', 'system')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_type text not null check (agent_type in ('orchestrator', 'designer', 'writer')),
  title text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  current_step text,
  progress integer not null default 0 check (progress between 0 and 100),
  estimated_cost numeric(10,4) not null default 0 check (estimated_cost >= 0),
  context jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_events (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  agent_type text not null check (agent_type in ('orchestrator', 'designer', 'writer', 'system')),
  event_type text not null,
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'info' check (type in ('info', 'success', 'warning', 'error', 'approval')),
  title text not null,
  message text,
  action_route text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'onboarding' check (status in ('onboarding', 'active', 'awaiting_content', 'ready_to_launch', 'completed', 'paused')),
  package_name text not null default 'Standard website',
  agreed_price numeric(12,2) not null default 400 check (agreed_price >= 0),
  amount_received numeric(12,2) not null default 0 check (amount_received >= 0),
  domain text,
  production_url text,
  handoff_checklist jsonb not null default '{}'::jsonb,
  closed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id)
);

create table if not exists public.cost_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  category text not null check (category in ('discovery', 'analysis', 'design', 'writing', 'deployment', 'other')),
  provider text,
  model text,
  input_units integer not null default 0 check (input_units >= 0),
  output_units integer not null default 0 check (output_units >= 0),
  amount numeric(10,4) not null check (amount >= 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  offer_amount numeric(12,2) not null check (offer_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'complete')),
  sent_count integer not null default 0 check (sent_count >= 0),
  reply_count integer not null default 0 check (reply_count >= 0),
  close_count integer not null default 0 check (close_count >= 0),
  revenue numeric(12,2) not null default 0 check (revenue >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'business' check (scope in ('business', 'personal')),
  kind text not null check (kind in ('income', 'expense', 'transfer')),
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  occurred_on date not null default current_date,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  target_date date,
  priority integer not null default 0,
  color text not null default '#7c5cff',
  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error', 'disabled')),
  display_name text,
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists leads_user_status_updated_idx on public.leads (user_id, status, updated_at desc);
create index if not exists leads_user_next_action_idx on public.leads (user_id, next_action_at) where next_action_at is not null;
create index if not exists analyses_user_lead_idx on public.lead_analyses (user_id, lead_id);
create index if not exists templates_user_active_idx on public.site_templates (user_id, is_active, updated_at desc);
create index if not exists demos_user_status_idx on public.demos (user_id, status, updated_at desc);
create index if not exists demo_versions_demo_created_idx on public.demo_versions (demo_id, created_at desc);
create index if not exists drafts_user_status_idx on public.message_drafts (user_id, status, updated_at desc);
create index if not exists communications_lead_time_idx on public.communications (lead_id, occurred_at desc);
create index if not exists follow_ups_user_due_idx on public.follow_ups (user_id, status, due_at);
create index if not exists approvals_user_status_created_idx on public.approvals (user_id, status, created_at desc);
create index if not exists agent_runs_user_status_idx on public.agent_runs (user_id, status, created_at desc);
create index if not exists agent_events_user_created_idx on public.agent_events (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, is_read, created_at desc);
create index if not exists clients_user_status_idx on public.clients (user_id, status, updated_at desc);
create index if not exists cost_events_user_time_idx on public.cost_events (user_id, occurred_at desc);
create index if not exists cost_events_lead_idx on public.cost_events (lead_id, occurred_at desc) where lead_id is not null;
create index if not exists pricing_user_status_idx on public.pricing_experiments (user_id, status);
create index if not exists finance_tx_user_scope_date_idx on public.finance_transactions (user_id, scope, occurred_on desc);
create index if not exists finance_goals_user_priority_idx on public.finance_goals (user_id, is_complete, priority);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'leads', 'lead_analyses', 'site_templates', 'demos',
    'message_drafts', 'follow_ups', 'approvals', 'agent_runs', 'clients',
    'pricing_experiments', 'finance_goals', 'integration_connections'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'leads', 'lead_analyses', 'site_templates', 'demos', 'demo_versions',
    'message_drafts', 'communications', 'follow_ups', 'approvals', 'agent_runs',
    'agent_events', 'notifications', 'clients', 'cost_events', 'pricing_experiments',
    'finance_transactions', 'finance_goals', 'integration_connections'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'leads', 'lead_analyses', 'site_templates', 'demos', 'demo_versions',
    'message_drafts', 'communications', 'follow_ups', 'approvals', 'agent_runs',
    'agent_events', 'notifications', 'clients', 'cost_events', 'pricing_experiments',
    'finance_transactions', 'finance_goals', 'integration_connections'
  ]
  loop
    execute format('drop policy if exists "%s_select_own" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_select_own" on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name, table_name
    );
    execute format('drop policy if exists "%s_insert_own" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_insert_own" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name, table_name
    );
    execute format('drop policy if exists "%s_update_own" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_update_own" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name, table_name
    );
    execute format('drop policy if exists "%s_delete_own" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_delete_own" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      table_name, table_name
    );
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'demo-assets',
  'demo-assets',
  false,
  52428800,
  array['application/zip', 'application/x-zip-compressed', 'text/html', 'text/css', 'text/javascript', 'application/javascript', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "demo_assets_select_own" on storage.objects;
create policy "demo_assets_select_own" on storage.objects for select to authenticated
using (
  bucket_id = 'demo-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "demo_assets_insert_own" on storage.objects;
create policy "demo_assets_insert_own" on storage.objects for insert to authenticated
with check (
  bucket_id = 'demo-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "demo_assets_update_own" on storage.objects;
create policy "demo_assets_update_own" on storage.objects for update to authenticated
using (
  bucket_id = 'demo-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'demo-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "demo_assets_delete_own" on storage.objects;
create policy "demo_assets_delete_own" on storage.objects for delete to authenticated
using (
  bucket_id = 'demo-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
declare
  target_table text;
begin
  foreach target_table in array array['notifications', 'approvals', 'agent_runs', 'agent_events']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;
