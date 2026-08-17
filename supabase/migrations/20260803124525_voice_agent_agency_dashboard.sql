begin;

-- The business now has one offer. Preserve historical paid records, while
-- making every new/open record use the voice-agent package by default.
alter table public.leads
  alter column quoted_setup_fee set default 2500,
  alter column quoted_monthly_fee set default 997;

alter table public.clients
  alter column package_name set default 'Unlimited AI Receptionist & Appointment Booking',
  alter column agreed_price set default 2500,
  alter column setup_fee set default 2500,
  alter column monthly_fee set default 997;

alter table public.maintenance_subscriptions
  alter column plan_name set default 'Unlimited AI Receptionist & Appointment Booking',
  alter column monthly_amount set default 997;

alter table public.team_members
  alter column commission_rate set default 0.14,
  alter column commission_min set default 350,
  alter column commission_max set default 350;

update public.team_members
set commission_rate = 0.14,
    commission_min = 350,
    commission_max = 350,
    updated_at = now()
where role = 'salesperson'
  and (commission_rate <> 0.14 or commission_min <> 350 or commission_max <> 350);

update public.leads
set service_type = 'Unlimited AI Receptionist & Appointment Booking',
    quoted_setup_fee = 2500,
    quoted_monthly_fee = 997,
    updated_at = now()
where status not in ('won', 'lost');

update public.clients
set package_name = 'Unlimited AI Receptionist & Appointment Booking',
    agreed_price = 2500,
    setup_fee = 2500,
    monthly_fee = 997,
    updated_at = now()
where status in ('onboarding', 'awaiting_content', 'ready_to_launch');

update public.maintenance_subscriptions
set plan_name = 'Unlimited AI Receptionist & Appointment Booking',
    monthly_amount = 997,
    included_usage = null,
    overage_rate = null,
    updated_at = now()
where status in ('active', 'inactive', 'past_due');

update public.profiles
set preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object(
      'package_name', 'Unlimited AI Receptionist & Appointment Booking',
      'default_setup_fee', 2500,
      'default_monthly_fee', 997,
      'commission_amount', 350
    ),
    updated_at = now();

update public.settings
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
      'package_name', 'Unlimited AI Receptionist & Appointment Booking',
      'default_setup_fee', 2500,
      'default_monthly_fee', 997,
      'commission_amount', 350
    ),
    updated_at = now()
where key = 'workspace';

-- A commission exists once per client and only after the full activation fee
-- has been collected. This protects webhook and direct Worker write paths from
-- awarding $350 for each partial payment.
create or replace function public.enforce_voice_agency_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_fee numeric(12,2);
  collected numeric(12,2);
begin
  if new.client_id is null then
    return null;
  end if;

  select coalesce(client_row.setup_fee, client_row.agreed_price, 2500)
    into activation_fee
    from public.clients client_row
   where client_row.id = new.client_id
     and client_row.user_id = new.user_id;

  if activation_fee is null then
    return null;
  end if;

  select coalesce(sum(payment_row.amount), 0)
    into collected
    from public.payments payment_row
   where payment_row.user_id = new.user_id
     and payment_row.client_id = new.client_id
     and payment_row.payment_type = 'setup_fee'
     and payment_row.status in ('paid', 'available');

  if collected < activation_fee then
    return null;
  end if;

  if exists (
    select 1
      from public.commissions commission_row
     where commission_row.user_id = new.user_id
       and commission_row.client_id = new.client_id
       and commission_row.status <> 'reversed'
  ) then
    return null;
  end if;

  new.collected_setup_revenue := collected;
  new.commission_rate := 0.14;
  new.commission_min := 350;
  new.commission_max := 350;
  new.status := 'earned';
  new.earned_at := coalesce(new.earned_at, now());
  return new;
end;
$$;

revoke all on function public.enforce_voice_agency_commission() from public, anon, authenticated;

drop trigger if exists enforce_voice_agency_commission_before_insert on public.commissions;
create trigger enforce_voice_agency_commission_before_insert
before insert on public.commissions
for each row execute function public.enforce_voice_agency_commission();

create or replace function public.reverse_voice_agency_commission_after_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_fee numeric(12,2);
  collected numeric(12,2);
begin
  if new.client_id is null or new.payment_type <> 'setup_fee' then
    return new;
  end if;

  select coalesce(client_row.setup_fee, client_row.agreed_price, 2500)
    into activation_fee
    from public.clients client_row
   where client_row.id = new.client_id
     and client_row.user_id = new.user_id;

  select coalesce(sum(payment_row.amount), 0)
    into collected
    from public.payments payment_row
   where payment_row.user_id = new.user_id
     and payment_row.client_id = new.client_id
     and payment_row.payment_type = 'setup_fee'
     and payment_row.status in ('paid', 'available');

  if activation_fee is not null and collected < activation_fee then
    update public.commissions
       set status = 'reversed', reversed_at = now(), updated_at = now()
     where user_id = new.user_id
       and client_id = new.client_id
       and status <> 'reversed';
  end if;
  return new;
end;
$$;

revoke all on function public.reverse_voice_agency_commission_after_refund() from public, anon, authenticated;

drop trigger if exists reverse_voice_agency_commission_after_payment_change on public.payments;
create trigger reverse_voice_agency_commission_after_payment_change
after insert or update of amount, status, payment_type, client_id on public.payments
for each row execute function public.reverse_voice_agency_commission_after_refund();

update public.commissions
set commission_rate = 0.14,
    commission_min = 350,
    commission_max = 350,
    updated_at = now()
where status in ('pending', 'earned');

-- Preserve assistant history. Current prompts and tools are enforced in the
-- application; historical conversations remain user-owned workspace data.

commit;
