begin;

-- Internal people are workspace records, not application accounts. Cloudflare
-- Access remains the authentication boundary; role enforcement is added at the
-- Worker boundary before non-owner access is activated.
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  full_name text not null,
  access_email text,
  role text not null default 'salesperson' check (
    role in ('owner', 'admin', 'salesperson', 'sales_manager', 'account_manager', 'automation_engineer', 'support')
  ),
  status text not null default 'active' check (status in ('active', 'inactive')),
  permissions jsonb not null default '{}'::jsonb,
  commission_rate numeric(7,6) not null default 0.10 check (commission_rate between 0 and 1),
  commission_min numeric(12,2) not null default 250 check (commission_min >= 0),
  commission_max numeric(12,2) not null default 1000 check (commission_max >= commission_min),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_members_workspace_email_unique
  on public.team_members (user_id, lower(access_email))
  where access_email is not null and access_email <> '';
create index if not exists team_members_workspace_status_idx
  on public.team_members (user_id, status, full_name);

alter table public.leads
  add column if not exists assigned_team_member_id uuid references public.team_members(id) on delete set null,
  add column if not exists service_type text,
  add column if not exists qualification_status text not null default 'unreviewed' check (
    qualification_status in ('unreviewed', 'potential', 'qualified', 'unqualified')
  ),
  add column if not exists opportunity_tags text[] not null default '{}',
  add column if not exists opportunity_summary text,
  add column if not exists calls_attempted integer not null default 0 check (calls_attempted >= 0),
  add column if not exists objections text[] not null default '{}',
  add column if not exists pain_points text[] not null default '{}',
  add column if not exists current_tools jsonb not null default '{}'::jsonb,
  add column if not exists quoted_setup_fee numeric(12,2) check (quoted_setup_fee is null or quoted_setup_fee >= 0),
  add column if not exists quoted_monthly_fee numeric(12,2) check (quoted_monthly_fee is null or quoted_monthly_fee >= 0),
  add column if not exists stage_entered_at timestamptz not null default now();

alter table public.leads drop constraint if exists leads_status_check;
update public.leads
set status = case status
  when 'qualified' then 'ready_to_contact'
  when 'demo_ready' then 'ready_to_contact'
  when 'replied' then 'interested'
  when 'closing' then 'negotiating'
  else status
end;
alter table public.leads alter column status set default 'new';
alter table public.leads add constraint leads_status_check check (
  status in (
    'new', 'ready_to_contact', 'contacted', 'interested', 'meeting_scheduled',
    'demo_completed', 'proposal_sent', 'negotiating', 'won', 'lost', 'follow_up_later'
  )
);
create index if not exists leads_workspace_assignee_stage_idx
  on public.leads (user_id, assigned_team_member_id, status, stage_entered_at);
create index if not exists leads_workspace_opportunity_tags_idx
  on public.leads using gin (opportunity_tags);

create table if not exists public.sales_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  salesperson_id uuid references public.team_members(id) on delete set null,
  outcome text not null check (
    outcome in ('no_answer', 'voicemail', 'gatekeeper', 'wrong_number', 'interested', 'meeting_booked', 'call_back_later', 'not_interested', 'already_has_solution', 'unqualified')
  ),
  notes text,
  objection text,
  pain_point text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  called_at timestamptz not null default now(),
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sales_calls_workspace_time_idx
  on public.sales_calls (user_id, called_at desc);
create index if not exists sales_calls_lead_time_idx
  on public.sales_calls (lead_id, called_at desc);
