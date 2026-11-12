-- Additive task tools. Existing tasks, timestamps, comments and attachments stay untouched.
alter table public.operational_tasks
 add column assignee_name text not null default '' check (length(assignee_name)<=120),
 add column recurrence_of uuid unique references public.operational_tasks(id) on delete set null;

create table public.agency_task_subtasks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null references public.operational_tasks(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 300),
 completed boolean not null default false,
 position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index agency_task_subtasks_parent on public.agency_task_subtasks(user_id,task_id,position);
alter table public.agency_task_subtasks enable row level security;
revoke all on public.agency_task_subtasks from anon;
grant select,insert,update,delete on public.agency_task_subtasks to authenticated;
create policy task_subtasks_owner on public.agency_task_subtasks for all to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.operational_tasks t where t.id=task_id and t.user_id=(select auth.uid())))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.operational_tasks t where t.id=task_id and t.user_id=(select auth.uid())));
create trigger agency_task_subtask_updated before update on public.agency_task_subtasks for each row execute function public.update_updated_at_column();

-- Calendar arithmetic clamps month ends, while preserving selected weekdays/month days.
create function public.agency_next_task_date(p_date date,p_kind text,p_interval integer,p_days jsonb) returns date
 language plpgsql immutable security invoker set search_path='' as $$
declare n integer:=greatest(1,least(coalesce(p_interval,1),1000));d integer;m integer;y integer;candidate date;result_date date;anchor date;selected integer[];
begin
 if p_date is null then return null;end if;
 select coalesce(array_agg(value::integer order by value::integer),'{}'::integer[]) into selected from jsonb_array_elements_text(coalesce(p_days,'[]'::jsonb)) where value ~ '^[0-9]{1,2}$';
 if p_kind='daily' then return p_date+n;end if;
 if p_kind='weekly' then
  if cardinality(selected)=0 then return p_date+n*7;end if;
  -- First finish the selected days in this week, then use the configured interval.
  anchor:=date_trunc('week',p_date)::date;
  for d in 1..7 loop
   candidate:=p_date+d;
   if candidate<anchor+7 and extract(dow from candidate)::integer=any(selected) then return candidate;end if;
  end loop;
  anchor:=anchor+n*7;
  for d in 0..6 loop candidate:=anchor+d;if extract(dow from candidate)::integer=any(selected) then return candidate;end if;end loop;
  return p_date+n*7;
 end if;
 if p_kind='monthly' then
  anchor:=date_trunc('month',p_date)::date;
  if cardinality(selected)>0 then
   foreach d in array selected loop
    if d between 1 and 31 then
     candidate:=anchor+least(d,extract(day from (anchor+interval '1 month - 1 day'))::integer)-1;
     if candidate>p_date and (result_date is null or candidate<result_date) then result_date:=candidate;end if;
    end if;
   end loop;
   if result_date is not null then return result_date;end if;
  end if;
  anchor:=(anchor+make_interval(months=>n))::date;
  d:=case when cardinality(selected)>0 then (select min(v) from unnest(selected) v where v between 1 and 31) else extract(day from p_date)::integer end;
  return anchor+least(coalesce(d,extract(day from p_date)::integer),extract(day from (anchor+interval '1 month - 1 day'))::integer)-1;
 end if;
 if p_kind='yearly' then
  y:=extract(year from p_date)::integer;m:=extract(month from p_date)::integer;d:=extract(day from p_date)::integer;
  if cardinality(selected)>0 then
   select min(v)+1 into m from unnest(selected) v where v between 0 and 11 and v+1>extract(month from p_date);
   if m is null then select min(v)+1 into m from unnest(selected) v where v between 0 and 11;y:=y+n;end if;
  else y:=y+n;end if;
  anchor:=make_date(y,coalesce(m,extract(month from p_date)::integer),1);
  return anchor+least(d,extract(day from (anchor+interval '1 month - 1 day'))::integer)-1;
 end if;
 return p_date;
end;$$;
revoke all on function public.agency_next_task_date(date,text,integer,jsonb) from public,anon;
grant execute on function public.agency_next_task_date(date,text,integer,jsonb) to authenticated,service_role;

