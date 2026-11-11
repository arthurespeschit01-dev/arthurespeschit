-- Additive release: no existing clients, cards, tasks, credentials or payments are rewritten.
alter table public.agency_pipeline_stages add column outcome text
  check (outcome in ('in_progress','completed','won','lost'));

create function public.agency_stage_outcome(p_outcome text, p_name text) returns text
language sql immutable security invoker set search_path = '' as $$
  select coalesce(p_outcome, case
    when lower(trim(p_name)) in ('concluído','concluido','concluída','concluida','finalizado','finalizada') then 'completed'
    when lower(trim(p_name)) in ('ganho','ganha','venda','vendido','fechado') then 'won'
    when lower(trim(p_name)) in ('perdido','perdida') then 'lost'
    else 'in_progress' end);
$$;
revoke all on function public.agency_stage_outcome(text,text) from public, anon;
grant execute on function public.agency_stage_outcome(text,text) to authenticated, service_role;

create table public.agency_client_progress (
 client_id uuid primary key references public.clients(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 card_id uuid references public.agency_pipeline_cards(id) on delete restrict,
 phase text not null check (phase in ('onboarding','execution')),
 updated_at timestamptz not null default now()
);
create index agency_client_progress_owner on public.agency_client_progress(user_id);
create index agency_client_progress_card on public.agency_client_progress(card_id);
alter table public.agency_client_progress enable row level security;
create policy agency_client_progress_owner on public.agency_client_progress for all to authenticated
 using ((select auth.uid())=user_id)
 with check ((select auth.uid())=user_id
 and exists(select 1 from public.clients c where c.id=client_id and c.user_id=(select auth.uid()))
 and (card_id is null or exists(select 1 from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id
 where c.id=card_id and c.client_id=agency_client_progress.client_id and c.user_id=(select auth.uid()) and p.area='operacao')));
revoke all on public.agency_client_progress from public, anon;
grant select,insert,update on public.agency_client_progress to authenticated;

create view public.agency_client_progress_view with (security_invoker=true) as
 select x.client_id,x.user_id,x.card_id,
 case when c.id is not null then case when public.agency_stage_outcome(s.outcome,s.name)='completed' then 'execution' else 'onboarding' end else x.phase end as phase,
 c.pipeline_id,c.stage_id,s.name as stage_name,p.name as pipeline_name
 from public.agency_client_progress x
 left join public.agency_pipeline_cards c on c.id=x.card_id and c.client_id=x.client_id and c.user_id=x.user_id
 left join public.agency_pipeline_stages s on s.id=c.stage_id
 left join public.agency_pipelines p on p.id=c.pipeline_id;
revoke all on public.agency_client_progress_view from public, anon;
grant select on public.agency_client_progress_view to authenticated;

create function public.agency_sync_client_progress() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_phase text;
begin
 if new.client_id is null or not exists(select 1 from public.agency_pipelines p where p.id=new.pipeline_id and p.area='operacao' and p.user_id=new.user_id) then return new; end if;
 select case when public.agency_stage_outcome(s.outcome,s.name)='completed' then 'execution' else 'onboarding' end into v_phase
 from public.agency_pipeline_stages s where s.id=new.stage_id;
 insert into public.agency_client_progress(client_id,user_id,card_id,phase)
 values(new.client_id,new.user_id,new.id,v_phase)
 on conflict(client_id) do update set phase=excluded.phase, card_id=excluded.card_id, updated_at=now()
 where public.agency_client_progress.card_id=new.id or public.agency_client_progress.card_id is null;
 return new;
end; $$;
revoke all on function public.agency_sync_client_progress() from public, anon, authenticated;
create trigger agency_sync_client_progress after insert or update of stage_id,pipeline_id on public.agency_pipeline_cards
 for each row execute function public.agency_sync_client_progress();

-- A canonical onboarding card stays attached to its original client.
create function public.agency_guard_progress_client() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.agency_client_progress where card_id=old.id) and (new.client_id is distinct from old.client_id or not exists(select 1 from public.agency_pipelines p where p.id=new.pipeline_id and p.area='operacao' and p.user_id=new.user_id)) then
  raise exception 'O card de onboarding está vinculado ao cadastro do cliente';
 end if;
 return new;
end; $$;
revoke all on function public.agency_guard_progress_client() from public,anon,authenticated;
create trigger agency_guard_progress_client before update of client_id,pipeline_id on public.agency_pipeline_cards
 for each row execute function public.agency_guard_progress_client();

create table public.agency_appointments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid references public.clients(id) on delete restrict,
 title text not null check(length(trim(title)) between 1 and 160),
 starts_at timestamptz not null, ends_at timestamptz not null,
 notes text not null default '' check(length(notes)<=10000),
 status text not null default 'agendado' check(status in ('agendado','concluido','cancelado')),
 created_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create index agency_appointments_owner_start on public.agency_appointments(user_id,starts_at);
create index agency_appointments_client on public.agency_appointments(client_id);
alter table public.agency_appointments enable row level security;
create policy agency_appointments_owner on public.agency_appointments for all to authenticated
 using ((select auth.uid())=user_id)
 with check ((select auth.uid())=user_id and (client_id is null or exists(select 1 from public.clients c where c.id=client_id and c.user_id=(select auth.uid()))));
revoke all on public.agency_appointments from public,anon;
grant select,insert,update on public.agency_appointments to authenticated;