create index if not exists sales_calls_salesperson_time_idx
  on public.sales_calls (salesperson_id, called_at desc);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  salesperson_id uuid references public.team_members(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  attendees jsonb not null default '[]'::jsonb,
  current_workflow text,
  biggest_pain_point text,
  approximate_volume text,
  existing_crm text,
  calendar_system text,
  phone_provider text,
  tools_used text[] not null default '{}',
  automation_proposed text,
  required_integrations text[] not null default '{}',
  implementation_complexity text check (implementation_complexity is null or implementation_complexity in ('low', 'medium', 'high', 'custom')),
  quoted_setup_fee numeric(12,2) check (quoted_setup_fee is null or quoted_setup_fee >= 0),
  quoted_monthly_fee numeric(12,2) check (quoted_monthly_fee is null or quoted_monthly_fee >= 0),
  usage_allowance text,
  decision_maker text,
  notes text,
  next_action text,
  outcome text not null default 'scheduled' check (
    outcome in ('scheduled', 'proposal_needed', 'follow_up', 'won', 'lost', 'technical_discovery_required', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_workspace_start_idx
  on public.meetings (user_id, starts_at);
create index if not exists meetings_lead_idx on public.meetings (lead_id);
create index if not exists meetings_client_idx on public.meetings (client_id);
create index if not exists meetings_salesperson_start_idx on public.meetings (salesperson_id, starts_at);

alter table public.clients
  add column if not exists primary_team_member_id uuid references public.team_members(id) on delete set null,
  add column if not exists billing_contact_name text,
  add column if not exists billing_email text,
  add column if not exists setup_fee numeric(12,2) not null default 0 check (setup_fee >= 0),
  add column if not exists monthly_fee numeric(12,2) not null default 0 check (monthly_fee >= 0),
  add column if not exists included_usage numeric(14,4) check (included_usage is null or included_usage >= 0),
  add column if not exists overage_rate numeric(14,6) check (overage_rate is null or overage_rate >= 0),
  add column if not exists onboarding_status text not null default 'not_started' check (
    onboarding_status in ('not_started', 'in_progress', 'blocked', 'complete')
  ),
  add column if not exists onboarding_progress integer not null default 0 check (onboarding_progress between 0 and 100),
  add column if not exists support_status text not null default 'normal' check (
    support_status in ('normal', 'attention', 'critical', 'paused')
  ),
  add column if not exists pricing jsonb not null default '{}'::jsonb;
create index if not exists clients_primary_team_member_idx
  on public.clients (primary_team_member_id);

create table if not exists public.onboarding_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  business jsonb not null default '{}'::jsonb,
  customer_handling jsonb not null default '{}'::jsonb,
  technical jsonb not null default '{}'::jsonb,
  automation_goals jsonb not null default '{}'::jsonb,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'complete')),
  progress integer not null default 0 check (progress between 0 and 100),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id)
);
create index if not exists onboarding_workspace_status_idx
  on public.onboarding_records (user_id, status, updated_at desc);

alter table public.projects drop constraint if exists projects_status_check;
update public.projects
set status = case status
  when 'payment_received' then 'discovery'
  when 'changes' then 'building'
  when 'domain_setup' then 'integrating'
  when 'launch' then 'limited_launch'
  else status
end;
alter table public.projects alter column status set default 'discovery';
alter table public.projects add constraint projects_status_check check (
  status in ('discovery', 'designing', 'building', 'integrating', 'testing', 'client_review', 'limited_launch', 'live', 'maintenance', 'paused')
);
alter table public.projects
  add column if not exists owner_id uuid references public.team_members(id) on delete set null,
  add column if not exists automation_type text,
  add column if not exists complexity text not null default 'standard' check (complexity in ('simple', 'standard', 'complex', 'custom')),
  add column if not exists start_date date not null default current_date,
  add column if not exists target_launch date,
  add column if not exists requirements jsonb not null default '{}'::jsonb,
  add column if not exists testing_status text not null default 'not_started' check (testing_status in ('not_started', 'in_progress', 'passed', 'failed', 'blocked')),
  add column if not exists deployment_status text not null default 'not_deployed' check (deployment_status in ('not_deployed', 'staging', 'limited_rollout', 'production', 'paused', 'failed')),
  add column if not exists current_version text;
create index if not exists projects_owner_idx on public.projects (owner_id);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  automation_type text not null,
  provider text,
  status text not null default 'designing' check (status in ('designing', 'building', 'testing', 'limited_launch', 'live', 'maintenance', 'paused', 'archived')),
  environment text not null default 'development' check (environment in ('development', 'staging', 'production')),
  configuration jsonb not null default '{}'::jsonb,
  system_prompt text,
  tools jsonb not null default '[]'::jsonb,
  variables jsonb not null default '{}'::jsonb,
  escalation_behavior jsonb not null default '{}'::jsonb,
  development_version text,
  deployed_version text,
  usage jsonb not null default '{}'::jsonb,
  last_error text,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_workspace_status_idx
  on public.automations (user_id, status, updated_at desc);
create index if not exists automations_client_idx on public.automations (client_id);
create index if not exists automations_project_idx on public.automations (project_id);

create table if not exists public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  automation_id uuid references public.automations(id) on delete set null,
  category text not null,
  title text not null,
  content text not null,
  source_type text not null default 'note' check (source_type in ('faq', 'service', 'policy', 'document', 'url', 'note', 'contact', 'hours', 'pricing')),
  source_reference text,
  approved boolean not null default false,
  active boolean not null default true,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_client_active_idx
  on public.knowledge_entries (client_id, active, category, updated_at desc);
create index if not exists knowledge_automation_idx on public.knowledge_entries (automation_id);

