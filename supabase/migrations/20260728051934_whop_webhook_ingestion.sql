-- Whop events are delivered to the Worker. The browser never receives access
-- to this receipt table or the service-role-only ingestion function.

create unique index if not exists payments_whop_owner_transaction_unique
  on public.payments (user_id, source, external_transaction_id)
  where source = 'whop' and external_transaction_id is not null;

create table if not exists public.whop_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  payload_hash text not null,
  payment_id uuid references public.payments (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists whop_webhook_events_user_received_idx
  on public.whop_webhook_events (user_id, received_at desc);

alter table public.whop_webhook_events enable row level security;
revoke all on table public.whop_webhook_events from anon, authenticated;
grant all on table public.whop_webhook_events to service_role;

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
set search_path = public
as $$
declare
  receipt_id uuid;
  stored_payment public.payments%rowtype;
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
    user_id,
    payment_type,
    customer_name,
    amount,
    fee_amount,
    status,
    refund_state,
    source,
    external_transaction_id,
    paid_at
  ) values (
    p_user_id,
    coalesce(p_payment ->> 'payment_type', 'website_sale'),
    coalesce(nullif(p_payment ->> 'customer_name', ''), 'Whop customer'),
    coalesce((p_payment ->> 'amount')::numeric, 0),
    coalesce((p_payment ->> 'fee_amount')::numeric, 0),
    coalesce(p_payment ->> 'status', 'pending'),
    p_payment ->> 'refund_state',
    'whop',
    p_payment ->> 'external_transaction_id',
    nullif(p_payment ->> 'paid_at', '')::timestamptz
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
    paid_at = excluded.paid_at
  returning * into stored_payment;

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
