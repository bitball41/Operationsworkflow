begin;

-- Example records are deliberately marked so revenue, client, and delivery
-- reporting can exclude them. The key makes the seed repeatable without
-- relying on generated UUIDs.
alter table public.clients
  add column if not exists is_example boolean not null default false,
  add column if not exists example_key text,
  add column if not exists phone_routing_mode text check (
    phone_routing_mode is null or phone_routing_mode in ('missed_call', 'always_forward', 'pbx_overflow', 'not_configured')
  ),
  add column if not exists dedicated_ai_number text,
  add column if not exists transfer_number text,
  add column if not exists timezone text;

create unique index if not exists clients_workspace_example_key_unique
  on public.clients (user_id, example_key)
  where example_key is not null;

create table if not exists public.voice_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  automation_id uuid references public.automations(id) on delete set null,
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),
  provider_agent_id text not null,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived', 'error')),
  environment text not null default 'development' check (environment in ('development', 'staging', 'production')),
  is_example boolean not null default false,
  voice_id text,
  llm text,
  language text not null default 'en',
  first_message text,
  system_prompt text,
  phone_number_id text,
  phone_number text,
  configuration jsonb not null default '{}'::jsonb,
  platform_settings jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  last_synced_at timestamptz,
  provider_deleted_at timestamptz,
  last_error text,
  created_by_member_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_agent_id)
);

create index if not exists voice_agents_workspace_status_idx
  on public.voice_agents (user_id, status, updated_at desc);
create index if not exists voice_agents_client_idx
  on public.voice_agents (client_id, updated_at desc);
create index if not exists voice_agents_automation_idx
  on public.voice_agents (automation_id);

create table if not exists public.voice_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  voice_agent_id uuid references public.voice_agents(id) on delete set null,
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),
  provider_conversation_id text not null,
  provider_agent_id text,
  status text not null default 'processing' check (status in ('processing', 'done', 'failed', 'deleted')),
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound', 'web')),
  caller_name text,
  caller_phone text,
  caller_address text,
  problem text,
  urgency text,
  appointment_status text,
  appointment_at timestamptz,
  transcript jsonb not null default '[]'::jsonb,
  summary text,
  call_successful text,
  analysis jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  provider_cost numeric(14,4) check (provider_cost is null or provider_cost >= 0),
  provider_cost_unit text,
  has_audio boolean not null default false,
  is_example boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_conversation_id)
);

create index if not exists voice_conversations_workspace_time_idx
  on public.voice_conversations (user_id, started_at desc nulls last, created_at desc);
create index if not exists voice_conversations_agent_time_idx
  on public.voice_conversations (voice_agent_id, started_at desc nulls last);
create index if not exists voice_conversations_client_time_idx
  on public.voice_conversations (client_id, started_at desc nulls last);