-- Recurrence is now atomic for every editor and batch action, with one successor per task.
create function public.agency_task_recur() returns trigger language plpgsql security invoker set search_path='' as $$
declare next_id uuid;next_start date;next_end date;
begin
 -- Older open browser tabs still generate their own recurrence. Only the new RPC opts in.
 if current_setting('agency.task_server_recurrence',true) is distinct from 'on' then return new;end if;
 if new.status<>'concluída' or old.status='concluída' or coalesce(new.recurrence,'none')='none' then return new;end if;
 if exists(select 1 from public.operational_tasks where recurrence_of=new.id) then return new;end if;
 next_start:=public.agency_next_task_date(new.start_date,new.recurrence,new.recurrence_interval,new.recurrence_days);
 next_end:=public.agency_next_task_date(new.end_date,new.recurrence,new.recurrence_interval,new.recurrence_days);
 if next_start is null and next_end is null then return new;end if;
 insert into public.operational_tasks(user_id,client_id,title,description,status,priority,start_date,end_date,recurrence,recurrence_interval,recurrence_days,assignee_name,recurrence_of)
 values(new.user_id,new.client_id,new.title,new.description,'pendente',new.priority,next_start,next_end,new.recurrence,new.recurrence_interval,new.recurrence_days,new.assignee_name,new.id)
 on conflict(recurrence_of) do nothing returning id into next_id;
 if next_id is not null then insert into public.agency_task_subtasks(user_id,task_id,title,position) select user_id,next_id,title,position from public.agency_task_subtasks where task_id=new.id;end if;
 return new;
end;$$;
revoke all on function public.agency_task_recur() from public,anon,authenticated;
create trigger agency_task_recur after update of status on public.operational_tasks for each row execute function public.agency_task_recur();

create function public.agency_tasks_update(p_ids uuid[],p_patch jsonb) returns setof public.operational_tasks
 language plpgsql security invoker set search_path='' as $$
declare expected integer;owned integer;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 select count(distinct v) into expected from unnest(p_ids) v;
 if expected<1 or expected>200 then raise exception 'Selecione de 1 a 200 tarefas';end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Alteração inválida';end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k not in('status','priority','end_date','assignee_name','title','description','start_date','client_id','recurrence','recurrence_interval','recurrence_days')) then raise exception 'Campo não permitido';end if;
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
 perform id from public.operational_tasks where id=any(p_ids) and user_id=auth.uid() order by id for update;
 select count(*) into owned from public.operational_tasks where id=any(p_ids) and user_id=auth.uid();
 if owned<>expected then raise exception 'Tarefa indisponível. Nenhuma tarefa foi alterada';end if;
 if (p_patch?'end_date' or p_patch?'start_date') and exists(select 1 from public.operational_tasks where id=any(p_ids) and user_id=auth.uid() and (case when p_patch?'start_date' then nullif(p_patch->>'start_date','')::date else start_date end)>(case when p_patch?'end_date' then nullif(p_patch->>'end_date','')::date else end_date end)) then raise exception 'O prazo deve ser igual ou posterior à data de início';end if;
 perform set_config('agency.task_server_recurrence','on',true);
 return query update public.operational_tasks set
 status=case when p_patch?'status' then p_patch->>'status' else status end,
 priority=case when p_patch?'priority' then p_patch->>'priority' else priority end,
 end_date=case when p_patch?'end_date' then nullif(p_patch->>'end_date','')::date else end_date end,
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

create function public.agency_task_duplicate(p_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare source public.operational_tasks%rowtype;new_id uuid;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 select * into source from public.operational_tasks where id=p_id and user_id=auth.uid() for share;
 if not found then raise exception 'Tarefa indisponível';end if;
 insert into public.operational_tasks(user_id,client_id,title,description,status,priority,start_date,end_date,recurrence,recurrence_interval,recurrence_days,assignee_name)
 values(auth.uid(),source.client_id,left(source.title,290)||' (cópia)',source.description,'pendente',source.priority,source.start_date,source.end_date,source.recurrence,source.recurrence_interval,source.recurrence_days,source.assignee_name) returning id into new_id;
 insert into public.agency_task_subtasks(user_id,task_id,title,position) select auth.uid(),new_id,title,position from public.agency_task_subtasks where task_id=source.id;
 return new_id;
end;$$;
revoke all on function public.agency_task_duplicate(uuid) from public,anon;
grant execute on function public.agency_task_duplicate(uuid) to authenticated;

do $$declare t text;begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then foreach t in array array['operational_tasks','agency_task_subtasks','task_comments','task_attachments'] loop if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;end loop;end if;end;$$;
