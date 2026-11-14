-- Workspace-only roles. Existing accounts retain their baseline permissions until assigned a custom role.
create table public.agency_workspace_roles(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),color text not null default '#8b5cf6' check(color~'^#[a-fA-F0-9]{6}$'),
 admin_total boolean not null default false,permissions jsonb not null default '{}',notifications jsonb not null default '{}',
 created_at timestamptz not null default now(),unique(id,workspace_id),unique(workspace_id,name),check(jsonb_typeof(permissions)='object'),check(jsonb_typeof(notifications)='object'));
create table public.agency_workspace_member_roles(
 workspace_id uuid not null, user_id uuid not null,role_id uuid not null,
 primary key(workspace_id,user_id,role_id),foreign key(workspace_id,user_id) references public.agency_workspace_members(workspace_id,user_id) on delete cascade,
 foreign key(role_id,workspace_id) references public.agency_workspace_roles(id,workspace_id) on delete cascade);
create index workspace_member_roles_role on public.agency_workspace_member_roles(role_id,workspace_id);
alter table public.agency_workspace_roles enable row level security;alter table public.agency_workspace_member_roles enable row level security;
revoke all on public.agency_workspace_roles,public.agency_workspace_member_roles from public,anon,authenticated;
grant select on public.agency_workspace_roles,public.agency_workspace_member_roles to authenticated;
grant all on public.agency_workspace_roles,public.agency_workspace_member_roles to service_role;
create function agency_private.workspace_administrator(p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select agency_private.workspace_access(p_workspace) and exists(select 1 from public.agency_client_workspaces w where w.id=p_workspace and (w.owner_user_id=auth.uid() or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=auth.uid() and m.role in ('owner','admin') and not exists(select 1 from public.agency_workspace_member_roles mr where mr.workspace_id=w.id and mr.user_id=auth.uid())) or exists(select 1 from public.agency_workspace_member_roles mr join public.agency_workspace_roles r on r.id=mr.role_id and r.workspace_id=mr.workspace_id where mr.workspace_id=w.id and mr.user_id=auth.uid() and r.admin_total)));
$$;
revoke all on function agency_private.workspace_administrator(uuid) from public,anon;grant execute on function agency_private.workspace_administrator(uuid) to authenticated,service_role;
create function agency_private.workspace_permission(p_workspace uuid,p_module text,p_level text default 'read') returns boolean language plpgsql stable security definer set search_path='' as $$
declare legacy text;value text;needed int;begin
 if not agency_private.workspace_access(p_workspace) then return false;end if;
 if p_level<>'read' and not exists(select 1 from public.agency_client_workspaces where id=p_workspace and status='active') then return false;end if;
 if exists(select 1 from public.agency_client_workspaces where id=p_workspace and owner_user_id=auth.uid()) then return true;end if;
 if p_module='team' and p_level in ('write','manage') then return agency_private.workspace_administrator(p_workspace);end if;
 select role into legacy from public.agency_workspace_members where workspace_id=p_workspace and user_id=auth.uid();
 if exists(select 1 from public.agency_workspace_member_roles where workspace_id=p_workspace and user_id=auth.uid()) then
 needed:=case p_level when 'read' then 1 when 'write' then 2 when 'manage' then 3 else 99 end;
 return exists(select 1 from public.agency_workspace_member_roles mr join public.agency_workspace_roles r on r.id=mr.role_id and r.workspace_id=mr.workspace_id where mr.workspace_id=p_workspace and mr.user_id=auth.uid() and (r.admin_total or (p_module='team' and r.permissions->>'settings'='manage') or (case r.permissions->>p_module when 'read' then 1 when 'write' then 2 when 'manage' then 3 else 0 end)>=needed));
 end if;
 return legacy in ('owner','admin') or (p_level='read' and legacy in ('agent','viewer')) or (p_level='write' and legacy='agent' and p_module in ('crm','conversations','calendar','tasks'));
