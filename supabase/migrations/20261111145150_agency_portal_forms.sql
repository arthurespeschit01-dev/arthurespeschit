create table public.agency_client_portals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, client_id), unique (id, user_id, client_id)
);
create index agency_portals_client on public.agency_client_portals(client_id);
create table public.agency_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  portal_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 160),
  category text not null check (category in ('trafego', 'design', 'sugestao', 'reclamacao', 'outro')),
  description text not null check (length(trim(description)) between 1 and 10000),
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'aguardando_cliente', 'concluido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (portal_id, user_id, client_id) references public.agency_client_portals(id, user_id, client_id) on delete restrict,
  unique (id, user_id)
);
create index agency_tickets_owner on public.agency_tickets(user_id, created_at desc);
create index agency_tickets_portal on public.agency_tickets(portal_id, user_id, client_id);
create trigger agency_tickets_updated before update on public.agency_tickets for each row execute function public.update_updated_at_column();
create table public.agency_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid not null,
  sender text not null check (sender in ('cliente', 'agencia')),
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key(ticket_id, user_id) references public.agency_tickets(id, user_id) on delete cascade
);
create index agency_ticket_messages_owner on public.agency_ticket_messages(user_id, ticket_id, created_at);
create index agency_ticket_messages_ticket on public.agency_ticket_messages(ticket_id, user_id);
create function public.agency_ticket_message_received() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if new.sender = 'cliente' then
    update public.agency_tickets set status = 'em_andamento', updated_at = now()
      where id = new.ticket_id and user_id = new.user_id and status <> 'concluido';
    if not found then raise exception 'Chamado concluído ou indisponível'; end if;
  else
    update public.agency_tickets set updated_at = now()
      where id = new.ticket_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.agency_ticket_message_received() from public, anon, authenticated;
create trigger agency_ticket_message_received after insert on public.agency_ticket_messages
  for each row execute function public.agency_ticket_message_received();
create table public.agency_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 160),
  description text not null default '' check(length(description) <= 3000),
  fields jsonb not null check(jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) between 1 and 40),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(id, user_id)
);
create index agency_forms_owner on public.agency_forms(user_id);
create table public.agency_form_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  form_id uuid not null,
  answers jsonb not null check(jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now(),
  foreign key(form_id, user_id) references public.agency_forms(id, user_id) on delete restrict
);
create index agency_form_responses_owner on public.agency_form_responses(user_id, form_id, created_at desc);
create index agency_form_responses_form on public.agency_form_responses(form_id, user_id);

alter table public.agency_client_portals enable row level security;
alter table public.agency_tickets enable row level security;
alter table public.agency_ticket_messages enable row level security;
alter table public.agency_forms enable row level security;
alter table public.agency_form_responses enable row level security;
create policy portal_owner on public.agency_client_portals for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists(select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid())));
create policy ticket_owner on public.agency_tickets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ticket_message_read on public.agency_ticket_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy ticket_message_write on public.agency_ticket_messages for insert to authenticated with check ((select auth.uid()) = user_id and sender = 'agencia');
create policy form_owner on public.agency_forms for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy response_read on public.agency_form_responses for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.agency_client_portals, public.agency_tickets, public.agency_ticket_messages, public.agency_forms, public.agency_form_responses from anon;
grant select, insert, update on public.agency_client_portals, public.agency_tickets, public.agency_forms to authenticated;
grant select, insert on public.agency_ticket_messages to authenticated;
grant select on public.agency_form_responses to authenticated;
grant select, insert, update, delete on public.agency_client_portals, public.agency_tickets, public.agency_ticket_messages, public.agency_forms, public.agency_form_responses to service_role;
