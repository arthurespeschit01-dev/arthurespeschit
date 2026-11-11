create function public.agency_whatsapp_phone_key(value text) returns text
language sql immutable security invoker set search_path = '' as $$
  with digits as (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as n),
  complete as (select case when length(n) in (10,11) then '55' || n else n end as n from digits)
  select case when n ~ '^55[0-9]{10,11}$' then substring(n from 3 for 2) || right(n,8) else n end from complete;
$$;
create table public.agency_whatsapp_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  instance_id text not null unique check(length(instance_id) between 1 and 160),
  token text not null,
  webhook_secret text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  receiving_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.agency_whatsapp_connections enable row level security;
revoke all on public.agency_whatsapp_connections from public, anon, authenticated;
grant select, insert, update, delete on public.agency_whatsapp_connections to service_role;

alter table public.agency_pipeline_cards add column whatsapp_phone_key text
  generated always as (public.agency_whatsapp_phone_key(phone)) stored;
create index agency_cards_whatsapp on public.agency_pipeline_cards(user_id, whatsapp_phone_key);
grant select, update on public.agency_pipeline_cards to service_role;
grant select on public.agency_pipelines to service_role;

create table public.agency_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid,
  provider_message_id text,
  phone text not null check(phone ~ '^[0-9]{10,15}$'),
  phone_key text generated always as (public.agency_whatsapp_phone_key(phone)) stored,
  direction text not null check(direction in ('entrada','saida')),
  status text not null check(status in ('recebido','enviando','enviado','erro')),
  body text not null check(length(body) between 1 and 10000),
  kind text not null default 'texto' check(kind in ('texto','imagem','audio','video','documento')),
  created_at timestamptz not null default now(),
  unique(user_id, provider_message_id), unique(user_id, request_id)
);
create index agency_whatsapp_messages_owner_phone on public.agency_whatsapp_messages(user_id, phone_key, created_at desc);
alter table public.agency_whatsapp_messages enable row level security;
revoke all on public.agency_whatsapp_messages from public, anon, authenticated;
grant select on public.agency_whatsapp_messages to authenticated;
grant select, insert, update, delete on public.agency_whatsapp_messages to service_role;
create policy whatsapp_messages_owner on public.agency_whatsapp_messages for select to authenticated using ((select auth.uid()) = user_id);

create function public.agency_whatsapp_update_card() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('recebido','enviado') then
    update public.agency_pipeline_cards set contact_status = case when new.direction = 'entrada' then 'aguardando_agencia' else 'aguardando_cliente' end
    where user_id = new.user_id and whatsapp_phone_key = new.phone_key
      and pipeline_id in (select id from public.agency_pipelines where area = 'comercial' and user_id = new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.agency_whatsapp_update_card() from public, anon, authenticated;
create trigger agency_whatsapp_update_card after insert or update of status on public.agency_whatsapp_messages
  for each row execute function public.agency_whatsapp_update_card();
