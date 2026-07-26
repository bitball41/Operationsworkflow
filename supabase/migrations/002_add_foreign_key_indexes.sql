-- Cover remaining foreign keys reported by the Supabase performance advisor.

create index if not exists agent_events_run_idx
  on public.agent_events (run_id)
  where run_id is not null;

create index if not exists communications_user_idx
  on public.communications (user_id);

create index if not exists communications_draft_idx
  on public.communications (draft_id)
  where draft_id is not null;

create index if not exists cost_events_run_idx
  on public.cost_events (run_id)
  where run_id is not null;

create index if not exists demo_versions_user_idx
  on public.demo_versions (user_id);

create index if not exists demos_template_idx
  on public.demos (template_id)
  where template_id is not null;

create index if not exists follow_ups_lead_idx
  on public.follow_ups (lead_id);

create index if not exists follow_ups_draft_idx
  on public.follow_ups (draft_id)
  where draft_id is not null;

create index if not exists message_drafts_lead_idx
  on public.message_drafts (lead_id);