alter table public.tasks
  add column if not exists automation_id uuid references public.automations(id) on delete set null;
create index if not exists tasks_automation_idx on public.tasks (automation_id);

alter table public.deployments drop constraint if exists deployments_status_check;
update public.deployments
set status = case status
  when 'pending' then 'staging'
  when 'deploying' then 'staging'
  when 'live' then 'production'
  when 'rolled_back' then 'paused'
  else status
end;
alter table public.deployments alter column status set default 'staging';
alter table public.deployments add constraint deployments_status_check check (
  status in ('staging', 'limited_rollout', 'production', 'paused', 'failed')
);
alter table public.deployments
  add column if not exists automation_id uuid references public.automations(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists provider text,
  add column if not exists environment text not null default 'staging' check (environment in ('development', 'staging', 'production')),
  add column if not exists deployed_at timestamptz,
  add column if not exists deployed_by uuid references public.team_members(id) on delete set null,
  add column if not exists rollback_version text,
  add column if not exists notes text;
create index if not exists deployments_automation_time_idx
  on public.deployments (automation_id, deployed_at desc);
create index if not exists deployments_project_idx on public.deployments (project_id);
create index if not exists deployments_deployed_by_idx on public.deployments (deployed_by);

alter table public.maintenance_subscriptions
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists included_usage numeric(14,4) check (included_usage is null or included_usage >= 0),
  add column if not exists usage_unit text,
  add column if not exists overage_rate numeric(14,6) check (overage_rate is null or overage_rate >= 0),
  add column if not exists billing_day integer check (billing_day is null or billing_day between 1 and 28),
  add column if not exists cancellation_status text not null default 'none' check (cancellation_status in ('none', 'requested', 'scheduled', 'cancelled'));
create index if not exists maintenance_subscriptions_project_idx
  on public.maintenance_subscriptions (project_id);

alter table public.payments drop constraint if exists payments_payment_type_check;
alter table public.payments add constraint payments_payment_type_check check (
  payment_type in ('setup_fee', 'recurring_subscription', 'usage_overage', 'custom_invoice', 'refund', 'website_sale', 'maintenance')
);
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (
  status in ('pending', 'paid', 'available', 'overdue', 'failed', 'refunded')
);
alter table public.payments
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists due_date date,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists payments_workspace_due_idx
  on public.payments (user_id, status, due_date);
create index if not exists payments_project_idx on public.payments (project_id);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  salesperson_id uuid references public.team_members(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  collected_setup_revenue numeric(12,2) not null check (collected_setup_revenue >= 0),
  commission_rate numeric(7,6) not null default 0.10 check (commission_rate between 0 and 1),
  commission_min numeric(12,2) not null default 250 check (commission_min >= 0),
  commission_max numeric(12,2) not null default 1000 check (commission_max >= commission_min),
  calculated_commission numeric(12,2) generated always as (
    case
      when collected_setup_revenue <= 0 then 0
      else round(greatest(commission_min, least(commission_max, collected_setup_revenue * commission_rate)), 2)
    end
  ) stored,
  status text not null default 'pending' check (status in ('pending', 'earned', 'paid', 'reversed')),
  earned_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id)
);
create index if not exists commissions_workspace_status_idx
  on public.commissions (user_id, status, created_at desc);
create index if not exists commissions_salesperson_status_idx
  on public.commissions (salesperson_id, status, created_at desc);
create index if not exists commissions_client_idx on public.commissions (client_id);
create index if not exists commissions_lead_idx on public.commissions (lead_id);

-- The existing Whop receipt table links to payments and is read during replay
-- checks; cover that foreign key before production traffic grows.
create index if not exists whop_webhook_events_payment_id_idx
  on public.whop_webhook_events (payment_id);

