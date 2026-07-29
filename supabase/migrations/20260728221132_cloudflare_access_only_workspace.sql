begin;

-- Cloudflare Access is the only human authentication boundary. Operational
-- rows keep their existing UUIDs but now belong to a neutral workspace record,
-- not to Supabase Auth accounts.
create table if not exists public.operations_workspaces (
  id uuid primary key,
  name text not null default 'Operations',
  created_at timestamptz not null default now()
);

alter table public.operations_workspaces enable row level security;
revoke all on table public.operations_workspaces from public, anon, authenticated;
grant select, insert, update, delete on table public.operations_workspaces to service_role;

do $$
declare
  relation record;
  source_column text;
begin
  for relation in
    select
      constraint_row.conname,
      constraint_row.conrelid,
      constraint_row.confdeltype,
      attribute_row.attname as source_column
    from pg_constraint constraint_row
    join pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
      and constraint_row.connamespace = 'public'::regnamespace
      and array_length(constraint_row.conkey, 1) = 1
  loop
    source_column := relation.source_column;

    execute format(
      'insert into public.operations_workspaces (id)
       select distinct %1$I from %2$s where %1$I is not null
       on conflict (id) do nothing',
      source_column,
      relation.conrelid::regclass
    );

    execute format(
      'alter table %s drop constraint %I',
      relation.conrelid::regclass,
      relation.conname
    );

    execute format(
      'alter table %s add constraint %I foreign key (%I)
       references public.operations_workspaces(id) on delete %s',
      relation.conrelid::regclass,
      relation.conname,
      source_column,
      case relation.confdeltype
        when 'c' then 'cascade'
        when 'n' then 'set null'
        when 'd' then 'set default'
        when 'r' then 'restrict'
        else 'no action'
      end
    );
  end loop;
end
$$;

comment on table public.operations_workspaces is
  'Single-user Operations workspaces. Authorization is enforced by Cloudflare Access and the Worker.';

-- Direct browser access is intentionally gone. RLS remains enabled as defense
-- in depth, while only the Worker's server-side Supabase role receives grants.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname in ('public', 'storage')
      and not ('service_role' = any(roles))
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on table storage.buckets, storage.objects from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- One RPC returns an atomic workspace snapshot in a single Worker subrequest.
-- It runs with the caller's privileges; only service_role can execute it.
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
      ('clients', 'clients', 'updated_at', false, 750),
      ('clientSites', 'client_sites', 'updated_at', false, 750),
      ('projects', 'projects', 'updated_at', false, 750),
      ('projectTasks', 'project_tasks', 'sort_order', true, 750),
      ('maintenanceSubscriptions', 'maintenance_subscriptions', 'updated_at', false, 750),
      ('maintenanceRequests', 'maintenance_requests', 'created_at', false, 750),
      ('payments', 'payments', 'created_at', false, 750),
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
