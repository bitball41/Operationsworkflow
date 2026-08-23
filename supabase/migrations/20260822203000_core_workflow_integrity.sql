begin;

-- Unknown provider agents must never be attributed to the configured or first
-- workspace. Keep a server-only, idempotent forensic receipt until an agent is
-- deliberately connected in Operations.
create table if not exists public.elevenlabs_webhook_quarantine (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  provider_agent_id text not null,
  provider_conversation_id text,
  event_timestamp timestamptz,
  payload jsonb not null,
  reason text not null default 'unknown_agent' check (reason in ('unknown_agent')),
  received_at timestamptz not null default now()
);

create index if not exists elevenlabs_quarantine_received_idx
  on public.elevenlabs_webhook_quarantine (received_at desc);

alter table public.elevenlabs_webhook_quarantine enable row level security;
revoke all on public.elevenlabs_webhook_quarantine from public, anon, authenticated;
grant select, insert, update, delete on public.elevenlabs_webhook_quarantine to service_role;

comment on table public.elevenlabs_webhook_quarantine is
  'Server-only signed ElevenLabs events whose provider agent has no explicit Operations mapping.';

-- Closing a lead is a single database transaction. The function remains
-- security-invoker and service-role-only: Cloudflare Access authenticates the
-- human, the Worker maps that identity to p_actor_member_id, and this function
-- independently verifies workspace membership and salesperson assignment.
create or replace function public.convert_lead_to_client(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_actor_member_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  actor_row public.team_members%rowtype;
  lead_row public.leads%rowtype;
  client_row public.clients%rowtype;
  onboarding_row public.onboarding_records%rowtype;
  project_row public.projects%rowtype;
  activity_row public.activity_log%rowtype;
  previous_status text;
  created_client boolean := false;
  setup_fee numeric(12,2);
  monthly_fee numeric(12,2);
begin
  select * into actor_row
    from public.team_members member_row
   where member_row.id = p_actor_member_id
     and member_row.user_id = p_workspace_id
     and member_row.status = 'active';

  if actor_row.id is null then
    raise exception using errcode = '42501', message = 'The verified employee is not active in this workspace.';
  end if;

  if actor_row.role not in ('owner', 'admin', 'sales_manager', 'salesperson') then
    raise exception using errcode = '42501', message = 'Only sales roles can close leads.';
  end if;

  select * into lead_row
    from public.leads candidate
   where candidate.id = p_lead_id
     and candidate.user_id = p_workspace_id
   for update;

  if lead_row.id is null then
    raise exception using errcode = 'P0002', message = 'Lead not found in this workspace.';
  end if;

  if actor_row.role = 'salesperson'
     and lead_row.assigned_team_member_id is distinct from actor_row.id then
    raise exception using errcode = '42501', message = 'Salespeople can only win leads assigned to them.';
  end if;

  previous_status := lead_row.status;
  setup_fee := greatest(coalesce(
    lead_row.quoted_setup_fee,
    lead_row.deal_value,
    lead_row.asking_price,
    2500
  ), 0);
  monthly_fee := greatest(coalesce(lead_row.quoted_monthly_fee, 997), 0);

  select * into client_row
    from public.clients existing_client
   where existing_client.lead_id = lead_row.id;

  if client_row.id is null then
    insert into public.clients (
      user_id, lead_id, status, package_name, agreed_price, amount_received,
      contact_name, email, phone, payment_status, primary_team_member_id,
      setup_fee, monthly_fee, onboarding_status, onboarding_progress, pricing,
      purchase_date, is_example, example_key, phone_routing_mode
    ) values (
      p_workspace_id,
      lead_row.id,
      'onboarding',
      'Unlimited AI Receptionist & Appointment Booking',
      setup_fee,
      0,
      nullif(lead_row.contact_name, ''),
      nullif(lead_row.email, ''),
      nullif(lead_row.phone, ''),
      'pending',
      lead_row.assigned_team_member_id,
      setup_fee,
      monthly_fee,
      'not_started',
      0,
      jsonb_build_object('setup_fee', setup_fee, 'monthly_fee', monthly_fee),
      current_date,
      lead_row.is_sample,
      case when lead_row.is_sample then nullif(replace(lead_row.source_key, 'demo:', ''), '') else null end,
      case when lead_row.is_sample then 'not_configured' else null end
    )
    returning * into client_row;
    created_client := true;
  end if;

  select * into onboarding_row
    from public.onboarding_records existing_onboarding
   where existing_onboarding.client_id = client_row.id;

  if onboarding_row.id is null then
    insert into public.onboarding_records (
      user_id, client_id, business, customer_handling, technical,
      automation_goals, status, progress
    ) values (
      p_workspace_id,
      client_row.id,
      jsonb_build_object(
        'business_name', lead_row.business_name,
        'service_type', coalesce(lead_row.service_type, lead_row.category, ''),
        'example', lead_row.is_sample
      ),
      '{}'::jsonb,
      jsonb_build_object('current_tools', coalesce(lead_row.current_tools, '{}'::jsonb)),
      jsonb_build_object(
        'pain_points', to_jsonb(coalesce(lead_row.pain_points, '{}'::text[])),
        'opportunity_tags', to_jsonb(coalesce(lead_row.opportunity_tags, '{}'::text[]))
      ),
      'not_started',
      0
    )
    returning * into onboarding_row;
  end if;

  select * into project_row
    from public.projects existing_project
   where existing_project.client_id = client_row.id
     and existing_project.automation_type = 'Unlimited AI receptionist / appointment booking'
   order by existing_project.created_at
   limit 1;

  if project_row.id is null then
    insert into public.projects (
      user_id, client_id, owner_id, name, status, automation_type,
      complexity, start_date, progress, requirements
    ) values (
      p_workspace_id,
      client_row.id,
      lead_row.assigned_team_member_id,
      lead_row.business_name || ' - AI receptionist',
      'discovery',
      'Unlimited AI receptionist / appointment booking',
      'standard',
      current_date,
      0,
      jsonb_build_object(
        'pain_points', to_jsonb(coalesce(lead_row.pain_points, '{}'::text[])),
        'opportunity_tags', to_jsonb(coalesce(lead_row.opportunity_tags, '{}'::text[]))
      )
    )
    returning * into project_row;
  end if;

  update public.leads stored_lead
     set status = 'won',
         stage_entered_at = case when previous_status = 'won' then stored_lead.stage_entered_at else now() end,
         updated_at = now()
   where stored_lead.id = lead_row.id
     and stored_lead.user_id = p_workspace_id
  returning * into lead_row;

  if previous_status <> 'won' or created_client then
    insert into public.activity_log (
      user_id, type, title, detail, actor_type, lead_id, client_id, project_id, metadata
    ) values (
      p_workspace_id,
      'client_created',
      'Won lead converted',
      lead_row.business_name || ' - onboarding and project created',
      'user',
      lead_row.id,
      client_row.id,
      project_row.id,
      jsonb_build_object('actor_member_id', actor_row.id, 'atomic_conversion', true)
    )
    returning * into activity_row;
  end if;

  return jsonb_build_object(
    'lead', to_jsonb(lead_row),
    'client', to_jsonb(client_row),
    'onboardingRecord', to_jsonb(onboarding_row),
    'project', to_jsonb(project_row),
    'activity', case when activity_row.id is null then null else to_jsonb(activity_row) end
  );
end;
$$;

revoke all on function public.convert_lead_to_client(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.convert_lead_to_client(uuid, uuid, uuid)
  to service_role;

-- Repair only the deliberately marked example lead that the prior seed promised
-- to convert. Historical real wins remain untouched for explicit review.
do $$
declare
  orphan_lead record;
  owner_member_id uuid;
begin
  for orphan_lead in
    select lead_row.user_id, lead_row.id
      from public.leads lead_row
      left join public.clients client_row on client_row.lead_id = lead_row.id
     where lead_row.status = 'won'
       and lead_row.is_sample = true
       and client_row.id is null
  loop
    select member_row.id into owner_member_id
      from public.team_members member_row
     where member_row.user_id = orphan_lead.user_id
       and member_row.status = 'active'
       and member_row.role = 'owner'
     order by member_row.created_at
     limit 1;

    if owner_member_id is not null then
      perform public.convert_lead_to_client(orphan_lead.user_id, orphan_lead.id, owner_member_id);
    end if;
  end loop;
end
$$;

-- The example agent and its historical example conversation can now be linked
-- without guessing from phone numbers or names supplied by a caller.
update public.voice_agents agent_row
   set client_id = client_row.id,
       updated_at = now()
  from public.clients client_row
  join public.leads lead_row on lead_row.id = client_row.lead_id
 where agent_row.user_id = client_row.user_id
   and agent_row.client_id is null
   and agent_row.is_example = true
   and client_row.is_example = true
   and agent_row.name = lead_row.business_name || ' - Example';

update public.voice_conversations conversation_row
   set client_id = agent_row.client_id,
       updated_at = now()
  from public.voice_agents agent_row
 where conversation_row.voice_agent_id = agent_row.id
   and conversation_row.user_id = agent_row.user_id
   and conversation_row.client_id is null
   and agent_row.client_id is not null;

-- Repair the visibly corrupted example note with plain ASCII so deployment
-- encoding cannot reintroduce mojibake.
update public.leads
   set notes = 'EXAMPLE DATA - not a real prospect or customer.'
 where source_key = 'demo:cactus-wrench-roofing'
   and is_sample = true;

commit;