-- Whop keeps its exactly-once receipt boundary. When signed payment metadata
-- links a client, setup revenue can also create or reverse the commission in
-- the same database transaction. Recurring revenue never enters this ledger.
create or replace function public.ingest_whop_webhook(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_payload_hash text,
  p_payment jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  receipt_id uuid;
  stored_payment public.payments%rowtype;
  payment_client_id uuid;
  payment_project_id uuid;
  collected_setup numeric(12,2);
begin
  if coalesce(trim(p_event_id), '') = '' then
    raise exception 'Whop event id is required';
  end if;
  if coalesce(trim(p_event_type), '') = '' then
    raise exception 'Whop event type is required';
  end if;
  if coalesce(trim(p_payment ->> 'external_transaction_id'), '') = '' then
    raise exception 'Whop transaction id is required';
  end if;

  begin
    payment_client_id := nullif(p_payment ->> 'client_id', '')::uuid;
    payment_project_id := nullif(p_payment ->> 'project_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Whop client or project id is invalid';
  end;

  if payment_client_id is not null and not exists (
    select 1 from public.clients
    where id = payment_client_id and user_id = p_user_id
  ) then
    raise exception 'Whop client does not belong to this workspace';
  end if;
  if payment_project_id is not null and not exists (
    select 1 from public.projects
    where id = payment_project_id and user_id = p_user_id
      and (payment_client_id is null or client_id = payment_client_id)
  ) then
    raise exception 'Whop project does not belong to this workspace or client';
  end if;

  insert into public.whop_webhook_events (
    event_id, event_type, user_id, payload_hash
  ) values (
    p_event_id, p_event_type, p_user_id, p_payload_hash
  )
  on conflict (event_id) do nothing
  returning id into receipt_id;

  if receipt_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  insert into public.payments (
    user_id, payment_type, customer_name, amount, fee_amount, status,
    refund_state, source, external_transaction_id, client_id, project_id,
    paid_at, updated_at
  ) values (
    p_user_id,
    coalesce(nullif(p_payment ->> 'payment_type', ''), 'setup_fee'),
    coalesce(nullif(p_payment ->> 'customer_name', ''), 'Whop customer'),
    coalesce((p_payment ->> 'amount')::numeric, 0),
    coalesce((p_payment ->> 'fee_amount')::numeric, 0),
    coalesce(nullif(p_payment ->> 'status', ''), 'pending'),
    p_payment ->> 'refund_state',
    'whop',
    p_payment ->> 'external_transaction_id',
    payment_client_id,
    payment_project_id,
    nullif(p_payment ->> 'paid_at', '')::timestamptz,
    now()
  )
  on conflict (user_id, source, external_transaction_id)
    where source = 'whop' and external_transaction_id is not null
  do update set
    payment_type = excluded.payment_type,
    customer_name = excluded.customer_name,
    amount = excluded.amount,
    fee_amount = excluded.fee_amount,
    status = excluded.status,
    refund_state = excluded.refund_state,
    client_id = coalesce(excluded.client_id, payments.client_id),
    project_id = coalesce(excluded.project_id, payments.project_id),
    paid_at = excluded.paid_at,
    updated_at = now()
  returning * into stored_payment;

  if stored_payment.client_id is not null then
    select coalesce(sum(payment_row.amount), 0)
      into collected_setup
      from public.payments payment_row
     where payment_row.client_id = stored_payment.client_id
       and payment_row.payment_type = 'setup_fee'
       and payment_row.status in ('paid', 'available');

    update public.clients client_row
       set amount_received = collected_setup,
           payment_status = case
             when coalesce(client_row.setup_fee, client_row.agreed_price, 0) > 0
              and collected_setup >= coalesce(client_row.setup_fee, client_row.agreed_price, 0) then 'paid'
             when collected_setup > 0 then 'partial'
             else 'pending'
           end,
           updated_at = now()
     where client_row.id = stored_payment.client_id
       and client_row.user_id = p_user_id;
  end if;

  if stored_payment.status = 'refunded' then
    update public.commissions
       set status = 'reversed', reversed_at = now(), updated_at = now()
     where payment_id = stored_payment.id
       and status <> 'reversed';
  elsif stored_payment.payment_type = 'setup_fee'
    and stored_payment.status in ('paid', 'available')
    and stored_payment.client_id is not null then
    insert into public.commissions (
      user_id, salesperson_id, client_id, lead_id, payment_id,
      collected_setup_revenue, commission_rate, commission_min,
      commission_max, status, earned_at
    )
    select
      p_user_id,
      coalesce(lead_row.assigned_team_member_id, client_row.primary_team_member_id),
      client_row.id,
      lead_row.id,
      stored_payment.id,
      stored_payment.amount,
      coalesce(member_row.commission_rate, 0.10),
      coalesce(member_row.commission_min, 250),
      coalesce(member_row.commission_max, 1000),
      'earned',
      coalesce(stored_payment.paid_at, now())
    from public.clients client_row
    left join public.leads lead_row on lead_row.id = client_row.lead_id
    left join public.team_members member_row
      on member_row.id = coalesce(lead_row.assigned_team_member_id, client_row.primary_team_member_id)
    where client_row.id = stored_payment.client_id
      and client_row.user_id = p_user_id
    on conflict (payment_id) do nothing;
  end if;

  update public.whop_webhook_events
     set payment_id = stored_payment.id,
         processed_at = now()
   where id = receipt_id;

  return jsonb_build_object('duplicate', false, 'payment_id', stored_payment.id);
end;
$$;

revoke all on function public.ingest_whop_webhook(text, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_whop_webhook(text, text, uuid, text, jsonb)
  to service_role;

alter table public.expenses
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists automation_id uuid references public.automations(id) on delete set null,
  add column if not exists cost_scope text not null default 'overhead' check (cost_scope in ('overhead', 'client')),
  add column if not exists recurring boolean not null default false;
create index if not exists expenses_project_idx on public.expenses (project_id);
create index if not exists expenses_automation_idx on public.expenses (automation_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'team_members', 'sales_calls', 'meetings', 'onboarding_records',
    'automations', 'knowledge_entries', 'commissions'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end
$$;

-- The browser still receives one atomic, workspace-scoped snapshot. This
-- function deliberately remains security invoker and service-role-only.
create or replace function public.operations_workspace_snapshot(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  collection record;
  collection_rows jsonb;
  result jsonb := jsonb_build_object(
    'profile',
    (select to_jsonb(profile_row)
       from public.profiles profile_row
      where profile_row.id = p_workspace_id)
  );
begin
  for collection in
    select *
    from (values
      ('leads', 'leads', 'updated_at', false, 750),
      ('discoveryRuns', 'lead_discovery_runs', 'created_at', false, 750),
      ('discoveryResults', 'lead_discovery_results', 'created_at', false, 500),
      ('templates', 'site_templates', 'updated_at', false, 750),
      ('demos', 'demos', 'updated_at', false, 750),
      ('demoVersions', 'demo_versions', 'created_at', false, 750),
      ('drafts', 'message_drafts', 'updated_at', false, 750),
      ('emailThreads', 'email_threads', 'last_message_at', false, 750),
      ('emails', 'emails', 'created_at', false, 500),
      ('followUps', 'follow_ups', 'due_at', true, 750),
      ('approvals', 'approvals', 'created_at', false, 750),
      ('assistantConversations', 'assistant_conversations', 'last_message_at', false, 750),
      ('agentRuns', 'agent_runs', 'created_at', false, 750),
      ('agentEvents', 'agent_events', 'created_at', false, 500),
      ('notifications', 'notifications', 'created_at', false, 750),
      ('teamMembers', 'team_members', 'full_name', true, 250),
      ('clients', 'clients', 'updated_at', false, 750),
      ('clientSites', 'client_sites', 'updated_at', false, 750),
      ('salesCalls', 'sales_calls', 'called_at', false, 750),
      ('meetings', 'meetings', 'starts_at', true, 750),
      ('onboardingRecords', 'onboarding_records', 'updated_at', false, 750),
      ('projects', 'projects', 'updated_at', false, 750),
      ('projectTasks', 'project_tasks', 'sort_order', true, 750),
      ('automations', 'automations', 'updated_at', false, 750),
      ('knowledgeEntries', 'knowledge_entries', 'updated_at', false, 750),
      ('maintenanceSubscriptions', 'maintenance_subscriptions', 'updated_at', false, 750),
      ('maintenanceRequests', 'maintenance_requests', 'created_at', false, 750),
      ('payments', 'payments', 'created_at', false, 750),
      ('commissions', 'commissions', 'created_at', false, 750),
      ('expenses', 'expenses', 'occurred_on', false, 750),
      ('aiUsage', 'ai_usage', 'occurred_at', false, 750),
      ('pricingExperiments', 'pricing_experiments', 'created_at', false, 750),
      ('activity', 'activity_log', 'created_at', false, 500),
      ('tasks', 'tasks', 'due_at', true, 750),
      ('calendarEvents', 'calendar_events', 'starts_at', true, 750),
      ('notes', 'notes', 'updated_at', false, 750),
      ('deployments', 'deployments', 'updated_at', false, 750),
      ('settings', 'settings', 'key', true, 750),
      ('integrations', 'integration_connections', 'provider', true, 750)
    ) as collections(collection_key, table_name, order_column, ascending, row_limit)
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(ordered_rows)), ''[]''::jsonb)
         from (
           select *
             from public.%1$I
            where user_id = $1
            order by %2$I %3$s nulls last
            limit %4$s
         ) ordered_rows',
      collection.table_name,
      collection.order_column,
      case when collection.ascending then 'asc' else 'desc' end,
      collection.row_limit
    )
    into collection_rows
    using p_workspace_id;

    result := result || jsonb_build_object(collection.collection_key, collection_rows);
  end loop;

  return result;
end
$$;

revoke all on function public.operations_workspace_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.operations_workspace_snapshot(uuid) to service_role;

commit;
