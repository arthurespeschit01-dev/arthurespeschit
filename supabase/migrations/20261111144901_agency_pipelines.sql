-- Agency-specific CRM/operation boards. No data is imported from Vértice.
create table public.agency_pipelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null check (area in ('comercial', 'operacao')),
  name text not null check (length(trim(name)) between 1 and 100),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index agency_pipelines_owner_area on public.agency_pipelines (user_id, area);

create table public.agency_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  color text not null default '#8b5cf6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  foreign key (pipeline_id, user_id) references public.agency_pipelines(id, user_id) on delete cascade,
  unique (id, pipeline_id, user_id)
);
create index agency_stages_owner_pipeline on public.agency_pipeline_stages (user_id, pipeline_id, position);
create index agency_stages_pipeline on public.agency_pipeline_stages (pipeline_id, user_id);

create table public.agency_pipeline_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pipeline_id uuid not null,
  stage_id uuid not null,
  client_id uuid references public.clients(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  phone text not null default '' check (length(phone) <= 40),
  notes text not null default '' check (length(notes) <= 10000),
  value numeric(14,2) not null default 0 check (value >= 0 and value <> 'NaN'::numeric),
  contact_status text not null default 'novo' check (contact_status in ('novo', 'aguardando_cliente', 'aguardando_agencia', 'respondido')),
  meeting_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (stage_id, pipeline_id, user_id) references public.agency_pipeline_stages(id, pipeline_id, user_id) on delete restrict
);
create index agency_cards_owner_pipeline on public.agency_pipeline_cards (user_id, pipeline_id, updated_at desc);
create index agency_cards_stage on public.agency_pipeline_cards (stage_id, pipeline_id, user_id);
create index agency_cards_client on public.agency_pipeline_cards (client_id);
create trigger agency_cards_updated before update on public.agency_pipeline_cards
  for each row execute function public.update_updated_at_column();

alter table public.agency_pipelines enable row level security;
alter table public.agency_pipeline_stages enable row level security;
alter table public.agency_pipeline_cards enable row level security;
create policy agency_pipeline_owner on public.agency_pipelines for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agency_stage_owner on public.agency_pipeline_stages for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agency_card_owner on public.agency_pipeline_cards for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid())))
    and exists (select 1 from public.agency_pipelines p where p.id = pipeline_id and p.user_id = (select auth.uid()) and (p.area = 'comercial' or client_id is not null))
  );
revoke all on public.agency_pipelines, public.agency_pipeline_stages, public.agency_pipeline_cards from anon;
grant select, insert, update, delete on public.agency_pipelines, public.agency_pipeline_stages, public.agency_pipeline_cards to authenticated;

-- One transaction: create/edit stages, relocate cards, remove old stages.
-- Invoker privileges retain RLS. Revision prevents overwriting a concurrent edit.
create function public.save_agency_pipeline(
  p_id uuid, p_area text, p_name text, p_revision integer, p_stages jsonb, p_moves jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  pipeline_uuid uuid;
  current_revision integer;
  stage_json jsonb;
  kept_ids uuid[];
  old_stage record;
  destination uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  if p_area not in ('comercial', 'operacao') or p_area is null then raise exception 'Área inválida'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Nome inválido'; end if;
  if jsonb_typeof(p_stages) is distinct from 'array' then raise exception 'Etapas inválidas'; end if;
  if jsonb_array_length(p_stages) not between 1 and 40 then raise exception 'Informe de 1 a 40 etapas'; end if;
  select array_agg((s->>'id')::uuid) into kept_ids from jsonb_array_elements(p_stages) s;
  if exists (select 1 from unnest(kept_ids) id group by id having count(*) > 1) or array_position(kept_ids, null) is not null then
    raise exception 'IDs de etapas inválidos';
  end if;
  if p_id is null then
    insert into public.agency_pipelines(user_id, area, name) values (auth.uid(), p_area, trim(p_name)) returning id into pipeline_uuid;
  else
    select id, revision into pipeline_uuid, current_revision from public.agency_pipelines
      where id = p_id and user_id = auth.uid() and area = p_area for update;
    if not found then raise exception 'Pipeline não encontrada'; end if;
    if p_revision is distinct from current_revision then raise exception 'Pipeline alterada em outra sessão'; end if;
    update public.agency_pipelines set name = trim(p_name), revision = revision + 1 where id = pipeline_uuid;
  end if;
  for stage_json in select value from jsonb_array_elements(p_stages) loop
    insert into public.agency_pipeline_stages(id, user_id, pipeline_id, name, color, position)
    values ((stage_json->>'id')::uuid, auth.uid(), pipeline_uuid, trim(stage_json->>'name'), stage_json->>'color', (stage_json->>'position')::integer)
    on conflict (id) do update set name = excluded.name, color = excluded.color, position = excluded.position
      where public.agency_pipeline_stages.pipeline_id = pipeline_uuid and public.agency_pipeline_stages.user_id = auth.uid();
    if not found then raise exception 'Etapa pertence a outra pipeline'; end if;
  end loop;
  for old_stage in select id from public.agency_pipeline_stages where pipeline_id = pipeline_uuid and not (id = any(kept_ids)) for update loop
    if exists (select 1 from public.agency_pipeline_cards where stage_id = old_stage.id) then
      destination := (p_moves->>old_stage.id::text)::uuid;
      if destination is null or not (destination = any(kept_ids)) then raise exception 'Escolha o destino dos cards da etapa removida'; end if;
      update public.agency_pipeline_cards set stage_id = destination where stage_id = old_stage.id;
    end if;
    delete from public.agency_pipeline_stages where id = old_stage.id;
  end loop;
  return pipeline_uuid;
end;
$$;
revoke all on function public.save_agency_pipeline(uuid, text, text, integer, jsonb, jsonb) from public, anon;
grant execute on function public.save_agency_pipeline(uuid, text, text, integer, jsonb, jsonb) to authenticated;
