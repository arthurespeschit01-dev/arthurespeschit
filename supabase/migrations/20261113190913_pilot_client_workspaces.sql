-- Isolated pilot: no existing agency tables or policies are replaced.
create schema if not exists agency_private;
revoke all on schema agency_private from public,anon;
grant usage on schema agency_private to authenticated,service_role;
create table agency_private.pilot_accounts(user_id uuid primary key references auth.users(id) on delete cascade,enabled boolean not null default false,created_at timestamptz not null default now());
alter table agency_private.pilot_accounts enable row level security;
revoke all on agency_private.pilot_accounts from public,anon,authenticated;
grant all on agency_private.pilot_accounts to service_role;
create function agency_private.pilot_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from agency_private.pilot_accounts where user_id=auth.uid() and enabled);
$$;
revoke all on function agency_private.pilot_enabled() from public,anon;
grant execute on function agency_private.pilot_enabled() to authenticated,service_role;
create function public.agency_pilot_status() returns boolean language sql stable security invoker set search_path='' as $$ select agency_private.pilot_enabled(); $$;
revoke all on function public.agency_pilot_status() from public,anon;
grant execute on function public.agency_pilot_status() to authenticated;

create table public.agency_client_workspaces(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),owner_user_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 120),description text not null default '' check(length(description)<=2000),status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index pilot_workspaces_owner on public.agency_client_workspaces(owner_user_id);
create index pilot_workspaces_org on public.agency_client_workspaces(organization_id);
create table public.agency_workspace_members(
 workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,user_id uuid not null references auth.users(id),
 role text not null check(role in ('owner','admin','agent','viewer')),created_at timestamptz not null default now(),primary key(workspace_id,user_id)
);
create index pilot_members_user on public.agency_workspace_members(user_id,workspace_id);
create function agency_private.workspace_access(p_workspace uuid,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select agency_private.pilot_enabled() and exists(select 1 from public.agency_client_workspaces w where w.id=p_workspace and (not p_write or w.status='active') and
 (w.owner_user_id=auth.uid() or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=auth.uid() and (not p_write or m.role in ('owner','admin','agent')))));
$$;
create function agency_private.workspace_manage(p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select agency_private.pilot_enabled() and exists(select 1 from public.agency_client_workspaces w where w.id=p_workspace and (w.owner_user_id=auth.uid() or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=auth.uid() and m.role in ('owner','admin'))));
$$;
revoke all on function agency_private.workspace_access(uuid,boolean),agency_private.workspace_manage(uuid) from public,anon;
grant execute on function agency_private.workspace_access(uuid,boolean),agency_private.workspace_manage(uuid) to authenticated,service_role;
create table public.agency_workspace_pipelines(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 120),created_at timestamptz not null default now(),unique(id,workspace_id));
create index pilot_pipelines_workspace on public.agency_workspace_pipelines(workspace_id);
create table public.agency_workspace_stages(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,pipeline_id uuid not null,name text not null check(length(trim(name)) between 1 and 100),position integer not null check(position>=0),color text not null default '#8b5cf6' check(color~'^#[0-9a-fA-F]{6}$'),kind text not null default 'open' check(kind in ('open','won','lost')),foreign key(pipeline_id,workspace_id) references public.agency_workspace_pipelines(id,workspace_id) on delete cascade,unique(id,pipeline_id,workspace_id),unique(pipeline_id,position) deferrable initially deferred);
create index pilot_stages_workspace on public.agency_workspace_stages(workspace_id);
create table public.agency_workspace_leads(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,pipeline_id uuid not null,stage_id uuid not null,name text not null check(length(trim(name)) between 1 and 160),phone text not null default '' check(length(phone)<=40),email text not null default '' check(length(email)<=254),value numeric(12,2) not null default 0 check(value>=0),notes text not null default '' check(length(notes)<=10000),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(stage_id,pipeline_id,workspace_id) references public.agency_workspace_stages(id,pipeline_id,workspace_id) deferrable initially immediate);
create index pilot_leads_workspace_stage on public.agency_workspace_leads(workspace_id,stage_id);
create index pilot_leads_stage_scope on public.agency_workspace_leads(stage_id,pipeline_id,workspace_id);
create index pilot_leads_pipeline on public.agency_workspace_leads(pipeline_id);

alter table public.agency_client_workspaces enable row level security;
alter table public.agency_workspace_members enable row level security;
alter table public.agency_workspace_pipelines enable row level security;
alter table public.agency_workspace_stages enable row level security;
alter table public.agency_workspace_leads enable row level security;
revoke all on public.agency_client_workspaces,public.agency_workspace_members,public.agency_workspace_pipelines,public.agency_workspace_stages,public.agency_workspace_leads from public,anon;
grant select,insert,update,delete on public.agency_client_workspaces,public.agency_workspace_members,public.agency_workspace_pipelines,public.agency_workspace_stages,public.agency_workspace_leads to authenticated,service_role;
create policy pilot_workspaces_read on public.agency_client_workspaces for select to authenticated using((select agency_private.pilot_enabled()) and (owner_user_id=(select auth.uid()) or agency_private.workspace_access(id)));
create policy pilot_workspaces_insert on public.agency_client_workspaces for insert to authenticated with check((select agency_private.pilot_enabled()) and owner_user_id=(select auth.uid()) and exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy pilot_workspaces_update on public.agency_client_workspaces for update to authenticated using((select agency_private.pilot_enabled()) and owner_user_id=(select auth.uid())) with check((select agency_private.pilot_enabled()) and owner_user_id=(select auth.uid()) and exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy pilot_workspaces_delete on public.agency_client_workspaces for delete to authenticated using((select agency_private.pilot_enabled()) and owner_user_id=(select auth.uid()));
create policy pilot_members_read on public.agency_workspace_members for select to authenticated using(agency_private.workspace_access(workspace_id));
create policy pilot_members_manage on public.agency_workspace_members for all to authenticated using(agency_private.workspace_manage(workspace_id)) with check(agency_private.workspace_manage(workspace_id));
create policy pilot_pipeline_read on public.agency_workspace_pipelines for select to authenticated using(agency_private.workspace_access(workspace_id));
create policy pilot_pipeline_manage on public.agency_workspace_pipelines for all to authenticated using(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true));
create policy pilot_stage_read on public.agency_workspace_stages for select to authenticated using(agency_private.workspace_access(workspace_id));
create policy pilot_stage_manage on public.agency_workspace_stages for all to authenticated using(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true));
create policy pilot_lead_read on public.agency_workspace_leads for select to authenticated using(agency_private.workspace_access(workspace_id));
create policy pilot_lead_write on public.agency_workspace_leads for all to authenticated using(agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_access(workspace_id,true));

