-- Additive metadata only. No existing task or historical record is rewritten/deleted.
alter table public.operational_tasks
 add column assignee_user_id uuid references auth.users(id) on delete set null,
 add column area text not null default '' check(area in('','Tráfego','Design','Edição','Conteúdo','Atendimento','Comercial','Gestão','Outros')),
 add column recurrence_anchor date;
create index operational_tasks_schedule on public.operational_tasks(user_id,status,start_date,end_date);
create function public.agency_task_current_day() returns date language sql stable security invoker set search_path='' as $$select (now() at time zone 'America/Sao_Paulo')::date$$;
revoke all on function public.agency_task_current_day() from public,anon;
grant execute on function public.agency_task_current_day() to authenticated,service_role;

-- Select ONE future cycle directly, preserving the original calendar phase.
create function public.agency_task_next_cycle(p_anchor date,p_kind text,p_interval integer,p_days jsonb,p_after date) returns date
 language plpgsql immutable security invoker set search_path='' as $$
declare n integer:=greatest(1,least(coalesce(p_interval,1),1000));base date;candidate date;best date;cutoff date:=greatest(p_after,p_anchor-1);k integer;offset_cycle integer;v integer;selected integer[];distance integer;
begin
 if p_anchor is null then return null;end if;
 select coalesce(array_agg(distinct value::integer),'{}'::integer[]) into selected from jsonb_array_elements_text(coalesce(p_days,'[]')) where value ~ '^[0-9]{1,2}$';
 if p_kind='daily' then if cutoff<p_anchor then return p_anchor;end if;return p_anchor+((cutoff-p_anchor)/n+1)*n;end if;
 if p_kind='weekly' then
  base:=date_trunc('week',p_anchor)::date;
  if cardinality(selected)=0 then selected:=array[extract(dow from p_anchor)::integer];end if;
  k:=greatest(0,(cutoff-base)/(n*7));
  for offset_cycle in 0..1 loop foreach v in array selected loop
   if v between 0 and 6 then candidate:=base+(k+offset_cycle)*n*7+((v+6)%7);if candidate>cutoff and candidate>=p_anchor and (best is null or candidate<best) then best:=candidate;end if;end if;
  end loop;end loop;return best;
 end if;
 if p_kind='monthly' then
  distance:=(extract(year from cutoff)::integer-extract(year from p_anchor)::integer)*12+extract(month from cutoff)::integer-extract(month from p_anchor)::integer;
  k:=greatest(0,distance/n);
  if cardinality(selected)=0 then selected:=array[extract(day from p_anchor)::integer];end if;
  for offset_cycle in 0..1 loop base:=(date_trunc('month',p_anchor)+make_interval(months=>(k+offset_cycle)*n))::date;foreach v in array selected loop
   if v between 1 and 31 then candidate:=base+least(v,extract(day from (base+interval '1 month - 1 day'))::integer)-1;if candidate>cutoff and candidate>=p_anchor and (best is null or candidate<best) then best:=candidate;end if;end if;
  end loop;end loop;return best;
 end if;
 if p_kind='yearly' then
  k:=greatest(0,(extract(year from cutoff)::integer-extract(year from p_anchor)::integer)/n);
  if cardinality(selected)=0 then selected:=array[extract(month from p_anchor)::integer-1];end if;
  for offset_cycle in 0..1 loop foreach v in array selected loop
   if v between 0 and 11 then base:=make_date(extract(year from p_anchor)::integer+(k+offset_cycle)*n,v+1,1);candidate:=base+least(extract(day from p_anchor)::integer,extract(day from (base+interval '1 month - 1 day'))::integer)-1;if candidate>cutoff and candidate>=p_anchor and (best is null or candidate<best) then best:=candidate;end if;end if;
  end loop;end loop;return best;
 end if;return null;
end;$$;
revoke all on function public.agency_task_next_cycle(date,text,integer,jsonb,date) from public,anon;
grant execute on function public.agency_task_next_cycle(date,text,integer,jsonb,date) to authenticated,service_role;