create or replace function public.save_agency_pipeline(
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
    insert into public.agency_pipeline_stages(id, user_id, pipeline_id, name, color, position, outcome)
    values ((stage_json->>'id')::uuid, auth.uid(), pipeline_uuid, trim(stage_json->>'name'), stage_json->>'color', (stage_json->>'position')::integer, stage_json->>'outcome')
    on conflict (id) do update set name = excluded.name, color = excluded.color, position = excluded.position, outcome = excluded.outcome
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

-- Client details and their onboarding assignment are saved atomically under the caller's RLS.
create function public.save_agency_client(p_id uuid,p_client jsonb,p_operation jsonb default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_client public.clients%rowtype; v_pipeline uuid; v_stage uuid; v_card uuid; v_phase text; v_stages jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
 if jsonb_typeof(p_client) is distinct from 'object' then raise exception 'Dados de cliente inválidos'; end if;
 if p_client ? 'name' and nullif(trim(p_client->>'name'),'') is null then raise exception 'Informe o nome do cliente'; end if;
 if p_id is null then
  insert into public.clients(user_id,name,services,monthly_fee,contract_duration,status,payment_day,account_ids,verba_mensal,niche,phone)
  values(auth.uid(),p_client->>'name',coalesce(p_client->>'services',''),coalesce((p_client->>'monthly_fee')::numeric,0),coalesce(p_client->>'contract_duration',''),coalesce(p_client->>'status','Ativo'),(p_client->>'payment_day')::integer,coalesce(p_client->'account_ids','{}'::jsonb),coalesce((p_client->>'verba_mensal')::numeric,0),coalesce(p_client->>'niche',''),coalesce(p_client->>'phone','')) returning id into v_id;
 else
  select * into v_client from public.clients where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Cliente não encontrado'; end if;
  v_client:=jsonb_populate_record(v_client,p_client - 'id' - 'user_id' - 'organization_id' - 'created_at');
  update public.clients set name=v_client.name,services=v_client.services,monthly_fee=v_client.monthly_fee,
   contract_duration=v_client.contract_duration,status=v_client.status,payment_day=v_client.payment_day,
   account_ids=v_client.account_ids,verba_mensal=v_client.verba_mensal,niche=v_client.niche,phone=v_client.phone
   where id=p_id and user_id=auth.uid();
  v_id:=p_id;
 end if;
 if p_operation is null or p_operation='null'::jsonb then return v_id; end if;
 v_phase:=p_operation->>'phase';
 if v_phase not in ('onboarding','execution') or v_phase is null then raise exception 'Fase inválida'; end if;
 v_pipeline:=nullif(p_operation->>'pipeline_id','')::uuid;
 v_stage:=nullif(p_operation->>'stage_id','')::uuid;
 if v_pipeline is null and v_phase='execution' then
  insert into public.agency_client_progress(client_id,user_id,phase) values(v_id,auth.uid(),v_phase)
  on conflict(client_id) do update set phase=excluded.phase,card_id=null,updated_at=now();
  return v_id;
 end if;
 if v_pipeline is null then
  select id into v_pipeline from public.agency_pipelines where user_id=auth.uid() and area='operacao' order by created_at,id limit 1;
 end if;
 if v_pipeline is null then
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'name',name,'color','#8b5cf6','position',pos,'outcome',case when pos=4 then 'completed' else 'in_progress' end)) into v_stages
  from (values('Entrada',0),('Formulário enviado',1),('Briefing recebido',2),('Briefing analisado',3),('Concluído',4)) as t(name,pos);
  v_pipeline:=public.save_agency_pipeline(null,'operacao','Onboarding',0,v_stages,'{}');
 end if;
 if not exists(select 1 from public.agency_pipelines where id=v_pipeline and user_id=auth.uid() and area='operacao') then raise exception 'Pipeline inválida'; end if;
 if v_stage is null then
  select id into v_stage from public.agency_pipeline_stages where pipeline_id=v_pipeline and user_id=auth.uid()
   and (v_phase='onboarding' or public.agency_stage_outcome(outcome,name)='completed') order by position,id limit 1;
 end if;
 if not exists(select 1 from public.agency_pipeline_stages where id=v_stage and pipeline_id=v_pipeline and user_id=auth.uid()) then raise exception 'Escolha uma etapa válida'; end if;
 select card_id into v_card from public.agency_client_progress where client_id=v_id and user_id=auth.uid();
 if v_card is null then
  insert into public.agency_pipeline_cards(user_id,pipeline_id,stage_id,client_id,title)
  select auth.uid(),v_pipeline,v_stage,v_id,name from public.clients where id=v_id returning id into v_card;
 else
  update public.agency_pipeline_cards set pipeline_id=v_pipeline,stage_id=v_stage where id=v_card and user_id=auth.uid();
 end if;
 select case when public.agency_stage_outcome(outcome,name)='completed' then 'execution' else 'onboarding' end into v_phase from public.agency_pipeline_stages where id=v_stage;
 insert into public.agency_client_progress(client_id,user_id,card_id,phase) values(v_id,auth.uid(),v_card,v_phase)
 on conflict(client_id) do update set card_id=excluded.card_id,phase=excluded.phase,updated_at=now();
 return v_id;
end; $$;
revoke all on function public.save_agency_client(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_agency_client(uuid,jsonb,jsonb) to authenticated;
