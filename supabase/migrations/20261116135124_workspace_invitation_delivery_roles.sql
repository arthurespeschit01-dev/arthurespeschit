-- Invitations carry the chosen role and apply it atomically on acceptance.
alter table public.agency_workspace_invitations add column custom_role_id uuid,
 add column email_sent_at timestamptz,add column email_error text,
 add column email_attempted_at timestamptz,add column email_claim uuid;
alter table public.agency_workspace_invitations add constraint workspace_invite_custom_role
 foreign key(custom_role_id,workspace_id) references public.agency_workspace_roles(id,workspace_id);
grant insert(custom_role_id),update(custom_role_id) on public.agency_workspace_invitations to authenticated;
create function agency_private.workspace_invite_role_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.custom_role_id is not null then new.role:='viewer';end if;
 if tg_op='UPDATE' and old.status<>'pending' and (new.custom_role_id is distinct from old.custom_role_id or new.role<>old.role) then raise exception 'Somente convites pendentes podem mudar de função.';end if;
 return new;end;$$;
revoke all on function agency_private.workspace_invite_role_guard() from public,anon,authenticated;
create trigger workspace_invite_role before insert or update on public.agency_workspace_invitations for each row execute function agency_private.workspace_invite_role_guard();

do $migration$
declare definition text;
begin
 select pg_get_functiondef('agency_private.accept_workspace_invite(text)'::regprocedure) into definition;
 definition:=replace(definition,
  'update public.agency_workspace_invitations set status=''accepted''',
  'delete from public.agency_workspace_member_roles where workspace_id=inv.workspace_id and user_id=auth.uid();
   if inv.custom_role_id is not null then
    insert into public.agency_workspace_member_roles(workspace_id,user_id,role_id) values(inv.workspace_id,auth.uid(),inv.custom_role_id);
   end if;
   update public.agency_workspace_invitations set status=''accepted''');
 execute definition;
end;$migration$;

-- Server-only claim prevents duplicate email sends and throttles explicit resends.
create function public.agency_workspace_invite_email(p_workspace uuid,p_invite uuid,p_claim uuid default null,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$declare inv public.agency_workspace_invitations;claim uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('workspace-invite-mail:'||p_workspace::text,0));
 select * into inv from public.agency_workspace_invitations where workspace_id=p_workspace and id=p_invite for update;
 if inv.id is null or inv.status<>'pending' or inv.expires_at<=now() then raise exception 'Convite inválido, expirado ou já utilizado.';end if;
 if not public.agency_workspace_available(p_workspace) then raise exception 'Empresa indisponível.';end if;
 if p_claim is not null then
  if inv.email_claim is distinct from p_claim then raise exception 'Envio já atualizado.';end if;
  update public.agency_workspace_invitations set email_sent_at=case when p_error is null then now() else email_sent_at end,email_error=left(p_error,300),email_claim=null where id=p_invite;
  return jsonb_build_object('sent',p_error is null);
 end if;
 if inv.email_attempted_at>now()-interval '1 minute' then raise exception 'Aguarde um minuto antes de reenviar este convite.';end if;
 if (select count(*) from public.agency_workspace_invitations where workspace_id=p_workspace and email_attempted_at>now()-interval '1 hour')>=50 then raise exception 'Limite de convites por hora atingido.';end if;
 claim:=gen_random_uuid();
 update public.agency_workspace_invitations set email_claim=claim,email_attempted_at=now(),email_error=null where id=p_invite;
 return to_jsonb(inv)||jsonb_build_object('claim',claim);
end;$$;
revoke all on function public.agency_workspace_invite_email(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.agency_workspace_invite_email(uuid,uuid,uuid,text) to service_role;
-- Delivery bookkeeping can only be written by the server.
revoke insert,update on public.agency_workspace_invitations from authenticated;
grant insert(workspace_id,email,display_name,role,custom_role_id) on public.agency_workspace_invitations to authenticated;
grant update(email,display_name,role,custom_role_id,status) on public.agency_workspace_invitations to authenticated;

create function agency_private.set_workspace_member_role(p_workspace uuid,p_user uuid,p_role text,p_custom uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 if not agency_private.workspace_manage(p_workspace) or not agency_private.workspace_access(p_workspace,true) then raise exception 'Somente administradores podem configurar membros.' using errcode='42501';end if;
 if not exists(select 1 from public.agency_workspace_members where workspace_id=p_workspace and user_id=p_user) or exists(select 1 from public.agency_client_workspaces where id=p_workspace and owner_user_id=p_user) then raise exception 'Membro inválido.';end if;
 if p_custom is null and p_role not in ('admin','agent','viewer') then raise exception 'Função inválida.';end if;
 if p_custom is not null and not exists(select 1 from public.agency_workspace_roles where workspace_id=p_workspace and id=p_custom) then raise exception 'Escolha uma função desta empresa.';end if;
 delete from public.agency_workspace_member_roles where workspace_id=p_workspace and user_id=p_user;
 update public.agency_workspace_members set role=case when p_custom is null then p_role else 'viewer' end where workspace_id=p_workspace and user_id=p_user;
 if p_custom is not null then insert into public.agency_workspace_member_roles(workspace_id,user_id,role_id) values(p_workspace,p_user,p_custom);end if;
end;$$;
revoke all on function agency_private.set_workspace_member_role(uuid,uuid,text,uuid) from public,anon;
grant execute on function agency_private.set_workspace_member_role(uuid,uuid,text,uuid) to authenticated;
create function public.agency_workspace_set_member_role(p_workspace uuid,p_user uuid,p_role text default 'viewer',p_custom uuid default null) returns void
language sql security invoker set search_path='' as $$select agency_private.set_workspace_member_role(p_workspace,p_user,p_role,p_custom);$$;
revoke all on function public.agency_workspace_set_member_role(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.agency_workspace_set_member_role(uuid,uuid,text,uuid) to authenticated;

-- OAuth/nonces must honor the selected function too, including changes made after login.
create function agency_private.workspace_user_configures(p_workspace uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(select 1 from public.agency_client_workspaces w where w.id=p_workspace and w.status='active' and
 (w.owner_user_id=p_user or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=p_user and
 ((m.role in ('owner','admin') and not exists(select 1 from public.agency_workspace_member_roles mr where mr.workspace_id=w.id and mr.user_id=p_user)) or
 exists(select 1 from public.agency_workspace_member_roles mr join public.agency_workspace_roles r on r.id=mr.role_id and r.workspace_id=mr.workspace_id where mr.workspace_id=w.id and mr.user_id=p_user and (r.admin_total or r.permissions->>'settings'='manage'))))));
$$;
revoke all on function agency_private.workspace_user_configures(uuid,uuid) from public,anon,authenticated;
grant execute on function agency_private.workspace_user_configures(uuid,uuid) to service_role;
do $roles$
declare definition text;old text;
begin
 select pg_get_functiondef('public.agency_workspace_google(uuid,text,jsonb)'::regprocedure) into definition;
 old:='(w.owner_user_id=s.user_id or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=s.user_id and m.role in (''owner'',''admin'')))';
 if position(old in definition)=0 then raise exception 'Google role check needs review.';end if;
 execute replace(definition,old,'agency_private.workspace_user_configures(w.id,s.user_id)');
 if to_regprocedure('public.agency_workspace_cloud_signup(uuid,uuid,text,text)') is not null then
  select pg_get_functiondef('public.agency_workspace_cloud_signup(uuid,uuid,text,text)'::regprocedure) into definition;
  old:='exists(select 1 from public.agency_workspace_members where workspace_id=p_workspace and user_id=p_user and role in (''owner'',''admin''))';
  if position(old in definition)=0 then raise exception 'Meta role check needs review.';end if;
  execute replace(definition,old,'agency_private.workspace_user_configures(p_workspace,p_user)');
 end if;
end;$roles$;