create function public.agency_task_schedule_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.assignee_user_id is not null and new.assignee_user_id<>new.user_id then raise exception 'Selecione sua própria conta como responsável';end if;
 if tg_op='INSERT' then
  new.recurrence_anchor:=coalesce(new.recurrence_anchor,new.start_date,new.end_date,public.agency_task_current_day());
 elsif new.start_date is distinct from old.start_date or new.recurrence is distinct from old.recurrence or new.recurrence_interval is distinct from old.recurrence_interval or new.recurrence_days is distinct from old.recurrence_days or (new.start_date is null and new.end_date is distinct from old.end_date) then
  new.recurrence_anchor:=coalesce(new.start_date,new.end_date,public.agency_task_current_day());
 end if;
 return new;
end;$$;
revoke all on function public.agency_task_schedule_guard() from public,anon,authenticated;
create trigger agency_task_schedule_guard before insert or update on public.operational_tasks for each row execute function public.agency_task_schedule_guard();

-- An open predecessor (including a reopened task) blocks successors from daily work.
create function public.agency_task_is_current(p_task public.operational_tasks,p_day date) returns boolean
 language sql stable security invoker set search_path='' as $$
 select p_task.status not in('concluída','cancelada') and coalesce(p_task.start_date,p_task.end_date,p_day)<=p_day and not exists(
  with recursive ancestors as (
   select t.id,t.recurrence_of,t.status,array[t.id] path from public.operational_tasks t where t.id=p_task.recurrence_of and t.user_id=p_task.user_id
   union all select t.id,t.recurrence_of,t.status,a.path||t.id from public.operational_tasks t join ancestors a on t.id=a.recurrence_of where t.user_id=p_task.user_id and not t.id=any(a.path)
  ) select 1 from ancestors where status<>'concluída'
 )
$$;
revoke all on function public.agency_task_is_current(public.operational_tasks,date) from public,anon;
grant execute on function public.agency_task_is_current(public.operational_tasks,date) to authenticated,service_role;
create function public.agency_tasks_list(p_scope text) returns setof public.operational_tasks language plpgsql stable security invoker set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 if coalesce(p_scope,'') not in('active','planning','history') then raise exception 'Visualização inválida';end if;
 return query select t.* from public.operational_tasks t where t.user_id=auth.uid() and case p_scope when 'active' then public.agency_task_is_current(t,public.agency_task_current_day()) when 'planning' then t.status not in('concluída','cancelada') else t.status in('concluída','cancelada') end;
end;$$;
revoke all on function public.agency_tasks_list(text) from public,anon;
grant execute on function public.agency_tasks_list(text) to authenticated;
create function public.agency_task_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('today',public.agency_task_current_day(),'pendente',count(*) filter(where t.status='pendente' and public.agency_task_is_current(t,public.agency_task_current_day())),'em andamento',count(*) filter(where t.status='em andamento' and public.agency_task_is_current(t,public.agency_task_current_day())),'concluída',count(*) filter(where t.status='concluída'),'cancelada',count(*) filter(where t.status='cancelada'),'scheduled',count(*) filter(where t.status not in('concluída','cancelada') and not public.agency_task_is_current(t,public.agency_task_current_day()))) from public.operational_tasks t where t.user_id=(select auth.uid())
$$;
revoke all on function public.agency_task_summary() from public,anon;
grant execute on function public.agency_task_summary() to authenticated;

