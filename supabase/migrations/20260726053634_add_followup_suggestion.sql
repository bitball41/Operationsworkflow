alter table public.follow_ups
  add column if not exists suggested_text text;
