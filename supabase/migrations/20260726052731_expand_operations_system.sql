-- Expand Operations Workflow from the original sales shell into the complete
-- business operating system. All browser-visible tables remain owner scoped.

alter table public.leads
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'US',
  add column if not exists source_key text,
  add column if not exists listing_url text,
  add column if not exists has_website boolean not null default false,
  add column if not exists website_status text not null default 'Unknown',
  add column if not exists lead_score integer not null default 0 check (lead_score between 0 and 100),
  add column if not exists discovered_at timestamptz not null default now(),
  add column if not exists last_contacted_at timestamptz,
  add column if not exists follow_up_at timestamptz,
  add column if not exists deal_value numeric(12,2),
  add column if not exists notes text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

update public.leads
set
  status = case status
    when 'discovered' then 'new'
    when 'analyzed' then 'qualified'
    when 'demo_building' then 'qualified'
    when 'qa' then 'demo_ready'
    when 'ready_to_contact' then 'demo_ready'
    when 'follow_up' then 'contacted'
    else status
  end,
  listing_url = coalesce(listing_url, google_maps_url),
  lead_score = greatest(qualification_score, opportunity_score),
  deal_value = coalesce(deal_value, asking_price),
  source_metadata = case when source_metadata = '{}'::jsonb then source_payload else source_metadata end;

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads alter column status set default 'new';
alter table public.leads add constraint leads_status_check check (
  status in ('new', 'qualified', 'demo_ready', 'contacted', 'replied', 'interested', 'closing', 'won', 'lost')
);

create unique index if not exists leads_user_source_key_unique
  on public.leads (user_id, source, source_key)
  where source_key is not null and source_key <> '';
create index if not exists leads_user_score_idx on public.leads (user_id, lead_score desc);
create index if not exists leads_user_follow_up_idx on public.leads (user_id, follow_up_at) where follow_up_at is not null;

alter table public.site_templates
  add column if not exists desktop_preview_url text,
  add column if not exists mobile_preview_url text,
  add column if not exists status text not null default 'active'
    check (status in ('draft', 'active', 'archived'));

alter table public.demos drop constraint if exists demos_lead_id_key;
alter table public.demos drop constraint if exists demos_status_check;
alter table public.demos alter column status set default 'draft';
update public.demos set status = case status
  when 'brief' then 'draft'
  when 'building' then 'draft'
  when 'qa' then 'ready'
  when 'deployed' then 'sent'
  when 'client_revision' then 'client_interested'
  when 'production' then 'converted'
  else status
end;
alter table public.demos add constraint demos_status_check check (
  status in ('draft', 'ready', 'sent', 'viewed', 'client_interested', 'converted', 'archived')
);
alter table public.demos
  add column if not exists slug text,
  add column if not exists business_info jsonb not null default '{}'::jsonb,
  add column if not exists content jsonb not null default '{}'::jsonb,
  add column if not exists theme jsonb not null default '{}'::jsonb,
  add column if not exists viewed_at timestamptz;
create unique index if not exists demos_user_slug_unique on public.demos (user_id, slug) where slug is not null;

alter table public.message_drafts drop constraint if exists message_drafts_status_check;
alter table public.message_drafts add constraint message_drafts_status_check check (
  status in ('draft', 'pending_approval', 'approved', 'changes_requested', 'scheduled', 'sent', 'cancelled')
);

alter table public.follow_ups drop constraint if exists follow_ups_status_check;
alter table public.follow_ups add constraint follow_ups_status_check check (
  status in ('scheduled', 'due', 'overdue', 'drafted', 'sent', 'snoozed', 'replied', 'completed', 'dead', 'skipped', 'cancelled')
);

alter table public.approvals drop constraint if exists approvals_approval_type_check;
alter table public.approvals add constraint approvals_approval_type_check check (
  approval_type in ('email_send', 'follow_up_send', 'demo_deploy', 'site_publish', 'pricing_change', 'record_delete', 'client_handoff', 'agent_action', 'data_change')
);

alter table public.agent_runs drop constraint if exists agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check check (
  status in ('queued', 'running', 'paused', 'waiting_approval', 'completed', 'failed', 'cancelled')
);
alter table public.agent_runs
  add column if not exists objective text,
  add column if not exists completed_steps jsonb not null default '[]'::jsonb,
  add column if not exists upcoming_steps jsonb not null default '[]'::jsonb,
  add column if not exists error_message text,
  add column if not exists messages jsonb not null default '[]'::jsonb;

alter table public.clients
  add column if not exists contact_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists purchase_date date,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists project_status text not null default 'payment_received',
  add column if not exists maintenance_status text not null default 'inactive',
  add column if not exists support_requests integer not null default 0,
  add column if not exists notes text;

