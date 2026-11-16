-- Owner-authorized general release. Authentication and workspace membership remain required.
-- Compatibility names are retained for older deployed clients; no account enrollment is needed.
create or replace function agency_private.pilot_enabled() returns boolean
language sql stable security definer set search_path='' as $$ select auth.uid() is not null; $$;

create function public.agency_workspace_status() returns boolean
language sql stable security invoker set search_path='' as $$ select auth.uid() is not null; $$;
revoke all on function public.agency_workspace_status() from public,anon;
grant execute on function public.agency_workspace_status() to authenticated;

-- Remove only the reviewed allowlist JOINs. Keep active-workspace, owner/member,
-- per-module permission, invitation, capability, account and provider predicates intact.
do $release$
declare r record; updated text;
begin
 for r in select p.oid, p.proname, pg_get_functiondef(p.oid) definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','agency_private') and p.prokind='f'
 and p.prosrc like '%pilot_accounts%'
 loop
  if r.proname not in ('accept_workspace_invite','agency_workspace_available','agency_workspace_claim_action',
   'agency_workspace_claim_message','agency_workspace_google','agency_workspace_ingest_message',
   'agency_workspace_submit_form','bind_workspace_outbox','capture_contact','has_workspace_access',
   'process_workspace_flows','queue_workspace_flows','workspace_access','workspace_audit_lead','workspace_stage_meeting_task') then
   raise exception 'Unreviewed pilot dependency in %', r.proname;
  end if;
  updated:=regexp_replace(r.definition,
   'join agency_private[.]pilot_accounts ([a-z]+) on [a-z]+[.]user_id=[a-z]+[.]owner_user_id and [a-z]+[.]enabled', '', 'g');
  if updated=r.definition or updated like '%pilot_accounts%' then raise exception 'Unresolved pilot dependency in %',r.proname;end if;
  execute updated;
 end loop;
end;
$release$;

create or replace function public.agency_workspace_identity() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('can_create',auth.uid() is not null and exists(select 1 from public.organizations where owner_user_id=auth.uid()),'pilot_owner',agency_private.pilot_enabled());
$$;

-- Retain legacy RPC compatibility, without presenting the experimental access model.
do $release$
declare definition text;
begin
 select pg_get_functiondef('public.agency_workspace_create(text,text)'::regprocedure) into definition;
 execute replace(definition,'Área piloto não liberada para esta conta.','Entre na sua conta para criar uma subconta.');
end;
$release$;

-- Upgrade the existing jobs in place, so there is no duplicate scheduler.
do $release$
declare r record; updated text;
begin
 if to_regclass('cron.job') is not null then
  for r in execute 'select jobname,schedule,command from cron.job where jobname like ''pilot-workspace%''' loop
   updated:=regexp_replace(r.command,
    'join agency_private[.]pilot_accounts ([a-z]+) on [a-z]+[.]user_id=[a-z]+[.]owner_user_id and [a-z]+[.]enabled', '', 'g');
   if updated like '%pilot_accounts%' then raise exception 'Unresolved scheduler dependency in %',r.jobname;end if;
   perform cron.schedule(r.jobname,r.schedule,updated);
  end loop;
 end if;
end;
$release$;
