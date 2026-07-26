-- Cover the relationship columns used by detail views, filters and cascade
-- maintenance. User/status/time composite indexes remain separate because they
-- serve the owner-scoped list views.

create index if not exists activity_log_client_id_idx on public.activity_log (client_id);
create index if not exists activity_log_lead_id_idx on public.activity_log (lead_id);
create index if not exists activity_log_project_id_idx on public.activity_log (project_id);

create index if not exists ai_usage_client_id_idx on public.ai_usage (client_id);
create index if not exists ai_usage_lead_id_idx on public.ai_usage (lead_id);

create index if not exists calendar_events_client_id_idx on public.calendar_events (client_id);
create index if not exists calendar_events_lead_id_idx on public.calendar_events (lead_id);
create index if not exists calendar_events_project_id_idx on public.calendar_events (project_id);

create index if not exists client_sites_client_id_idx on public.client_sites (client_id);
create index if not exists client_sites_demo_id_idx on public.client_sites (demo_id);
create index if not exists client_sites_user_id_idx on public.client_sites (user_id);

create index if not exists demos_lead_id_idx on public.demos (lead_id);

create index if not exists deployments_client_id_idx on public.deployments (client_id);
create index if not exists deployments_demo_id_idx on public.deployments (demo_id);
create index if not exists deployments_site_id_idx on public.deployments (site_id);

create index if not exists email_threads_client_id_idx on public.email_threads (client_id);
create index if not exists email_threads_lead_id_idx on public.email_threads (lead_id);
create index if not exists emails_lead_id_idx on public.emails (lead_id);
create index if not exists emails_user_id_idx on public.emails (user_id);

create index if not exists expenses_client_id_idx on public.expenses (client_id);
create index if not exists expenses_lead_id_idx on public.expenses (lead_id);

create index if not exists discovery_results_duplicate_lead_idx
  on public.lead_discovery_results (duplicate_of_lead_id);
create index if not exists discovery_results_lead_id_idx
  on public.lead_discovery_results (lead_id);

create index if not exists maintenance_requests_subscription_id_idx
  on public.maintenance_requests (subscription_id);
create index if not exists maintenance_requests_user_id_idx
  on public.maintenance_requests (user_id);
create index if not exists maintenance_subscriptions_client_id_idx
  on public.maintenance_subscriptions (client_id);
create index if not exists maintenance_subscriptions_site_id_idx
  on public.maintenance_subscriptions (site_id);

create index if not exists notes_client_id_idx on public.notes (client_id);
create index if not exists notes_lead_id_idx on public.notes (lead_id);

create index if not exists payments_client_id_idx on public.payments (client_id);
create index if not exists payments_maintenance_subscription_id_idx
  on public.payments (maintenance_subscription_id);

create index if not exists project_tasks_project_id_idx on public.project_tasks (project_id);
create index if not exists project_tasks_user_id_idx on public.project_tasks (user_id);
create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists projects_site_id_idx on public.projects (site_id);

create index if not exists tasks_client_id_idx on public.tasks (client_id);
create index if not exists tasks_lead_id_idx on public.tasks (lead_id);
create index if not exists tasks_project_id_idx on public.tasks (project_id);