create table if not exists public.lead_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'openscout',
  engine_version text,
  query jsonb not null default '{}'::jsonb,
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed', 'cancelled')),
  scanned_count integer not null default 0,
  result_count integer not null default 0,
  duplicate_count integer not null default 0,
  rejected_count integer not null default 0,
  saved_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_discovery_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.lead_discovery_runs(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  source text not null default 'openscout',
  source_key text not null,
  business_name text not null,
  normalized_data jsonb not null,
  raw_source_metadata jsonb not null default '{}'::jsonb,
  website_status text,
  lead_score integer check (lead_score between 0 and 100),
  decision text not null default 'pending' check (decision in ('pending', 'saved', 'rejected', 'duplicate')),
  decision_reason text,
  duplicate_of_lead_id uuid references public.leads(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, source, source_key)
);

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  external_thread_id text,
  subject text not null,
  sender_name text,
  sender_email text,
  classification text not null default 'other' check (classification in (
    'unread', 'interested', 'maybe', 'not_interested', 'needs_changes',
    'price_objection', 'follow_up_later', 'wrong_person', 'other'
  )),
  ai_summary text,
  intent text,
  suggested_reply text,
  is_unread boolean not null default true,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.email_threads(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender text,
  recipients text[] not null default '{}',
  subject text,
  body text,
  status text not null default 'received',
  external_message_id text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.client_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  demo_id uuid references public.demos(id) on delete set null,
  name text not null,
  domain text,
  production_url text,
  source_storage_path text,
  status text not null default 'draft' check (status in ('draft', 'review', 'ready', 'live', 'archived')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid references public.client_sites(id) on delete set null,
  name text not null,
  status text not null default 'payment_received' check (
    status in ('payment_received', 'changes', 'client_review', 'domain_setup', 'launch', 'live', 'paused')
  ),
  deadline date,
  progress integer not null default 0 check (progress between 0 and 100),
  requested_edits jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  due_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid references public.client_sites(id) on delete set null,
  plan_name text not null default 'Website Maintenance',
  monthly_amount numeric(12,2) not null default 50 check (monthly_amount >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'cancelled', 'past_due')),
  started_on date not null default current_date,
  next_charge_on date,
  last_payment_on date,
  cancelled_on date,
  hosting_included boolean not null default true,
  domain_managed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.maintenance_subscriptions(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting_client', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  maintenance_subscription_id uuid references public.maintenance_subscriptions(id) on delete set null,
  payment_type text not null check (payment_type in ('website_sale', 'maintenance')),
  customer_name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  fee_amount numeric(12,2) not null default 0 check (fee_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'available', 'failed', 'refunded')),
  refund_state text not null default 'none',
  source text not null default 'manual',
  external_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('hosting', 'domains', 'apis', 'software', 'payment_fees', 'ai', 'other')),
  vendor text,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  occurred_on date not null default current_date,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  model text not null,
  task text not null,
  request_count integer not null default 1 check (request_count >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost numeric(12,6) not null default 0 check (cost >= 0),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  detail text,
  actor_type text not null default 'user' check (actor_type in ('user', 'system', 'orchestrator')),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  tags text[] not null default '{}',
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_type text not null check (event_type in ('follow_up', 'call', 'deadline', 'launch', 'maintenance', 'task', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  category text not null default 'general',
  tags text[] not null default '{}',
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  site_id uuid references public.client_sites(id) on delete set null,
  demo_id uuid references public.demos(id) on delete set null,
  production_url text,
  domain text,
  status text not null default 'pending' check (status in ('pending', 'deploying', 'live', 'failed', 'rolled_back')),
  ssl_status text not null default 'pending',
  dns_status text not null default 'pending',
  version text,
  hosting_health text not null default 'unknown',
  logs jsonb not null default '[]'::jsonb,
  last_deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists discovery_runs_user_created_idx on public.lead_discovery_runs (user_id, created_at desc);
create index if not exists discovery_results_run_decision_idx on public.lead_discovery_results (run_id, decision);
create index if not exists discovery_results_user_source_idx on public.lead_discovery_results (user_id, source, source_key);
create index if not exists email_threads_user_time_idx on public.email_threads (user_id, last_message_at desc);
create index if not exists emails_thread_time_idx on public.emails (thread_id, created_at);
create index if not exists projects_user_status_idx on public.projects (user_id, status, updated_at desc);
create index if not exists maintenance_user_status_idx on public.maintenance_subscriptions (user_id, status);
create index if not exists payments_user_time_idx on public.payments (user_id, paid_at desc);
create index if not exists expenses_user_date_idx on public.expenses (user_id, occurred_on desc);
create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, occurred_at desc);
create index if not exists activity_user_time_idx on public.activity_log (user_id, created_at desc);
create index if not exists tasks_user_due_idx on public.tasks (user_id, status, due_at);
create index if not exists calendar_user_start_idx on public.calendar_events (user_id, starts_at);
create index if not exists notes_user_updated_idx on public.notes (user_id, is_archived, updated_at desc);
create index if not exists deployments_user_status_idx on public.deployments (user_id, status, updated_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'email_threads', 'client_sites', 'projects', 'project_tasks',
    'maintenance_subscriptions', 'maintenance_requests', 'tasks',
    'calendar_events', 'notes', 'deployments', 'settings'
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
    'lead_discovery_runs', 'lead_discovery_results', 'email_threads', 'emails',
    'client_sites', 'projects', 'project_tasks', 'maintenance_subscriptions',
    'maintenance_requests', 'payments', 'expenses', 'ai_usage', 'activity_log',
    'tasks', 'calendar_events', 'notes', 'deployments', 'settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);

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

do $$
declare
  target_table text;
begin
  foreach target_table in array array['tasks', 'activity_log', 'email_threads']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;

-- The original unfinished UI added personal-finance tables. They were empty
-- when this migration was authored and are intentionally removed: this product
-- tracks only operating costs and business payments.
drop table if exists public.finance_goals;
drop table if exists public.finance_transactions;
