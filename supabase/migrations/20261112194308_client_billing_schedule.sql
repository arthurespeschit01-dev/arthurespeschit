-- Existing dates and invoices are deliberately left untouched.
alter table public.clients add column entry_date date, add column first_payment_date date;
alter table public.clients add constraint client_billing_dates_valid check(first_payment_date is null or entry_date is null or first_payment_date>=entry_date);
create function public.agency_first_billing_date(p_entry date,p_day integer) returns date language plpgsql immutable security invoker set search_path='' as $$
declare candidate date;month_start date:=date_trunc('month',p_entry)::date;
begin
 if p_day not between 1 and 31 then raise exception 'Dia de pagamento deve estar entre 1 e 31';end if;
 candidate:=month_start+least(p_day,extract(day from (month_start+interval '1 month - 1 day'))::int)-1;
 if candidate<p_entry then month_start:=(month_start+interval '1 month')::date;candidate:=month_start+least(p_day,extract(day from (month_start+interval '1 month - 1 day'))::int)-1;end if;
 return candidate;
end;$$;
revoke all on function public.agency_first_billing_date(date,integer) from public,anon;
grant execute on function public.agency_first_billing_date(date,integer) to authenticated;
create or replace function public.save_agency_client(p_id uuid,p_client jsonb,p_operation jsonb default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_client public.clients%rowtype; v_pipeline uuid; v_stage uuid; v_card uuid; v_phase text; v_stages jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
 if jsonb_typeof(p_client) is distinct from 'object' then raise exception 'Dados de cliente inválidos'; end if;
 if p_client ? 'name' and nullif(trim(p_client->>'name'),'') is null then raise exception 'Informe o nome do cliente'; end if;
 if p_client ? 'payment_day' and (p_client->>'payment_day')::integer not between 1 and 31 then raise exception 'Dia de pagamento deve estar entre 1 e 31';end if;
 if p_id is null then
  insert into public.clients(user_id,name,services,monthly_fee,contract_duration,status,payment_day,account_ids,verba_mensal,niche,phone,entry_date,first_payment_date)
  values(auth.uid(),p_client->>'name',coalesce(p_client->>'services',''),coalesce((p_client->>'monthly_fee')::numeric,0),coalesce(p_client->>'contract_duration',''),coalesce(p_client->>'status','Ativo'),(p_client->>'payment_day')::integer,coalesce(p_client->'account_ids','{}'::jsonb),coalesce((p_client->>'verba_mensal')::numeric,0),coalesce(p_client->>'niche',''),coalesce(p_client->>'phone',''),coalesce(nullif(p_client->>'entry_date','')::date,(now() at time zone 'America/Sao_Paulo')::date),coalesce(nullif(p_client->>'first_payment_date','')::date,public.agency_first_billing_date(coalesce(nullif(p_client->>'entry_date','')::date,(now() at time zone 'America/Sao_Paulo')::date),coalesce((p_client->>'payment_day')::integer,5)))) returning id into v_id;
 else
  select * into v_client from public.clients where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Cliente não encontrado'; end if;
  v_client:=jsonb_populate_record(v_client,p_client - 'id' - 'user_id' - 'organization_id' - 'created_at');
  update public.clients set name=v_client.name,services=v_client.services,monthly_fee=v_client.monthly_fee,
   contract_duration=v_client.contract_duration,status=v_client.status,payment_day=v_client.payment_day,
   account_ids=v_client.account_ids,verba_mensal=v_client.verba_mensal,niche=v_client.niche,phone=v_client.phone,entry_date=v_client.entry_date,first_payment_date=v_client.first_payment_date
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

-- Generates only missing invoices, serializes concurrent requests, and never modifies paid/history rows.
create function public.ensure_agency_monthly_invoices(p_month date) returns setof public.mensalidades language plpgsql security invoker set search_path='' as $$
declare month_start date:=date_trunc('month',p_month)::date;month_end date:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 if p_month is null then raise exception 'Informe o mês';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||month_start::text,0));
 insert into public.mensalidades(user_id,cliente_id,valor,vencimento,status)
 select auth.uid(),c.id,c.monthly_fee,d.due_date,case when d.due_date<today then 'atrasado' else 'pendente' end
 from public.clients c cross join lateral(select case when c.first_payment_date between month_start and month_end then c.first_payment_date else month_start+least(greatest(1,least(31,coalesce(c.payment_day,5))),extract(day from month_end)::int)-1 end due_date)d
 where c.user_id=auth.uid() and c.status='Ativo' and c.monthly_fee>0
 and (coalesce(c.first_payment_date,c.entry_date) is null or d.due_date>=coalesce(c.first_payment_date,c.entry_date))
 and not exists(select 1 from public.mensalidades m where m.cliente_id=c.id and m.user_id=auth.uid() and m.vencimento between month_start and month_end)
 on conflict(cliente_id,vencimento) do nothing;
 return query select * from public.mensalidades where user_id=auth.uid() and vencimento between month_start and month_end order by vencimento,id;
end;$$;
revoke all on function public.ensure_agency_monthly_invoices(date) from public,anon;
grant execute on function public.ensure_agency_monthly_invoices(date) to authenticated;

-- Also protects against clients still running an older frontend during rollout.
create function public.agency_invoice_schedule_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare first_due date;
begin
 select coalesce(first_payment_date,entry_date) into first_due from public.clients where id=new.cliente_id and user_id=new.user_id;
 if first_due is not null and new.vencimento<first_due then raise exception 'A mensalidade não pode vencer antes do primeiro vencimento combinado';end if;
 return new;
end;$$;
revoke all on function public.agency_invoice_schedule_guard() from public,anon,authenticated;
create trigger agency_invoice_schedule_guard before insert on public.mensalidades for each row execute function public.agency_invoice_schedule_guard();
