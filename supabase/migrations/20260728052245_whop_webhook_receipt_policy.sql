create policy "service_role_only_receipts"
  on public.whop_webhook_events
  for all
  to service_role
  using (true)
  with check (true);
