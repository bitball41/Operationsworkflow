begin;

-- Cover foreign-key checks with the referenced columns first. The broader
-- agency query indexes keep their separate workspace/status ordering.
create index if not exists leads_assigned_team_member_idx
  on public.leads (assigned_team_member_id);

create index if not exists knowledge_entries_workspace_idx
  on public.knowledge_entries (user_id, updated_at desc);

commit;