create or replace function public.agency_task_recur() returns trigger language plpgsql security invoker set search_path='' as $$
declare next_id uuid;cycle date;anchor date;duration integer;next_end date;
begin
 if new.status<>'concluída' or old.status='concluída' or coalesce(new.recurrence,'none')='none' then return new;end if;
 if exists(select 1 from public.operational_tasks where recurrence_of=new.id) then return new;end if;
 anchor:=new.recurrence_anchor;
 if anchor is null then
  with recursive chain as (
   select t.id,t.recurrence_of,t.start_date,t.end_date,t.recurrence_anchor,0 depth,array[t.id] path from public.operational_tasks t where t.id=new.id
   union all select t.id,t.recurrence_of,t.start_date,t.end_date,t.recurrence_anchor,c.depth+1,c.path||t.id from public.operational_tasks t join chain c on t.id=c.recurrence_of where t.user_id=new.user_id and not t.id=any(c.path)
  ) select coalesce(recurrence_anchor,start_date,end_date) into anchor from chain order by depth desc limit 1;
 end if;
 anchor:=coalesce(anchor,new.start_date,new.end_date,(new.created_at at time zone 'America/Sao_Paulo')::date);
 cycle:=public.agency_task_next_cycle(anchor,new.recurrence,new.recurrence_interval,new.recurrence_days,greatest(public.agency_task_current_day(),coalesce(new.start_date,new.end_date,anchor)));
 if cycle is null then raise exception 'Não foi possível agendar o próximo ciclo';end if;
 duration:=case when new.start_date is not null and new.end_date is not null then greatest(0,new.end_date-new.start_date) else 0 end;
 next_end:=case when new.end_date is not null then cycle+duration else null end;
 insert into public.operational_tasks(user_id,client_id,title,description,status,priority,start_date,end_date,recurrence,recurrence_interval,recurrence_days,assignee_name,assignee_user_id,area,recurrence_of,recurrence_anchor)
 values(new.user_id,new.client_id,new.title,new.description,'pendente',new.priority,cycle,next_end,new.recurrence,new.recurrence_interval,new.recurrence_days,new.assignee_name,new.assignee_user_id,new.area,new.id,anchor)
 on conflict(recurrence_of) do nothing returning id into next_id;
 if next_id is not null then insert into public.agency_task_subtasks(user_id,task_id,title,position) select user_id,next_id,title,position from public.agency_task_subtasks where task_id=new.id;end if;
 return new;
end;$$;

create or replace function public.agency_tasks_update(p_ids uuid[],p_patch jsonb) returns setof public.operational_tasks
 language plpgsql security invoker set search_path='' as $$
