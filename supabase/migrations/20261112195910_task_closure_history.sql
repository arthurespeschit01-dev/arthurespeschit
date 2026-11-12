-- Preserve legacy tasks without inventing completion dates from their deadlines.
alter table public.operational_tasks add column closed_at timestamptz;
create function public.agency_task_closure_date() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.closed_at:=case when new.status in('concluída','cancelada') then now() else null end;
 elsif new.status is distinct from old.status then
  new.closed_at:=case when new.status in('concluída','cancelada') then now() else null end;
 else new.closed_at:=old.closed_at;
 end if;
 return new;
end;$$;
revoke all on function public.agency_task_closure_date() from public,anon,authenticated;
create trigger agency_task_closure_date before insert or update on public.operational_tasks for each row execute function public.agency_task_closure_date();
create index operational_tasks_closed_history on public.operational_tasks(user_id,closed_at desc) where status in('concluída','cancelada');
