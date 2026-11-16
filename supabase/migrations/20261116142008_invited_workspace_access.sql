-- Invitation identities are separate from agency owners. Never trust user_metadata for access.
create table agency_private.workspace_only_users(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
alter table agency_private.workspace_only_users enable row level security;
revoke all on agency_private.workspace_only_users from public,anon,authenticated;
grant all on agency_private.workspace_only_users to service_role;
create function agency_private.central_access() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and not exists(select 1 from agency_private.workspace_only_users where user_id=auth.uid());$$;
revoke all on function agency_private.central_access() from public,anon;
grant execute on function agency_private.central_access() to authenticated;
create function public.agency_central_access() returns boolean language sql stable security invoker set search_path='' as $$select agency_private.central_access();$$;
revoke all on function public.agency_central_access() from public,anon;
grant execute on function public.agency_central_access() to authenticated;

-- Existing active business owners retain their account. Empty invited identities are restricted.
insert into agency_private.workspace_only_users(user_id)
select u.id from auth.users u where
 (exists(select 1 from public.agency_workspace_invitations i where lower(i.email)=lower(u.email) and (i.status='accepted' or (i.status='pending' and i.expires_at>now()))) or exists(select 1 from public.agency_workspace_members m where m.user_id=u.id and m.role<>'owner'))
 and not exists(select 1 from public.agency_client_workspaces w where w.owner_user_id=u.id)
 and not exists(select 1 from public.clients c where c.user_id=u.id)
 and not exists(select 1 from public.agency_pipeline_cards c where c.user_id=u.id)
 and not exists(select 1 from public.agency_appointments c where c.user_id=u.id)
 on conflict do nothing;

create function agency_private.mark_invited_identity() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.agency_workspace_invitations i join public.agency_client_workspaces w on w.id=i.workspace_id where lower(i.email)=lower(new.email) and i.status='pending' and i.expires_at>now() and w.status='active') then
 insert into agency_private.workspace_only_users(user_id) values(new.id) on conflict do nothing;
 end if;return new;
end;$$;
revoke all on function agency_private.mark_invited_identity() from public,anon,authenticated;
create trigger a_workspace_invited_identity after insert on auth.users for each row execute function agency_private.mark_invited_identity();
-- This trigger runs after the invitation marker, before bootstrapping an agency.
do $$declare definition text;begin
 select pg_get_functiondef('public.handle_new_user_org()'::regprocedure) into definition;
 if definition !~* 'begin' then raise exception 'Unexpected signup bootstrap';end if;
 execute regexp_replace(definition,'begin','begin if exists(select 1 from agency_private.workspace_only_users where user_id=new.id) then return new;end if;','i');
end;$$;

-- Every legacy table keeps its original permissive policies plus this mandatory restriction.
-- Workspace/module RLS is deliberately preserved; profiles remain personal identity settings.
do $$declare r record;begin
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relname not like 'agency_workspace_%' and c.relname not in ('agency_client_workspaces','profiles') loop
 execute format('create policy invited_identity_no_central on public.%I as restrictive for all to authenticated using ((select public.agency_central_access())) with check ((select public.agency_central_access()))',r.relname);
 end loop;
end;$$;
create policy invited_identity_no_ownership on public.agency_client_workspaces as restrictive for all to authenticated using(owner_user_id<>auth.uid() or (select public.agency_central_access())) with check(owner_user_id<>auth.uid() or (select public.agency_central_access()));
-- Workspace creation and primary-account adapters are SECURITY DEFINER internally.
do $$declare r record;definition text;begin
 for r in select 'public.agency_workspace_create(text,text)'::regprocedure oid union all select 'agency_private.agency_account_workspace()'::regprocedure loop
 select pg_get_functiondef(r.oid) into definition;
 execute regexp_replace(definition,'begin','begin if not agency_private.central_access() then raise exception ''Acesso exclusivo às subcontas autorizadas.'' using errcode=''42501'';end if;','i');
 end loop;
end;$$;
create or replace function public.agency_workspace_identity() returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_build_object('can_create',agency_private.central_access() and exists(select 1 from public.organizations where owner_user_id=auth.uid()),'pilot_owner',agency_private.central_access());$$;

create function agency_private.login_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('central_allowed',agency_private.central_access(),
 'workspaces',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'account_kind',w.account_kind) order by w.created_at) from public.agency_client_workspaces w where w.status='active' and (w.owner_user_id=auth.uid() or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=auth.uid()))),'[]'),
 'invitation_path',(select '/convite-equipe/'||i.token from public.agency_workspace_invitations i join auth.users u on u.id=auth.uid() and lower(u.email)=lower(i.email) join public.agency_client_workspaces w on w.id=i.workspace_id and w.status='active' where i.status='pending' and i.expires_at>now() order by i.created_at desc limit 1));
$$;
revoke all on function agency_private.login_access() from public,anon;
grant execute on function agency_private.login_access() to authenticated;
create function public.agency_login_access() returns jsonb language sql stable security invoker set search_path='' as $$select agency_private.login_access();$$;
revoke all on function public.agency_login_access() from public,anon;
grant execute on function public.agency_login_access() to authenticated;

-- Existing empty identities accepting a first invitation get the same durable restriction.
create function agency_private.restrict_workspace_member_identity() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.role<>'owner'
 and not exists(select 1 from public.agency_client_workspaces where owner_user_id=new.user_id)
 and not exists(select 1 from public.clients where user_id=new.user_id)
 and not exists(select 1 from public.agency_pipeline_cards where user_id=new.user_id)
 and not exists(select 1 from public.agency_appointments where user_id=new.user_id) then
 insert into agency_private.workspace_only_users(user_id) values(new.user_id) on conflict do nothing;
 end if;return new;
end;$$;
revoke all on function agency_private.restrict_workspace_member_identity() from public,anon,authenticated;
create trigger restrict_workspace_member_identity after insert or update of user_id on public.agency_workspace_members for each row execute function agency_private.restrict_workspace_member_identity();

-- Organization helpers also back Storage policies, so an old bootstrap membership is not an escape.
create or replace function public.is_org_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$select agency_private.central_access() and exists(select 1 from public.organization_members where organization_id=org and user_id=auth.uid());$$;
create or replace function public.is_org_admin(org uuid) returns boolean language sql stable security definer set search_path='' as $$select agency_private.central_access() and exists(select 1 from public.organization_members where organization_id=org and user_id=auth.uid() and role in ('owner','admin'));$$;
do $$begin
 if to_regprocedure('public.get_my_org_ids()') is not null then execute $definition$create or replace function public.get_my_org_ids() returns setof uuid language sql stable security definer set search_path='' as $body$select organization_id from public.organization_members where user_id=auth.uid() and agency_private.central_access();$body$;$definition$;end if;
 if to_regprocedure('public.is_org_mate_folder(text)') is not null then execute $definition$create or replace function public.is_org_mate_folder(folder_user_id text) returns boolean language sql stable security definer set search_path='' as $body$select agency_private.central_access() and exists(select 1 from public.organization_members me join public.organization_members mate on mate.organization_id=me.organization_id where me.user_id=auth.uid() and mate.user_id::text=folder_user_id);$body$;$definition$;end if;
end;$$;