declare expected integer;owned integer;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 select count(distinct v) into expected from unnest(p_ids) v;
 if expected<1 or expected>200 then raise exception 'Selecione de 1 a 200 tarefas';end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Alteração inválida';end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k not in('status','priority','end_date','assignee_name','title','description','start_date','client_id','recurrence','recurrence_interval','recurrence_days','assignee_user_id','area')) then raise exception 'Campo não permitido';end if;
 if p_patch?'status' and coalesce(p_patch->>'status','') not in('pendente','em andamento','concluída','cancelada') then raise exception 'Status inválido';end if;
 if p_patch?'priority' and coalesce(p_patch->>'priority','') not in('baixa','média','alta') then raise exception 'Prioridade inválida';end if;
 if p_patch?'assignee_name' and length(coalesce(p_patch->>'assignee_name',''))>120 then raise exception 'Responsável muito longo';end if;
 if p_patch?'title' and length(trim(coalesce(p_patch->>'title','')))=0 then raise exception 'Título obrigatório';end if;
 if p_patch?'client_id' and nullif(p_patch->>'client_id','') is not null and not exists(select 1 from public.clients where id=(p_patch->>'client_id')::uuid and user_id=auth.uid()) then raise exception 'Cliente indisponível';end if;
 if p_patch?'recurrence' and coalesce(p_patch->>'recurrence','') not in('none','daily','weekly','monthly','yearly') then raise exception 'Recorrência inválida';end if;
 if p_patch?'recurrence_interval' and coalesce((p_patch->>'recurrence_interval')::integer,0) not between 1 and 1000 then raise exception 'Intervalo inválido';end if;
 if p_patch?'recurrence_days' then
  if jsonb_typeof(p_patch->'recurrence_days') is distinct from 'array' then raise exception 'Dias inválidos';end if;
  if exists(select 1 from jsonb_array_elements_text(p_patch->'recurrence_days') d where d !~ '^[0-9]{1,2}$' or d::integer>31) then raise exception 'Dias inválidos';end if;
 end if;
 if p_patch?'assignee_user_id' and nullif(p_patch->>'assignee_user_id','')::uuid is not null and (p_patch->>'assignee_user_id')::uuid<>auth.uid() then raise exception 'Selecione sua própria conta';end if;
 perform id from public.operational_tasks where id=any(p_ids) and user_id=auth.uid() order by id for update;
 select count(*) into owned from public.operational_tasks where id=any(p_ids) and user_id=auth.uid();
 if owned<>expected then raise exception 'Tarefa indisponível. Nenhuma tarefa foi alterada';end if;
 if (p_patch?'end_date' or p_patch?'start_date') and exists(select 1 from public.operational_tasks where id=any(p_ids) and user_id=auth.uid() and (case when p_patch?'start_date' then nullif(p_patch->>'start_date','')::date else start_date end)>(case when p_patch?'end_date' then nullif(p_patch->>'end_date','')::date else end_date end)) then raise exception 'O prazo deve ser igual ou posterior à data de início';end if;
 return query update public.operational_tasks set
 status=case when p_patch?'status' then p_patch->>'status' else status end,
 priority=case when p_patch?'priority' then p_patch->>'priority' else priority end,
 end_date=case when p_patch?'end_date' then nullif(p_patch->>'end_date','')::date else end_date end,
 assignee_user_id=case when p_patch?'assignee_user_id' then nullif(p_patch->>'assignee_user_id','')::uuid else assignee_user_id end,
 area=case when p_patch?'area' then coalesce(p_patch->>'area','') else area end,
 assignee_name=case when p_patch?'assignee_name' then trim(coalesce(p_patch->>'assignee_name','')) else assignee_name end,
 title=case when p_patch?'title' then trim(p_patch->>'title') else title end,
 description=case when p_patch?'description' then coalesce(p_patch->>'description','') else description end,
 start_date=case when p_patch?'start_date' then nullif(p_patch->>'start_date','')::date else start_date end,
 client_id=case when p_patch?'client_id' then nullif(p_patch->>'client_id','')::uuid else client_id end,
 recurrence=case when p_patch?'recurrence' then p_patch->>'recurrence' else recurrence end,
 recurrence_interval=case when p_patch?'recurrence_interval' then (p_patch->>'recurrence_interval')::integer else recurrence_interval end,
 recurrence_days=case when p_patch?'recurrence_days' then p_patch->'recurrence_days' else recurrence_days end
 where id=any(p_ids) and user_id=auth.uid() returning *;
end;$$;
revoke all on function public.agency_tasks_update(uuid[],jsonb) from public,anon;
grant execute on function public.agency_tasks_update(uuid[],jsonb) to authenticated;

create or replace function public.agency_task_duplicate(p_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare source public.operational_tasks%rowtype;new_id uuid;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 select * into source from public.operational_tasks where id=p_id and user_id=auth.uid() for share;
 if not found then raise exception 'Tarefa indisponível';end if;
 insert into public.operational_tasks(user_id,client_id,title,description,status,priority,start_date,end_date,recurrence,recurrence_interval,recurrence_days,assignee_name,assignee_user_id,area)
 values(auth.uid(),source.client_id,left(source.title,290)||' (cópia)',source.description,'pendente',source.priority,source.start_date,source.end_date,source.recurrence,source.recurrence_interval,source.recurrence_days,source.assignee_name,source.assignee_user_id,source.area) returning id into new_id;
 insert into public.agency_task_subtasks(user_id,task_id,title,position) select auth.uid(),new_id,title,position from public.agency_task_subtasks where task_id=source.id;
 return new_id;
end;$$;
revoke all on function public.agency_task_duplicate(uuid) from public,anon;
grant execute on function public.agency_task_duplicate(uuid) to authenticated;

