-- Outreach drafts move through draft -> ready -> sent, and can fail on send.
-- The dashboard and the automation engine both use these states, so they are
-- part of the schema instead of being approximated with approval records.

alter table public.message_drafts
  add column if not exists error_message text,
  add column if not exists sent_by text;

alter table public.message_drafts drop constraint if exists message_drafts_status_check;
alter table public.message_drafts add constraint message_drafts_status_check check (
  status in ('draft', 'ready', 'pending_approval', 'approved', 'changes_requested', 'scheduled', 'sent', 'failed', 'cancelled')
);

create index if not exists message_drafts_user_status_idx
  on public.message_drafts (user_id, status, updated_at desc);

create index if not exists message_drafts_user_sent_idx
  on public.message_drafts (user_id, sent_at desc)
  where sent_at is not null;