create function agency_private.workspace_identity_guard() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if tg_table_name='agency_client_workspaces' then
  if new.owner_user_id<>old.owner_user_id or new.organization_id<>old.organization_id then raise exception 'A agência da subconta não pode ser alterada.';end if;
 elsif new.workspace_id<>old.workspace_id then raise exception 'Os registros não podem ser transferidos entre subcontas.';end if;
 if tg_table_name in ('agency_client_workspaces','agency_workspace_leads') then new.updated_at:=now();end if;return new;
end; $$;
revoke all on function agency_private.workspace_identity_guard() from public,anon,authenticated;
create trigger pilot_workspace_identity before update on public.agency_client_workspaces for each row execute function agency_private.workspace_identity_guard();
create trigger pilot_pipeline_identity before update on public.agency_workspace_pipelines for each row execute function agency_private.workspace_identity_guard();
create trigger pilot_stage_identity before update on public.agency_workspace_stages for each row execute function agency_private.workspace_identity_guard();
create trigger pilot_lead_identity before update on public.agency_workspace_leads for each row execute function agency_private.workspace_identity_guard();

create function public.agency_workspace_create(p_name text,p_description text default '') returns uuid language plpgsql security invoker set search_path='' as $$
 declare w uuid;p uuid;o uuid;begin
 if not agency_private.pilot_enabled() then raise exception 'Área piloto não liberada para esta conta.' using errcode='42501';end if;
 select id into o from public.organizations where owner_user_id=auth.uid() order by created_at limit 1;if o is null then raise exception 'Organização não encontrada.';end if;
 insert into public.agency_client_workspaces(organization_id,owner_user_id,name,description) values(o,auth.uid(),trim(p_name),trim(coalesce(p_description,''))) returning id into w;
 insert into public.agency_workspace_members(workspace_id,user_id,role) values(w,auth.uid(),'owner');
 insert into public.agency_workspace_pipelines(workspace_id,name) values(w,'Comercial') returning id into p;
 insert into public.agency_workspace_stages(workspace_id,pipeline_id,name,position,color,kind) values(w,p,'Novo contato',0,'#8b5cf6','open'),(w,p,'Em conversa',1,'#3b82f6','open'),(w,p,'Proposta enviada',2,'#f59e0b','open'),(w,p,'Ganho',3,'#10b981','won'),(w,p,'Perdido',4,'#ef4444','lost');return w;
 end;$$;
revoke all on function public.agency_workspace_create(text,text) from public,anon;
grant execute on function public.agency_workspace_create(text,text) to authenticated;

create function public.agency_workspace_save_pipeline(p_workspace uuid,p_name text,p_stages jsonb,p_id uuid default null) returns uuid language plpgsql security invoker set search_path='' as $$
 declare p uuid;item jsonb;s uuid;ids uuid[]:=array[]::uuid[];pos integer:=0;begin
 if not agency_private.workspace_manage(p_workspace) or not agency_private.workspace_access(p_workspace,true) then raise exception 'Sem permissão nesta subconta.' using errcode='42501';end if;
 if p_stages is null or jsonb_typeof(p_stages)<>'array' or jsonb_array_length(p_stages)<1 or jsonb_array_length(p_stages)>30 then raise exception 'Informe entre 1 e 30 etapas.';end if;
 if p_id is null then insert into public.agency_workspace_pipelines(workspace_id,name) values(p_workspace,trim(p_name)) returning id into p;
 else select id into p from public.agency_workspace_pipelines where id=p_id and workspace_id=p_workspace for update;if p is null then raise exception 'Pipeline não encontrada.';end if;update public.agency_workspace_pipelines set name=trim(p_name) where id=p;end if;
 for item in select value from jsonb_array_elements(p_stages) loop
  s:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());if s=any(ids) then raise exception 'Etapa repetida.';end if;
  if exists(select 1 from public.agency_workspace_stages where id=s) then
   update public.agency_workspace_stages set name=trim(item->>'name'),color=item->>'color',kind=item->>'kind',position=pos where id=s and pipeline_id=p and workspace_id=p_workspace;if not found then raise exception 'Etapa não pertence a esta pipeline.';end if;
  else insert into public.agency_workspace_stages(id,workspace_id,pipeline_id,name,color,kind,position) values(s,p_workspace,p,trim(item->>'name'),item->>'color',item->>'kind',pos);end if;
  ids:=array_append(ids,s);pos:=pos+1;
 end loop;
 delete from public.agency_workspace_stages where pipeline_id=p and workspace_id=p_workspace and not(id=any(ids));return p;
 end;$$;
revoke all on function public.agency_workspace_save_pipeline(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.agency_workspace_save_pipeline(uuid,text,jsonb,uuid) to authenticated;