-- Raw receipts stay server-only. The Operations snapshot intentionally omits
-- this table; the dashboard receives only normalized conversation records.
create table if not exists public.elevenlabs_webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.operations_workspaces(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  provider_agent_id text,
  provider_conversation_id text,
  event_timestamp timestamptz,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error_message text,
  processed_at timestamptz,
  received_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create index if not exists elevenlabs_webhook_workspace_received_idx
  on public.elevenlabs_webhook_events (user_id, received_at desc);
create index if not exists elevenlabs_webhook_conversation_idx
  on public.elevenlabs_webhook_events (provider_conversation_id, received_at desc);

drop trigger if exists set_updated_at on public.voice_agents;
create trigger set_updated_at
before update on public.voice_agents
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.voice_conversations;
create trigger set_updated_at
before update on public.voice_conversations
for each row execute function public.set_updated_at();

alter table public.voice_agents enable row level security;
alter table public.voice_conversations enable row level security;
alter table public.elevenlabs_webhook_events enable row level security;

revoke all on public.voice_agents from public, anon, authenticated;
revoke all on public.voice_conversations from public, anon, authenticated;
revoke all on public.elevenlabs_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.voice_agents to service_role;
grant select, insert, update, delete on public.voice_conversations to service_role;
grant select, insert, update, delete on public.elevenlabs_webhook_events to service_role;

comment on table public.voice_agents is 'Server-managed ElevenLabs agents linked to Operations clients and automations.';
comment on table public.voice_conversations is 'Normalized ElevenLabs conversation and post-call analysis records.';
comment on table public.elevenlabs_webhook_events is 'Idempotent, server-only ElevenLabs webhook delivery receipts.';

-- Keep the account-free Cloudflare Access workspace snapshot in sync with the
-- two browser-safe voice collections. Webhook receipts remain excluded.
create or replace function public.operations_workspace_snapshot(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
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
      ('voiceAgents', 'voice_agents', 'updated_at', false, 250),
      ('voiceConversations', 'voice_conversations', 'started_at', false, 500),
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
end;
$$;

revoke all on function public.operations_workspace_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.operations_workspace_snapshot(uuid) to service_role;

-- A clearly labelled, idempotent example workspace. All identities use
-- reserved example data and no payment, booking, or deployment is represented
-- as real.
do $$
declare
  workspace_id uuid;
  owner_member_id uuid;
  example_lead_id uuid;
  example_client_id uuid;
  example_project_id uuid;
  example_automation_id uuid;
begin
  select id into workspace_id
  from public.operations_workspaces
  order by created_at
  limit 1;

  if workspace_id is null then
    return;
  end if;

  select id into owner_member_id
  from public.team_members
  where user_id = workspace_id and status = 'active' and role = 'owner'
  order by created_at
  limit 1;

  insert into public.leads (
    user_id, business_name, contact_name, email, phone, city, region, address,
    category, source, source_key, status, priority, qualification_status,
    opportunity_tags, opportunity_summary, pain_points, service_type,
    quoted_setup_fee, quoted_monthly_fee, assigned_team_member_id, is_sample,
    notes
  )
  select
    workspace_id, 'Cactus Wrench Roofing', 'Maya Torres',
    'maya@cactuswrench.example', '+12025550173', 'Boise', 'ID',
    '1840 Example Ridge Rd', 'Roofing contractor', 'demo',
    'demo:cactus-wrench-roofing', 'won', 'high', 'qualified',
    array['high_call_volume', 'after_hours', 'booking'],
    'Example roofing client used to demonstrate missed-call capture, qualification, and inspection booking.',
    array['Missed calls after hours', 'Slow inspection scheduling'],
    'Unlimited AI Receptionist & Appointment Booking', 2500, 997,
    owner_member_id, true,
    'EXAMPLE DATA — not a real prospect or customer.'
  where not exists (
    select 1 from public.leads
    where user_id = workspace_id and source_key = 'demo:cactus-wrench-roofing'
  );

  select id into example_lead_id
  from public.leads
  where user_id = workspace_id and source_key = 'demo:cactus-wrench-roofing'
  order by created_at
  limit 1;

  insert into public.clients (
    user_id, lead_id, status, package_name, agreed_price, amount_received,
    contact_name, email, phone, payment_status, project_status,
    maintenance_status, primary_team_member_id, billing_contact_name,
    billing_email, setup_fee, monthly_fee, onboarding_status,
    onboarding_progress, support_status, pricing, notes, is_example,
    example_key, phone_routing_mode, timezone
  )
  select
    workspace_id, example_lead_id, 'onboarding',
    'Unlimited AI Receptionist & Appointment Booking', 2500, 0,
    'Maya Torres', 'maya@cactuswrench.example', '+12025550173',
    'pending', 'building', 'inactive', owner_member_id, 'Maya Torres',
    'billing@cactuswrench.example', 2500, 997, 'in_progress', 72,
    'normal', jsonb_build_object(
      'activation', 2500,
      'monthly', 997,
      'billing_model', 'activation_plus_monthly',
      'example', true
    ),
    'EXAMPLE CLIENT — demonstrate the complete CRM and delivery workflow without counting it as revenue.',
    true, 'cactus-wrench-roofing', 'not_configured', 'America/Boise'
  where not exists (
    select 1 from public.clients
    where user_id = workspace_id and example_key = 'cactus-wrench-roofing'
  );

  select id into example_client_id
  from public.clients
  where user_id = workspace_id and example_key = 'cactus-wrench-roofing'
  order by created_at
  limit 1;

  insert into public.onboarding_records (
    user_id, client_id, business, customer_handling, technical,
    automation_goals, status, progress
  ) values (
    workspace_id,
    example_client_id,
    jsonb_build_object(
      'business_name', 'Cactus Wrench Roofing',
      'industry', 'Roofing',
      'service_area', 'Boise metro',
      'hours', 'Mon–Fri 7:00 AM–6:00 PM',
      'timezone', 'America/Boise',
      'example', true
    ),
    jsonb_build_object(
      'capture', jsonb_build_array('name', 'phone', 'property address', 'roofing problem', 'urgency'),
      'booking_goal', 'Book roof inspections from verified live availability',
      'urgent_transfer', 'Transfer only to the private owner line; never back to the forwarded business number',
      'consent_review', 'required before production'
    ),
    jsonb_build_object(
      'phone_provider', 'Not selected',
      'routing_mode', 'Choose missed-call or always-forward',
      'calendar', 'Needs live calendar connection',
      'crm', 'Operationsworkflow',
      'forwarding_steps', jsonb_build_array(
        'Keep the existing public number',
        'Assign a dedicated AI number',
        'Choose missed-call or always-forward routing',
        'Configure the carrier or PBX',
        'Test from an unrelated phone'
      )
    ),
    jsonb_build_object(
      'answer_naturally', true,
      'qualify', true,
      'book_inspection', true,
      'post_call_summary', true,
      'prevent_transfer_loops', true
    ),
    'in_progress',
    72
  )
  on conflict (client_id) do update set
    business = excluded.business,
    customer_handling = excluded.customer_handling,
    technical = excluded.technical,
    automation_goals = excluded.automation_goals,
    status = excluded.status,
    progress = excluded.progress,
    updated_at = now();

  select id into example_project_id
  from public.projects
  where user_id = workspace_id and client_id = example_client_id
    and name = 'Cactus Wrench AI Receptionist'
  order by created_at
  limit 1;

  if example_project_id is null then
    insert into public.projects (
      user_id, client_id, name, status, progress, owner_id,
      automation_type, complexity, start_date, target_launch,
      requirements, testing_status, deployment_status, notes
    ) values (
      workspace_id, example_client_id, 'Cactus Wrench AI Receptionist',
      'building', 58, owner_member_id, 'voice agent', 'standard',
      current_date, current_date + 10,
      jsonb_build_object(
        'provider', 'ElevenLabs',
        'capture_fields', jsonb_build_array('name', 'phone', 'address', 'problem', 'urgency'),
        'calendar_booking', true,
        'post_call_webhook', true,
        'example', true
      ),
      'in_progress', 'not_deployed',
      'EXAMPLE PROJECT — provider, phone, calendar, consent, and end-to-end call checks must pass before production.'
    ) returning id into example_project_id;
  end if;

  insert into public.project_tasks (user_id, project_id, title, status, sort_order)
  select workspace_id, example_project_id, task.title, task.status, task.sort_order
  from (values
    ('Approve call script and escalation rules', 'completed', 10),
    ('Create and link the ElevenLabs agent', 'pending', 20),
    ('Connect a live booking calendar', 'pending', 30),
    ('Assign the dedicated AI phone number', 'pending', 40),
    ('Configure forwarding and test from another phone', 'pending', 50),
    ('Verify transcript, summary, consent, and no transfer loop', 'pending', 60)
  ) as task(title, status, sort_order)
  where not exists (
    select 1 from public.project_tasks existing
    where existing.project_id = example_project_id and existing.title = task.title
  );

  select id into example_automation_id
  from public.automations
  where user_id = workspace_id and client_id = example_client_id
    and name = 'Cactus Wrench ElevenLabs Receptionist'
  order by created_at
  limit 1;

  if example_automation_id is null then
    insert into public.automations (
      user_id, client_id, project_id, name, automation_type, provider,
      status, environment, configuration, system_prompt, tools, variables,
      escalation_behavior, development_version, usage, last_error
    ) values (
      workspace_id, example_client_id, example_project_id,
      'Cactus Wrench ElevenLabs Receptionist', 'voice agent', 'ElevenLabs',
      'building', 'development',
      jsonb_build_object('example', true, 'booking_provider', 'pending', 'telephony_provider', 'pending'),
      'Answer naturally for Cactus Wrench Roofing. Capture the caller name, phone, property address, roofing problem, and urgency. Offer only verified inspection times. Never claim a booking or transfer succeeded unless the tool result confirms it.',
      jsonb_build_array('calendar_availability', 'book_inspection', 'transfer_urgent_call'),
      jsonb_build_object('business_name', 'Cactus Wrench Roofing', 'timezone', 'America/Boise'),
      jsonb_build_object('urgent_destination', 'private owner number required', 'never_transfer_to_forwarded_number', true),
      'v1-draft', jsonb_build_object('example', true),
      'Expected until activation: create the ElevenLabs agent, connect calendar and telephony, then pass a real end-to-end call.'
    ) returning id into example_automation_id;
  end if;

  insert into public.knowledge_entries (
    user_id, client_id, automation_id, category, title, content,
    source_type, approved, active
  )
  select workspace_id, example_client_id, example_automation_id,
    entry.category, entry.title, entry.content, entry.source_type, true, true
  from (values
    ('business', 'Service area', 'Cactus Wrench Roofing serves the Boise metro area. This is example content for the demo workspace.', 'service'),
    ('hours', 'Business hours', 'Monday through Friday, 7:00 AM to 6:00 PM Mountain Time. This is example content.', 'hours'),
    ('policy', 'Urgent calls', 'Collect the caller details first. Transfer only to a configured private owner number and never to the forwarded business number.', 'policy'),
    ('booking', 'Inspection booking', 'Read only live calendar availability and confirm a booking only after the booking tool returns success.', 'policy')
  ) as entry(category, title, content, source_type)
  where not exists (
    select 1 from public.knowledge_entries existing
    where existing.client_id = example_client_id and existing.title = entry.title
  );

  insert into public.tasks (
    user_id, title, description, priority, due_at, status,
    client_id, project_id, automation_id, tags, created_by
  )
  select workspace_id, task.title, task.description, task.priority,
    now() + task.due_offset, 'pending', example_client_id,
    example_project_id, example_automation_id,
    array['example', 'voice-agent'], 'system'
  from (values
    ('Create the Cactus Wrench ElevenLabs agent', 'Use Voice Agents to create the provider agent and link it to this example client.', 'high', interval '1 day'),
    ('Finish real call-path verification', 'Connect calendar and telephony, call from an unrelated phone, and verify the transcript, summary, consent behavior, and transfer safety.', 'high', interval '4 days')
  ) as task(title, description, priority, due_offset)
  where not exists (
    select 1 from public.tasks existing
    where existing.client_id = example_client_id and existing.title = task.title
  );

  insert into public.integration_connections (
    user_id, provider, status, display_name, config, last_synced_at
  )
  select workspace_id, 'elevenlabs', 'not_connected', 'ElevenLabs',
    jsonb_build_object('managed_by', 'Supabase Edge Functions', 'secret_location', 'Edge Function secrets'),
    null
  where not exists (
    select 1 from public.integration_connections
    where user_id = workspace_id and provider = 'elevenlabs'
  );
end;
$$;

commit;