end;$$;
revoke all on function agency_private.workspace_permission(uuid,text,text) from public,anon;grant execute on function agency_private.workspace_permission(uuid,text,text) to authenticated,service_role;
create or replace function agency_private.workspace_manage(p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$select agency_private.workspace_administrator(p_workspace);$$;
create policy workspace_roles_read on public.agency_workspace_roles for select to authenticated using(agency_private.workspace_access(workspace_id));
create policy workspace_member_roles_read on public.agency_workspace_member_roles for select to authenticated using(agency_private.workspace_access(workspace_id));
create function agency_private.save_workspace_role(p_workspace uuid,p_id uuid,p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;begin
 if not agency_private.workspace_manage(p_workspace) or not agency_private.workspace_access(p_workspace,true) then raise exception 'Somente administradores podem configurar funções.' using errcode='42501';end if;
 if p_values is null then
 if exists(select 1 from public.agency_workspace_member_roles where workspace_id=p_workspace and role_id=p_id) then raise exception 'Remova esta função dos membros antes de excluí-la.';end if;
 delete from public.agency_workspace_roles where workspace_id=p_workspace and id=p_id;return p_id;end if;
 if jsonb_typeof(p_values->'permissions') is distinct from 'object' or exists(select 1 from jsonb_each_text(p_values->'permissions') where key not in ('crm','forms','calendar','flows','conversations','tasks','settings','team') or value not in ('none','read','write','manage')) then raise exception 'Permissões inválidas.';end if;
 if coalesce(p_values->'permissions'->>'team','none') not in ('none','read') then raise exception 'A gestão de membros exige Administrador total.';end if;
 if jsonb_typeof(coalesce(p_values->'notifications','{}'))<>'object' or exists(select 1 from jsonb_each(coalesce(p_values->'notifications','{}')) where key not in ('lead_assigned','stage_changed','appointment_created','appointment_changed') or jsonb_typeof(value)<>'boolean') then raise exception 'Notificações inválidas.';end if;
 if p_id is null then insert into public.agency_workspace_roles(workspace_id,name,color,admin_total,permissions,notifications) values(p_workspace,trim(p_values->>'name'),coalesce(p_values->>'color','#8b5cf6'),coalesce((p_values->>'admin_total')::boolean,false),p_values->'permissions',coalesce(p_values->'notifications','{}')) returning id into result;
 else update public.agency_workspace_roles set name=trim(p_values->>'name'),color=coalesce(p_values->>'color','#8b5cf6'),admin_total=coalesce((p_values->>'admin_total')::boolean,false),permissions=p_values->'permissions',notifications=coalesce(p_values->'notifications','{}') where id=p_id and workspace_id=p_workspace returning id into result;if result is null then raise exception 'Função não encontrada.';end if;end if;return result;
end;$$;
revoke all on function agency_private.save_workspace_role(uuid,uuid,jsonb) from public,anon;grant execute on function agency_private.save_workspace_role(uuid,uuid,jsonb) to authenticated;
create function public.agency_workspace_save_role(p_workspace uuid,p_id uuid default null,p_values jsonb default null) returns uuid language sql security invoker set search_path='' as $$select agency_private.save_workspace_role(p_workspace,p_id,p_values);$$;
revoke all on function public.agency_workspace_save_role(uuid,uuid,jsonb) from public,anon;grant execute on function public.agency_workspace_save_role(uuid,uuid,jsonb) to authenticated;
create function agency_private.assign_workspace_role(p_workspace uuid,p_user uuid,p_role uuid,p_assign boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not agency_private.workspace_manage(p_workspace) or not agency_private.workspace_access(p_workspace,true) then raise exception 'Sem permissão para alterar funções.' using errcode='42501';end if;
 if exists(select 1 from public.agency_client_workspaces where id=p_workspace and owner_user_id=p_user) then raise exception 'O proprietário mantém acesso total.';end if;
 if not exists(select 1 from public.agency_workspace_members where workspace_id=p_workspace and user_id=p_user) or not exists(select 1 from public.agency_workspace_roles where workspace_id=p_workspace and id=p_role) then raise exception 'Membro ou função de outra empresa.';end if;
 if p_assign then insert into public.agency_workspace_member_roles values(p_workspace,p_user,p_role) on conflict do nothing;else delete from public.agency_workspace_member_roles where workspace_id=p_workspace and user_id=p_user and role_id=p_role;end if;
end;$$;
revoke all on function agency_private.assign_workspace_role(uuid,uuid,uuid,boolean) from public,anon;grant execute on function agency_private.assign_workspace_role(uuid,uuid,uuid,boolean) to authenticated;
create function public.agency_workspace_assign_role(p_workspace uuid,p_user uuid,p_role uuid,p_assign boolean default true) returns void language sql security invoker set search_path='' as $$select agency_private.assign_workspace_role(p_workspace,p_user,p_role,p_assign);$$;
revoke all on function public.agency_workspace_assign_role(uuid,uuid,uuid,boolean) from public,anon;grant execute on function public.agency_workspace_assign_role(uuid,uuid,uuid,boolean) to authenticated;
-- Replace permissive baseline policies with explicit module authorization. Read metadata for selectors remains scoped to the workspace.
do $$declare row record;p record;begin
 for row in select * from (values
 ('agency_workspace_leads','crm','write'),('agency_workspace_pipelines','crm','manage'),('agency_workspace_stages','crm','manage'),
 ('agency_workspace_forms','forms','manage'),('agency_workspace_form_submissions','forms','write'),('agency_workspace_form_views','forms','manage'),
 ('agency_workspace_calendars','calendar','manage'),('agency_workspace_appointments','calendar','write'),
 ('agency_workspace_flows','flows','manage'),('agency_workspace_flow_runs','flows','manage'),('agency_workspace_flow_steps','flows','manage'),
 ('agency_workspace_tasks','tasks','write'),('agency_workspace_notifications','tasks','write'),
 ('agency_workspace_messages','conversations','write'),('agency_workspace_whatsapp_accounts','conversations','manage'),
 ('agency_workspace_message_outbox','conversations','write'),('agency_workspace_events','flows','manage'),
 ('agency_workspace_tracking_links','settings','manage'),('agency_workspace_tracking_clicks','settings','manage'),
 ('agency_workspace_conversion_rules','settings','manage'),('agency_workspace_action_outbox','settings','manage'),('agency_workspace_webhook_receipts','flows','manage')) as v(tab,mod,level) loop
 for p in select policyname from pg_policies where schemaname='public' and tablename=row.tab loop execute format('drop policy %I on public.%I',p.policyname,row.tab);end loop;
 execute format('create policy workspace_scoped_read on public.%I for select to authenticated using(agency_private.workspace_permission(workspace_id,%L,''read''))',row.tab,row.mod);
 -- Read-only execution/history tables keep their existing SQL grants; policies never add grants.
 execute format('create policy workspace_scoped_insert on public.%I for insert to authenticated with check(agency_private.workspace_permission(workspace_id,%L,%L))',row.tab,row.mod,row.level);
 execute format('create policy workspace_scoped_update on public.%I for update to authenticated using(agency_private.workspace_permission(workspace_id,%L,%L)) with check(agency_private.workspace_permission(workspace_id,%L,%L))',row.tab,row.mod,row.level,row.mod,row.level);
 execute format('create policy workspace_scoped_delete on public.%I for delete to authenticated using(agency_private.workspace_permission(workspace_id,%L,''manage''))',row.tab,row.mod);
 end loop;
end;$$;
-- Keep baseline API contract and add per-module permissions for frontend and Edge checks.
create or replace function public.agency_workspace_permissions(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_build_object('can_read',agency_private.workspace_access(p_workspace),'can_write',agency_private.workspace_access(p_workspace,true),'can_manage',agency_private.workspace_manage(p_workspace),'pilot_owner',agency_private.pilot_enabled(),'modules',(select jsonb_object_agg(module,jsonb_build_object('read',agency_private.workspace_permission(p_workspace,module,'read'),'write',agency_private.workspace_permission(p_workspace,module,'write'),'manage',agency_private.workspace_permission(p_workspace,module,'manage'))) from unnest(array['crm','forms','calendar','flows','conversations','tasks','settings','team']) module));$$;
-- Form presentation is workspace-specific; legacy agency form rendering is untouched.
alter table public.agency_workspace_forms add column presentation jsonb not null default '{}';
alter table public.agency_workspace_forms add constraint workspace_form_presentation check(jsonb_typeof(presentation)='object' and length(presentation::text)<=12000);
grant insert(presentation),update(presentation) on public.agency_workspace_forms to authenticated;
create table public.agency_workspace_member_notifications(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,user_id uuid not null,event_id uuid not null references public.agency_workspace_events(id) on delete cascade,title text not null,read_at timestamptz,created_at timestamptz not null default now(),unique(user_id,event_id),foreign key(workspace_id,user_id) references public.agency_workspace_members(workspace_id,user_id) on delete cascade);
create index workspace_member_notifications_inbox on public.agency_workspace_member_notifications(workspace_id,user_id,created_at);
alter table public.agency_workspace_member_notifications enable row level security;revoke all on public.agency_workspace_member_notifications from public,anon,authenticated;grant select,update(read_at) on public.agency_workspace_member_notifications to authenticated;grant all on public.agency_workspace_member_notifications to service_role;
create policy workspace_personal_notifications_read on public.agency_workspace_member_notifications for select to authenticated using(user_id=(select auth.uid()) and agency_private.workspace_access(workspace_id));
create policy workspace_personal_notifications_update on public.agency_workspace_member_notifications for update to authenticated using(user_id=(select auth.uid()) and agency_private.workspace_access(workspace_id)) with check(user_id=(select auth.uid()) and agency_private.workspace_access(workspace_id));
create function agency_private.notify_workspace_members() returns trigger language plpgsql security definer set search_path='' as $$declare k text;begin
 k:=case new.event_type when 'stage_changed' then 'stage_changed' when 'lead_assigned' then 'lead_assigned' when 'appointment_created' then 'appointment_created' when 'appointment_changed' then 'appointment_changed' end;if k is null then return new;end if;
 insert into public.agency_workspace_member_notifications(workspace_id,user_id,event_id,title)
 select distinct new.workspace_id,mr.user_id,new.id,case k when 'stage_changed' then 'Lead mudou de etapa' when 'lead_assigned' then 'Novo lead atribuído' when 'appointment_created' then 'Novo agendamento recebido' else 'Agendamento alterado' end
 from public.agency_workspace_member_roles mr join public.agency_workspace_roles r on r.id=mr.role_id and r.workspace_id=mr.workspace_id
 where mr.workspace_id=new.workspace_id and coalesce((r.notifications->>k)::boolean,false) and (k<>'lead_assigned' or mr.user_id::text=new.payload->>'assignee_user_id') on conflict(user_id,event_id) do nothing;return new;
end;$$;
revoke all on function agency_private.notify_workspace_members() from public,anon,authenticated;
create trigger workspace_role_notifications after insert on public.agency_workspace_events for each row execute function agency_private.notify_workspace_members();
create function agency_private.workspace_assignment_notification() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.assignee_user_id is not null and (tg_op='INSERT' or new.assignee_user_id is distinct from old.assignee_user_id) then perform agency_private.emit_workspace_event(new.workspace_id,'lead_assigned',new.id,new.id::text,jsonb_build_object('assignee_user_id',new.assignee_user_id));end if;return new;
end;$$;
revoke all on function agency_private.workspace_assignment_notification() from public,anon,authenticated;
create trigger workspace_assignment_notification after insert or update of assignee_user_id on public.agency_workspace_leads for each row execute function agency_private.workspace_assignment_notification();
create function agency_private.workspace_appointment_notification() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and (new.starts_at is distinct from old.starts_at or new.status is distinct from old.status) then perform agency_private.emit_workspace_event(new.workspace_id,'appointment_changed',new.lead_id,new.id::text,jsonb_build_object('appointment_id',new.id,'status',new.status));end if;return new;
end;$$;
revoke all on function agency_private.workspace_appointment_notification() from public,anon,authenticated;
create trigger workspace_appointment_notification after update on public.agency_workspace_appointments for each row execute function agency_private.workspace_appointment_notification();

drop policy workspace_scoped_read on public.agency_workspace_pipelines;
create policy workspace_scoped_read on public.agency_workspace_pipelines for select to authenticated using(agency_private.workspace_permission(workspace_id,'crm','read') or agency_private.workspace_permission(workspace_id,'forms','read') or agency_private.workspace_permission(workspace_id,'calendar','read') or agency_private.workspace_permission(workspace_id,'flows','read') or agency_private.workspace_permission(workspace_id,'settings','read'));
drop policy workspace_scoped_read on public.agency_workspace_stages;
create policy workspace_scoped_read on public.agency_workspace_stages for select to authenticated using(agency_private.workspace_permission(workspace_id,'crm','read') or agency_private.workspace_permission(workspace_id,'forms','read') or agency_private.workspace_permission(workspace_id,'calendar','read') or agency_private.workspace_permission(workspace_id,'flows','read') or agency_private.workspace_permission(workspace_id,'settings','read'));
create function agency_private.validate_workspace_form_schema() returns trigger language plpgsql security invoker set search_path='' as $$declare f jsonb;ids text[]:='{}';begin
 if exists(select 1 from jsonb_each_text(new.presentation) where key in ('primary','background','text') and value!~'^#[a-fA-F0-9]{6}$') or coalesce(new.presentation->>'layout','all') not in ('all','step') or coalesce(new.presentation->>'font','sans') not in ('sans','serif','mono') or coalesce(new.presentation->>'alignment','left') not in ('left','center') then raise exception 'Aparência inválida.';end if;
 foreach f in array (select array_agg(value) from jsonb_array_elements(new.fields)) loop
 if coalesce(f->>'id','')!~'^[A-Za-z0-9_-]{1,100}$' or f->>'id'=any(ids) or length(trim(coalesce(f->>'label',''))) not between 1 and 500 or coalesce(f->>'type','') not in ('text','textarea','email','tel','number','date','select') then raise exception 'Definição de pergunta inválida.';end if;
 if jsonb_typeof(f->'required') is distinct from 'boolean' then raise exception 'Obrigatoriedade inválida.';end if;
 if (f->>'input_style'='multi' and f->>'type'<>'textarea') or (f->>'input_style' in ('radio','dropdown','yesno','rating') and f->>'type'<>'select') then raise exception 'Estilo de resposta incompatível.';end if;
 if coalesce(f->>'input_style','') not in ('','dropdown','radio','multi','rating','yesno','url') or length(coalesce(f->>'description',''))>1000 or length(coalesce(f->>'placeholder',''))>200 or length(coalesce(f->>'button_text',''))>80 then raise exception 'Propriedades de pergunta inválidas.';end if;
 if f->>'type'='select' or f->>'input_style'='multi' then if jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options') not between 1 and 50 or exists(select 1 from jsonb_array_elements_text(f->'options') o where length(trim(o)) not between 1 and 200) or (select count(distinct v) from jsonb_array_elements_text(f->'options') v)<>jsonb_array_length(f->'options') then raise exception 'Revise as opções da pergunta.';end if;end if;
 if f ? 'condition' and f->'condition'<>'null' then if not(coalesce(f->'condition'->>'fieldId','')=any(ids)) or coalesce(f->'condition'->>'operator','') not in ('equals','not_equals','contains','filled','not_filled') then raise exception 'A lógica deve usar uma pergunta anterior.';end if;end if;
 ids:=array_append(ids,f->>'id');end loop;
 if new.capture_lead and (not(coalesce(new.contact_map->>'name','')=any(ids)) or not(coalesce(new.contact_map->>'phone','')=any(ids) or coalesce(new.contact_map->>'email','')=any(ids))) then raise exception 'Mapeie nome e telefone ou e-mail para o CRM.';end if;
 if new.capture_lead and (not exists(select 1 from jsonb_array_elements(new.fields) as q(question) where q.question->>'id'=new.contact_map->>'name' and q.question->>'required'='true' and coalesce(q.question->'condition','null')='null') or not exists(select 1 from jsonb_array_elements(new.fields) as q(question) where q.question->>'id' in (new.contact_map->>'phone',new.contact_map->>'email') and q.question->>'required'='true' and coalesce(q.question->'condition','null')='null')) then raise exception 'Nome e telefone ou e-mail devem ser obrigatórios e sempre visíveis para captar leads.';end if;return new;
end;$$;
revoke all on function agency_private.validate_workspace_form_schema() from public,anon,authenticated;
create trigger workspace_form_schema before insert or update on public.agency_workspace_forms for each row execute function agency_private.validate_workspace_form_schema();

create or replace function agency_private.workspace_access(p_workspace uuid,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=p_workspace and (not p_write or w.status='active') and (w.owner_user_id=auth.uid() or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=auth.uid() and (not p_write or m.role in ('owner','admin','agent') or exists(select 1 from public.agency_workspace_member_roles mr join public.agency_workspace_roles r on r.id=mr.role_id and r.workspace_id=mr.workspace_id where mr.workspace_id=w.id and mr.user_id=auth.uid() and (r.admin_total or exists(select 1 from jsonb_each_text(r.permissions) where value in ('write','manage'))))))));$$;

create or replace function public.agency_workspace_save_pipeline(p_workspace uuid,p_name text,p_stages jsonb,p_id uuid default null) returns uuid language plpgsql security invoker set search_path='' as $$
 declare p uuid;item jsonb;s uuid;ids uuid[]:=array[]::uuid[];pos integer:=0;begin
 if not agency_private.workspace_permission(p_workspace,'crm','manage') or not agency_private.workspace_access(p_workspace,true) then raise exception 'Sem permissão nesta subconta.' using errcode='42501';end if;
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

drop policy pilot_workspaces_update on public.agency_client_workspaces;
create policy pilot_workspaces_update on public.agency_client_workspaces for update to authenticated using(agency_private.workspace_permission(id,'settings','manage')) with check(agency_private.workspace_permission(id,'settings','manage'));
create or replace function agency_private.workspace_webhook_owned(p_workspace uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select agency_private.workspace_permission(p_workspace,'flows','manage') and exists(select 1 from agency_private.workspace_automation_webhooks where workspace_id=p_workspace and id=p_id);$$;
