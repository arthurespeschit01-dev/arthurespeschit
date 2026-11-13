-- Commercial modules are isolated to the pilot workspaces and explicit member invitations.
alter table public.agency_workspace_members add column display_name text not null default '',add column email text not null default '';
revoke insert,update,delete on public.agency_workspace_members from authenticated;
create or replace function agency_private.workspace_access(p_workspace uuid,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=p_workspace and (not p_write or w.status='active') and (w.owner_user_id=auth.uid() or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=auth.uid() and (not p_write or m.role in ('owner','admin','agent')))));
$$;
create or replace function agency_private.workspace_manage(p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select agency_private.workspace_access(p_workspace) and exists(select 1 from public.agency_client_workspaces w where w.id=p_workspace and (w.owner_user_id=auth.uid() or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=auth.uid() and m.role in ('owner','admin'))));
$$;
create function agency_private.has_workspace_access() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.agency_workspace_members m join public.agency_client_workspaces w on w.id=m.workspace_id join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where m.user_id=auth.uid()); $$;
revoke all on function agency_private.has_workspace_access() from public,anon;grant execute on function agency_private.has_workspace_access() to authenticated;
create or replace function public.agency_pilot_status() returns boolean language sql stable security invoker set search_path='' as $$ select agency_private.pilot_enabled() or agency_private.has_workspace_access(); $$;
create function public.agency_workspace_identity() returns jsonb language sql stable security invoker set search_path='' as $$ select jsonb_build_object('pilot_owner',agency_private.pilot_enabled()); $$;
revoke all on function public.agency_workspace_identity() from public,anon;grant execute on function public.agency_workspace_identity() to authenticated;
create function public.agency_workspace_permissions(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select jsonb_build_object('can_read',agency_private.workspace_access(p_workspace),'can_write',agency_private.workspace_access(p_workspace,true),'can_manage',agency_private.workspace_manage(p_workspace),'pilot_owner',agency_private.pilot_enabled()); $$;
revoke all on function public.agency_workspace_permissions(uuid) from public,anon;grant execute on function public.agency_workspace_permissions(uuid) to authenticated;
drop policy pilot_workspaces_read on public.agency_client_workspaces;create policy pilot_workspaces_read on public.agency_client_workspaces for select to authenticated using(agency_private.workspace_access(id));
-- INSERT RETURNING must also see a just-created row before a lookup helper's snapshot sees it.
create policy pilot_workspaces_owner_read on public.agency_client_workspaces for select to authenticated using((select agency_private.pilot_enabled()) and owner_user_id=(select auth.uid()));
drop policy pilot_workspaces_update on public.agency_client_workspaces;create policy pilot_workspaces_update on public.agency_client_workspaces for update to authenticated using(agency_private.workspace_manage(id)) with check(agency_private.workspace_manage(id));

alter table public.agency_workspace_leads add column tags text[] not null default '{}',add column assignee_user_id uuid references auth.users(id),add column source_type text not null default 'manual' check(source_type in ('manual','form','appointment','whatsapp','meta','import')),add column source_id text;
alter table public.agency_workspace_leads add constraint workspace_lead_scope unique(id,workspace_id);
create index workspace_lead_assignee on public.agency_workspace_leads(assignee_user_id);
create function agency_private.contact_key(p_phone text,p_email text default '') returns text language sql immutable set search_path='' as $$
 select case when coalesce(p_phone,'')~'@(g[.]us|lid)$' then p_phone when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')<>'' then case when regexp_replace(p_phone,'[^0-9]','','g')~'^55[0-9]{10,11}$' then substr(regexp_replace(p_phone,'[^0-9]','','g'),3,2)||right(regexp_replace(p_phone,'[^0-9]','','g'),8) else regexp_replace(p_phone,'[^0-9]','','g') end when trim(coalesce(p_email,''))<>'' then 'email:'||lower(trim(p_email)) else null end;
$$;
revoke all on function agency_private.contact_key(text,text) from public,anon;grant execute on function agency_private.contact_key(text,text) to authenticated,service_role;
create index workspace_contact_lookup on public.agency_workspace_leads(workspace_id,pipeline_id,agency_private.contact_key(phone,email));

create table public.agency_workspace_forms(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,title text not null check(length(trim(title)) between 1 and 160),description text not null default '' check(length(description)<=4000),fields jsonb not null default '[]' check(jsonb_typeof(fields)='array' and jsonb_array_length(fields) between 1 and 50),contact_map jsonb not null default '{"name":"name","phone":"phone","email":"email"}',capture_lead boolean not null default true,pipeline_id uuid,stage_id uuid,token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') check(token~'^[a-f0-9]{64}$'),enabled boolean not null default true,success_message text not null default 'Recebemos suas informações. Obrigado!' check(length(success_message)<=1000),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(stage_id,pipeline_id,workspace_id) references public.agency_workspace_stages(id,pipeline_id,workspace_id),check(not capture_lead or (pipeline_id is not null and stage_id is not null)),unique(id,workspace_id));
create index workspace_forms_scope on public.agency_workspace_forms(workspace_id);
create index workspace_forms_stage on public.agency_workspace_forms(stage_id,pipeline_id,workspace_id);
create table public.agency_workspace_form_submissions(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,form_id uuid not null,request_id uuid not null,lead_id uuid,answers jsonb not null,form_title text not null,analyzed_at timestamptz,created_at timestamptz not null default now(),unique(form_id,request_id),foreign key(form_id,workspace_id) references public.agency_workspace_forms(id,workspace_id) on delete cascade,foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id));
create index workspace_submissions_scope on public.agency_workspace_form_submissions(workspace_id,created_at);
create index workspace_submissions_lead on public.agency_workspace_form_submissions(lead_id,workspace_id);
create table public.agency_workspace_form_views(form_id uuid not null references public.agency_workspace_forms(id) on delete cascade,workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,view_id uuid not null,created_at timestamptz not null default now(),primary key(form_id,view_id));
create index workspace_form_views_scope on public.agency_workspace_form_views(workspace_id);

create table public.agency_workspace_calendars(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,title text not null check(length(trim(title)) between 1 and 160),description text not null default '' check(length(description)<=4000),duration_minutes integer not null default 30 check(duration_minutes between 10 and 240),timezone text not null default 'America/Sao_Paulo',availability jsonb not null default '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00","buffer":0}',pipeline_id uuid not null,stage_id uuid not null,token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') check(token~'^[a-f0-9]{64}$'),enabled boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(stage_id,pipeline_id,workspace_id) references public.agency_workspace_stages(id,pipeline_id,workspace_id),unique(id,workspace_id));
create index workspace_calendars_scope on public.agency_workspace_calendars(workspace_id);create index workspace_calendars_stage on public.agency_workspace_calendars(stage_id,pipeline_id,workspace_id);
create table public.agency_workspace_appointments(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,calendar_id uuid not null,lead_id uuid,request_id uuid not null default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 160),phone text not null default '' check(length(phone)<=40),email text not null default '' check(length(email)<=254),starts_at timestamptz not null,ends_at timestamptz not null,status text not null default 'confirmed' check(status in ('confirmed','completed','cancelled','no_show')),notes text not null default '' check(length(notes)<=4000),source text not null default 'internal' check(source in ('internal','public')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(calendar_id,request_id),foreign key(calendar_id,workspace_id) references public.agency_workspace_calendars(id,workspace_id) on delete cascade,foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id),check(ends_at>starts_at and ends_at<=starts_at+interval '4 hours'));
create index workspace_appointments_scope on public.agency_workspace_appointments(workspace_id,starts_at);create index workspace_appointments_conflicts on public.agency_workspace_appointments(calendar_id,starts_at,ends_at) where status='confirmed';create index workspace_appointments_lead on public.agency_workspace_appointments(lead_id,workspace_id);

create table public.agency_workspace_invitations(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,email text not null check(email=lower(trim(email)) and email~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),display_name text not null default '' check(length(display_name)<=160),role text not null check(role in ('admin','agent','viewer')),token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),status text not null default 'pending' check(status in ('pending','accepted','revoked')),invited_by uuid not null default auth.uid() references auth.users(id),accepted_by uuid references auth.users(id),expires_at timestamptz not null default now()+interval '7 days',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index workspace_invites_scope on public.agency_workspace_invitations(workspace_id);create index workspace_invites_author on public.agency_workspace_invitations(invited_by);create index workspace_invites_accepted on public.agency_workspace_invitations(accepted_by);

create table public.agency_workspace_flows(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 160),enabled boolean not null default false,version integer not null default 1,definition jsonb not null default '{"nodes":[],"edges":[]}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,workspace_id));
create index workspace_flows_scope on public.agency_workspace_flows(workspace_id);
create table public.agency_workspace_events(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,event_type text not null,lead_id uuid,source_id text,payload jsonb not null default '{}',origin_run uuid,depth integer not null default 0 check(depth between 0 and 8),created_at timestamptz not null default now(),foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id));
create index workspace_events_scope on public.agency_workspace_events(workspace_id,created_at);create index workspace_events_lead on public.agency_workspace_events(lead_id,workspace_id);
create table public.agency_workspace_flow_runs(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,flow_id uuid not null,event_id uuid not null references public.agency_workspace_events(id) on delete cascade,definition jsonb not null,version integer not null,status text not null default 'queued' check(status in ('queued','running','waiting','completed','failed','cancelled')),cursor text,next_run_at timestamptz not null default now(),error text,created_at timestamptz not null default now(),finished_at timestamptz,unique(flow_id,event_id),foreign key(flow_id,workspace_id) references public.agency_workspace_flows(id,workspace_id) on delete cascade);
create index workspace_runs_due on public.agency_workspace_flow_runs(next_run_at) where status in ('queued','waiting');create index workspace_runs_scope on public.agency_workspace_flow_runs(workspace_id,created_at);create index workspace_runs_event on public.agency_workspace_flow_runs(event_id);
create table public.agency_workspace_flow_steps(run_id uuid not null references public.agency_workspace_flow_runs(id) on delete cascade,node_id text not null,workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,action text not null,status text not null check(status in ('completed','waiting','failed')),detail text,created_at timestamptz not null default now(),primary key(run_id,node_id));
create index workspace_steps_scope on public.agency_workspace_flow_steps(workspace_id);
create table public.agency_workspace_tasks(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,lead_id uuid,title text not null check(length(trim(title)) between 1 and 200),due_at timestamptz,completed boolean not null default false,assignee_user_id uuid references auth.users(id),origin_run uuid,origin_node text,created_at timestamptz not null default now(),unique(origin_run,origin_node),foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id));
create index workspace_tasks_scope on public.agency_workspace_tasks(workspace_id);create index workspace_tasks_lead on public.agency_workspace_tasks(lead_id,workspace_id);create index workspace_tasks_assignee on public.agency_workspace_tasks(assignee_user_id);
create table public.agency_workspace_notifications(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,title text not null check(length(title)<=500),lead_id uuid,origin_run uuid,origin_node text,created_at timestamptz not null default now(),unique(origin_run,origin_node),foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id));
create index workspace_notifications_scope on public.agency_workspace_notifications(workspace_id);create index workspace_notifications_lead on public.agency_workspace_notifications(lead_id,workspace_id);

create function agency_private.commercial_scope_guard() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if new.workspace_id<>old.workspace_id then raise exception 'Os registros não podem ser transferidos entre subcontas.';end if;if tg_table_name='agency_workspace_appointments' and (to_jsonb(new)-array['updated_at','google_event_id','google_synced_at','google_sync_error'])=(to_jsonb(old)-array['updated_at','google_event_id','google_synced_at','google_sync_error']) then return new;end if;new:=jsonb_populate_record(new,jsonb_build_object('updated_at',now()));return new;
end;$$;
revoke all on function agency_private.commercial_scope_guard() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['agency_workspace_forms','agency_workspace_calendars','agency_workspace_invitations','agency_workspace_flows'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon',t);execute format('grant select,insert,update,delete on public.%I to authenticated,service_role',t);
 execute format('create policy workspace_module_read on public.%I for select to authenticated using(agency_private.workspace_access(workspace_id))',t);
 execute format('create policy workspace_module_manage on public.%I for all to authenticated using(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true))',t);
 execute format('create trigger commercial_identity before update on public.%I for each row execute function agency_private.commercial_scope_guard()',t);
 end loop;
 foreach t in array array['agency_workspace_form_submissions','agency_workspace_form_views','agency_workspace_events','agency_workspace_flow_runs','agency_workspace_flow_steps','agency_workspace_notifications'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);execute format('create policy workspace_module_read on public.%I for select to authenticated using(agency_private.workspace_access(workspace_id))',t);
 end loop;
 foreach t in array array['agency_workspace_appointments','agency_workspace_tasks'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon',t);execute format('grant select,insert,update,delete on public.%I to authenticated,service_role',t);execute format('create policy workspace_module_read on public.%I for select to authenticated using(agency_private.workspace_access(workspace_id))',t);execute format('create policy workspace_module_write on public.%I for all to authenticated using(agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_access(workspace_id,true))',t);execute format('create trigger commercial_identity before update on public.%I for each row execute function agency_private.commercial_scope_guard()',t);
 end loop;
end$$;
-- Tokens are visible only to managers; ordinary workspace readers see form/calendar definitions via their app view.
drop policy workspace_module_read on public.agency_workspace_invitations;create policy workspace_invites_read on public.agency_workspace_invitations for select to authenticated using(agency_private.workspace_manage(workspace_id));
grant update(analyzed_at) on public.agency_workspace_form_submissions to authenticated;create policy workspace_submission_review on public.agency_workspace_form_submissions for update to authenticated using(agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_access(workspace_id,true));

create function agency_private.accept_workspace_invite(p_token text) returns uuid language plpgsql security definer set search_path='' as $$ declare inv public.agency_workspace_invitations;u auth.users;begin
 if auth.uid() is null then raise exception 'Entre na sua conta para aceitar o convite.' using errcode='42501';end if;
 select * into inv from public.agency_workspace_invitations where token=p_token for update;select * into u from auth.users where id=auth.uid();
 if inv.id is null or inv.status='revoked' or inv.expires_at<now() or lower(u.email)<>inv.email or u.email_confirmed_at is null then raise exception 'Convite inválido, expirado ou destinado a outro e-mail.' using errcode='42501';end if;
 if not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=inv.workspace_id and w.status='active') then raise exception 'Esta subconta está indisponível.';end if;
 if inv.status='accepted' then if inv.accepted_by=auth.uid() then return inv.workspace_id;else raise exception 'Convite já utilizado.';end if;end if;
 if exists(select 1 from public.agency_client_workspaces where id=inv.workspace_id and owner_user_id=auth.uid()) then raise exception 'Você já é proprietário desta subconta.';end if;
 insert into public.agency_workspace_members(workspace_id,user_id,role,display_name,email) values(inv.workspace_id,auth.uid(),inv.role,inv.display_name,inv.email) on conflict(workspace_id,user_id) do update set role=excluded.role,display_name=excluded.display_name,email=excluded.email;
 update public.agency_workspace_invitations set status='accepted',accepted_by=auth.uid(),updated_at=now() where id=inv.id;return inv.workspace_id;
end;$$;
revoke all on function agency_private.accept_workspace_invite(text) from public,anon;grant execute on function agency_private.accept_workspace_invite(text) to authenticated;
create function public.agency_workspace_accept_invite(p_token text) returns uuid language sql security invoker set search_path='' as $$select agency_private.accept_workspace_invite(p_token);$$;
revoke all on function public.agency_workspace_accept_invite(text) from public,anon;grant execute on function public.agency_workspace_accept_invite(text) to authenticated;
create function agency_private.manage_workspace_member(p_workspace uuid,p_user uuid,p_role text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if not agency_private.workspace_manage(p_workspace) then raise exception 'Sem permissão nesta subconta.' using errcode='42501';end if;
 if exists(select 1 from public.agency_client_workspaces where id=p_workspace and owner_user_id=p_user) then raise exception 'O proprietário não pode ser removido ou rebaixado.';end if;
 if p_role is null then update public.agency_workspace_leads set assignee_user_id=null where workspace_id=p_workspace and assignee_user_id=p_user;update public.agency_workspace_tasks set assignee_user_id=null where workspace_id=p_workspace and assignee_user_id=p_user;delete from public.agency_workspace_members where workspace_id=p_workspace and user_id=p_user;update public.agency_workspace_invitations set status='revoked' where workspace_id=p_workspace and accepted_by=p_user;
 else if p_role not in ('admin','agent','viewer') then raise exception 'Papel inválido.';end if;update public.agency_workspace_members set role=p_role where workspace_id=p_workspace and user_id=p_user;end if;
end;$$;
revoke all on function agency_private.manage_workspace_member(uuid,uuid,text) from public,anon;grant execute on function agency_private.manage_workspace_member(uuid,uuid,text) to authenticated;
create function public.agency_workspace_manage_member(p_workspace uuid,p_user uuid,p_role text default null) returns void language sql security invoker set search_path='' as $$select agency_private.manage_workspace_member(p_workspace,p_user,p_role);$$;
revoke all on function public.agency_workspace_manage_member(uuid,uuid,text) from public,anon;grant execute on function public.agency_workspace_manage_member(uuid,uuid,text) to authenticated;

create function agency_private.capture_contact(p_workspace uuid,p_pipeline uuid,p_stage uuid,p_name text,p_phone text,p_email text,p_source text,p_source_id text) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid;k text;begin
 if not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=p_workspace and w.status='active') then raise exception 'Subconta indisponível.';end if;
 perform 1 from public.agency_workspace_pipelines where id=p_pipeline and workspace_id=p_workspace for update;if not found or not exists(select 1 from public.agency_workspace_stages where id=p_stage and pipeline_id=p_pipeline and workspace_id=p_workspace) then raise exception 'Etapa de entrada inválida.';end if;
 perform 1 from public.agency_client_workspaces where id=p_workspace for update;k:=agency_private.contact_key(p_phone,p_email);if k is not null then select id into result from public.agency_workspace_leads l where l.workspace_id=p_workspace and (agency_private.contact_key(l.phone,l.email)=k or (trim(coalesce(p_email,''))<>'' and lower(l.email)=lower(trim(p_email)))) order by (l.pipeline_id=p_pipeline) desc,l.created_at desc limit 1 for update;end if;
 if result is null then insert into public.agency_workspace_leads(workspace_id,pipeline_id,stage_id,name,phone,email,source_type,source_id) values(p_workspace,p_pipeline,p_stage,coalesce(nullif(trim(p_name),''),nullif(trim(p_phone),''),nullif(trim(p_email),''),'Novo contato'),coalesce(trim(p_phone),''),coalesce(trim(p_email),''),p_source,p_source_id) returning id into result;
 else update public.agency_workspace_leads set name=case when name=phone or name='Novo contato' then coalesce(nullif(trim(p_name),''),name) else name end,phone=case when phone='' then coalesce(p_phone,'') else phone end,email=case when email='' then coalesce(p_email,'') else email end where id=result;end if;return result;
end;$$;
revoke all on function agency_private.capture_contact(uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;

create function agency_private.emit_workspace_event(p_workspace uuid,p_type text,p_lead uuid,p_source text,p_payload jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$ declare event_id uuid;origin uuid;d integer:=0;begin
 origin:=nullif(current_setting('agency.workflow_run',true),'')::uuid;if origin is not null then select e.depth+1 into d from public.agency_workspace_flow_runs r join public.agency_workspace_events e on e.id=r.event_id where r.id=origin;end if;
 if coalesce(d,0)>8 then return null;end if;
 insert into public.agency_workspace_events(workspace_id,event_type,lead_id,source_id,payload,origin_run,depth) values(p_workspace,p_type,p_lead,p_source,p_payload,origin,coalesce(d,0)) returning id into event_id;return event_id;
end;$$;
revoke all on function agency_private.emit_workspace_event(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
create function agency_private.workspace_lead_events() returns trigger language plpgsql security definer set search_path='' as $$ declare tag text;begin
 if tg_op='INSERT' then perform agency_private.emit_workspace_event(new.workspace_id,'lead_created',new.id,new.source_id,jsonb_build_object('source',new.source_type,'name',new.name,'phone',new.phone,'email',new.email,'stage_id',new.stage_id));
 else if new.stage_id<>old.stage_id then perform agency_private.emit_workspace_event(new.workspace_id,'stage_changed',new.id,new.stage_id::text,jsonb_build_object('old_stage_id',old.stage_id,'stage_id',new.stage_id));end if;foreach tag in array new.tags loop if not(tag=any(old.tags)) then perform agency_private.emit_workspace_event(new.workspace_id,'tag_added',new.id,tag,jsonb_build_object('tag',tag));end if;end loop;end if;return new;
end;$$;
revoke all on function agency_private.workspace_lead_events() from public,anon,authenticated;
create trigger workspace_lead_events after insert or update on public.agency_workspace_leads for each row execute function agency_private.workspace_lead_events();
create function agency_private.validate_workspace_lead() returns trigger language plpgsql security invoker set search_path='' as $$ declare tag text;begin
 if cardinality(new.tags)>30 then raise exception 'Use no máximo 30 etiquetas por lead.';end if;foreach tag in array new.tags loop if tag is null or length(trim(tag)) not between 1 and 60 then raise exception 'Etiqueta inválida.';end if;end loop;
 if new.assignee_user_id is not null and not exists(select 1 from public.agency_workspace_members where workspace_id=new.workspace_id and user_id=new.assignee_user_id) then raise exception 'Responsável não pertence a esta subconta.';end if;
 if current_user='authenticated' then if tg_op='INSERT' and new.source_type not in ('manual','import') then raise exception 'A origem é definida pela integração.';end if;if tg_op='UPDATE' and (new.source_type<>old.source_type or new.source_id is distinct from old.source_id) then raise exception 'A origem não pode ser alterada manualmente.';end if;end if;return new;
end;$$;
revoke all on function agency_private.validate_workspace_lead() from public,anon,authenticated;
create trigger workspace_lead_validation before insert or update on public.agency_workspace_leads for each row execute function agency_private.validate_workspace_lead();

create function public.agency_workspace_submit_form(p_token text,p_request uuid,p_answers jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$ declare f public.agency_workspace_forms;existing public.agency_workspace_form_submissions;lead uuid;result uuid;begin
 select * into f from public.agency_workspace_forms where token=p_token and enabled for update;
 if f.id is null or not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=f.workspace_id and w.status='active') then raise exception 'Link inválido ou desativado.';end if;
 select * into existing from public.agency_workspace_form_submissions where form_id=f.id and request_id=p_request;if existing.id is not null then if existing.answers<>p_answers then raise exception 'Solicitação já utilizada.';end if;return jsonb_build_object('ok',true);end if;
 if (select count(*) from public.agency_workspace_form_submissions where form_id=f.id and created_at>now()-interval '1 minute')>=20 then raise exception 'Muitos envios. Aguarde um minuto.';end if;
 if jsonb_typeof(p_answers)<>'object' or length(p_answers::text)>50000 then raise exception 'Respostas inválidas.';end if;
 if f.capture_lead then lead:=agency_private.capture_contact(f.workspace_id,f.pipeline_id,f.stage_id,p_answers->(f.contact_map->>'name')->>'value',p_answers->(f.contact_map->>'phone')->>'value',p_answers->(f.contact_map->>'email')->>'value','form',f.id::text);end if;
 insert into public.agency_workspace_form_submissions(workspace_id,form_id,request_id,lead_id,answers,form_title) values(f.workspace_id,f.id,p_request,lead,p_answers,f.title) returning id into result;
 perform agency_private.emit_workspace_event(f.workspace_id,'form_submitted',lead,f.id::text,jsonb_build_object('form_id',f.id,'submission_id',result,'answers',p_answers));return jsonb_build_object('ok',true,'message',f.success_message);
end;$$;
revoke all on function public.agency_workspace_submit_form(text,uuid,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_submit_form(text,uuid,jsonb) to service_role;

create function agency_private.validate_workspace_calendar() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Fuso horário inválido.';end if;
 if jsonb_typeof(new.availability->'days') is distinct from 'array' or jsonb_array_length(new.availability->'days') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(new.availability->'days') d where d.value!~'^[1-7]$') or coalesce(new.availability->>'start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(new.availability->>'end','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (new.availability->>'end')::time<=(new.availability->>'start')::time or coalesce((new.availability->>'buffer')::integer,0) not between 0 and 120 then raise exception 'Disponibilidade inválida.';end if;return new;
end;$$;
revoke all on function agency_private.validate_workspace_calendar() from public,anon,authenticated;
create trigger workspace_calendar_validation before insert or update on public.agency_workspace_calendars for each row execute function agency_private.validate_workspace_calendar();
create function agency_private.validate_workspace_appointment() returns trigger language plpgsql security definer set search_path='' as $$ declare c public.agency_workspace_calendars;local_start timestamp;local_end timestamp;buffer interval;begin
 select * into c from public.agency_workspace_calendars where id=new.calendar_id and workspace_id=new.workspace_id for update;if c.id is null then raise exception 'Agenda não encontrada.';end if;
 if tg_op='INSERT' and new.lead_id is null then new.lead_id:=agency_private.capture_contact(new.workspace_id,c.pipeline_id,c.stage_id,new.name,new.phone,new.email,'appointment',c.id::text);end if;
 if new.status='confirmed' then
 if not c.enabled then raise exception 'Agenda desativada.';end if;
 if new.ends_at<>new.starts_at+make_interval(mins=>c.duration_minutes) then raise exception 'Duração incompatível com a agenda.';end if;
 buffer:=make_interval(mins=>coalesce((c.availability->>'buffer')::int,0));
 if exists(select 1 from public.agency_workspace_appointments a where a.calendar_id=c.id and a.id<>new.id and a.status='confirmed' and a.starts_at-buffer<new.ends_at and a.ends_at+buffer>new.starts_at) then raise exception 'Este horário acabou de ser ocupado. Escolha outro.' using errcode='23P01';end if;
 if new.source='public' then local_start:=new.starts_at at time zone c.timezone;local_end:=new.ends_at at time zone c.timezone;
 if new.starts_at<now()+interval '5 minutes' or new.starts_at>now()+interval '90 days' or local_start::date<>local_end::date or not(c.availability->'days' @> to_jsonb(array[extract(isodow from local_start)::int])) or local_start::time<(c.availability->>'start')::time or local_end::time>(c.availability->>'end')::time then raise exception 'Horário fora da disponibilidade.';end if;end if;end if;return new;
end;$$;
revoke all on function agency_private.validate_workspace_appointment() from public,anon,authenticated;
create trigger workspace_appointment_validation before insert or update on public.agency_workspace_appointments for each row execute function agency_private.validate_workspace_appointment();
create function agency_private.workspace_appointment_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='INSERT' then perform agency_private.emit_workspace_event(new.workspace_id,'appointment_created',new.lead_id,new.calendar_id::text,jsonb_build_object('appointment_id',new.id,'starts_at',new.starts_at,'name',new.name,'phone',new.phone,'email',new.email));end if;return new;
end;$$;
revoke all on function agency_private.workspace_appointment_event() from public,anon,authenticated;
create trigger workspace_appointment_event after insert or update on public.agency_workspace_appointments for each row execute function agency_private.workspace_appointment_event();
create function public.agency_workspace_book(p_token text,p_request uuid,p_name text,p_phone text,p_email text,p_start timestamptz,p_notes text default '') returns jsonb language plpgsql security invoker set search_path='' as $$ declare c public.agency_workspace_calendars;a public.agency_workspace_appointments;lead uuid;begin
 select * into c from public.agency_workspace_calendars where token=p_token and enabled for update;if c.id is null then raise exception 'Link inválido ou desativado.';end if;
 select * into a from public.agency_workspace_appointments where calendar_id=c.id and request_id=p_request;if a.id is not null then if a.starts_at<>p_start or a.name<>p_name then raise exception 'Solicitação já utilizada.';end if;return jsonb_build_object('ok',true);end if;
 if (select count(*) from public.agency_workspace_appointments where calendar_id=c.id and created_at>now()-interval '1 minute')>=20 then raise exception 'Muitos agendamentos. Aguarde um minuto.';end if;
 lead:=agency_private.capture_contact(c.workspace_id,c.pipeline_id,c.stage_id,p_name,p_phone,p_email,'appointment',c.id::text);
 insert into public.agency_workspace_appointments(workspace_id,calendar_id,lead_id,request_id,name,phone,email,starts_at,ends_at,source,notes) values(c.workspace_id,c.id,lead,p_request,trim(p_name),trim(p_phone),trim(p_email),p_start,p_start+make_interval(mins=>c.duration_minutes),'public',p_notes);return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.agency_workspace_book(text,uuid,text,text,text,timestamptz,text) from public,anon,authenticated;grant execute on function public.agency_workspace_book(text,uuid,text,text,text,timestamptz,text) to service_role;

create function agency_private.validate_workspace_flow() returns trigger language plpgsql security invoker set search_path='' as $$ declare nodes jsonb;edges jsonb;n jsonb;e jsonb;node_id text;ids text[]:='{}';reachable text[]:='{}';next_ids text[];trigger_id text;count_trigger integer:=0;kind text;begin
 nodes:=new.definition->'nodes';edges:=new.definition->'edges';if jsonb_typeof(nodes) is distinct from 'array' or jsonb_typeof(edges) is distinct from 'array' or jsonb_array_length(nodes)>40 or jsonb_array_length(edges)>80 or length(new.definition::text)>60000 then raise exception 'Definição de fluxo inválida.';end if;
 for n in select value from jsonb_array_elements(nodes) loop
 node_id:=n->>'id';kind:=n->>'type';if coalesce(node_id,'')!~'^[a-zA-Z0-9_-]{1,80}$' or node_id=any(ids) or coalesce(kind,'') not in ('trigger','condition','add_tags','remove_tags','move_stage','create_task','notify','send_message','wait','assign_user') then raise exception 'Bloco inválido ou repetido.';end if;ids:=array_append(ids,node_id);
 if kind='trigger' then count_trigger:=count_trigger+1;trigger_id:=node_id;if coalesce(n->'data'->>'event','') not in ('form_submitted','appointment_created','lead_created','stage_changed','tag_added','message_received','meta_lead','external_webhook') then raise exception 'Gatilho inválido.';end if;end if;
 if kind='trigger' then
 if n->'data' ? 'first_contact' and jsonb_typeof(n->'data'->'first_contact') is distinct from 'boolean' then raise exception 'Filtro de primeiro contato inválido.';end if;
 if n->'data' ? 'direction' and coalesce(n->'data'->>'direction','') not in ('incoming','outgoing','both') then raise exception 'Direção da mensagem inválida.';end if;
 if coalesce(n->'data'->>'source_id','')<>'' and n->'data'->>'event'='form_submitted' and not exists(select 1 from public.agency_workspace_forms where workspace_id=new.workspace_id and id::text=n->'data'->>'source_id') then raise exception 'Formulário não pertence à subconta.';end if;
 if coalesce(n->'data'->>'source_id','')<>'' and n->'data'->>'event'='appointment_created' and not exists(select 1 from public.agency_workspace_calendars where workspace_id=new.workspace_id and id::text=n->'data'->>'source_id') then raise exception 'Agenda não pertence à subconta.';end if;
 end if;
 if kind='condition' then
 if jsonb_typeof(n->'data'->'rules') is distinct from 'array' or jsonb_array_length(n->'data'->'rules') not between 1 and 20 then raise exception 'Informe as regras da condição.';end if;
 if exists(select 1 from jsonb_array_elements(n->'data'->'rules') rule where coalesce(rule->>'field','')!~'^(name|phone|email|source|stage|message|tag|value|answer:[a-zA-Z0-9_-]+)$' or coalesce(rule->>'operator','') not in ('equals','not_equals','contains','filled','not_filled','greater_than')) then raise exception 'Regra da condição inválida.';end if;
 end if;
 if kind='create_task' and n->'data' ? 'due_minutes' and (coalesce(n->'data'->>'due_minutes','')!~'^[0-9]{1,6}$' or (n->'data'->>'due_minutes')::int not between 0 and 43200) then raise exception 'Prazo da tarefa inválido.';end if;
 if kind='move_stage' and not exists(select 1 from public.agency_workspace_stages where workspace_id=new.workspace_id and id::text=n->'data'->>'stage_id') then raise exception 'A etapa do bloco não pertence à subconta.';end if;
 if kind='assign_user' and not exists(select 1 from public.agency_workspace_members where workspace_id=new.workspace_id and user_id::text=n->'data'->>'user_id') then raise exception 'O responsável não pertence à subconta.';end if;
 if kind='wait' and (coalesce(n->'data'->>'minutes','')!~'^[0-9]{1,6}$' or (n->'data'->>'minutes')::int not between 1 and 43200) then raise exception 'Informe uma espera entre 1 minuto e 30 dias.';end if;
 if kind in ('notify','send_message','create_task') and length(trim(coalesce(n->'data'->>'text',''))) not between 1 and 4000 then raise exception 'Preencha o texto do bloco.';end if;
 if kind in ('add_tags','remove_tags') and (jsonb_typeof(n->'data'->'tags') is distinct from 'array' or jsonb_array_length(n->'data'->'tags') not between 1 and 20 or exists(select 1 from jsonb_array_elements_text(n->'data'->'tags') t where length(trim(t.value)) not between 1 and 60)) then raise exception 'Informe etiquetas válidas.';end if;
 end loop;
 if new.enabled then
 if count_trigger<>1 or jsonb_array_length(nodes)<2 then raise exception 'O fluxo precisa de um gatilho e pelo menos uma ação.';end if;
 foreach node_id in array ids loop
  if node_id<>trigger_id and not exists(select 1 from jsonb_array_elements(edges) edge where edge->>'target'=node_id) then raise exception 'Conecte todos os blocos ao gatilho.';end if;
 end loop;
 for e in select value from jsonb_array_elements(edges) loop
 if not(coalesce(e->>'source','')=any(ids)) or not(coalesce(e->>'target','')=any(ids)) or e->>'target'=trigger_id or e->>'source'=e->>'target' then raise exception 'Conexão inválida no fluxo.';end if;
 select value into n from jsonb_array_elements(nodes) where value->>'id'=e->>'source';
 if n->>'type'='condition' then if coalesce(e->>'branch','') not in ('yes','no') then raise exception 'Escolha Sim ou Não na condição.';end if;else if coalesce(e->>'branch','')<>'' then raise exception 'Somente condições usam ramificações.';end if;end if;
 if (select count(*) from jsonb_array_elements(edges) x where x->>'source'=e->>'source' and coalesce(x->>'branch','')=coalesce(e->>'branch',''))>1 then raise exception 'Cada saída deve apontar para um único bloco.';end if;
 end loop;
 reachable:=array[trigger_id];for count_trigger in 1..40 loop
 select coalesce(array_agg(distinct edge->>'target'),'{}') into next_ids from jsonb_array_elements(edges) edge where edge->>'source'=any(reachable);if next_ids<@reachable then exit;end if;select array_agg(distinct x) into reachable from unnest(reachable||next_ids) x;
 end loop;if not ids<@reachable then raise exception 'Há blocos sem conexão ao gatilho.';end if;
 if exists(with recursive paths(node,path,cycle) as(select trigger_id,array[trigger_id],false union all select edge->>'target',p.path||(edge->>'target'),(edge->>'target')=any(p.path) from paths p cross join lateral jsonb_array_elements(edges) edge where edge->>'source'=p.node and not p.cycle and cardinality(p.path)<=40) select 1 from paths where cycle) then raise exception 'O fluxo não pode ter ciclos.';end if;
 end if;
 if tg_op='UPDATE' and new.definition is distinct from old.definition then new.version:=old.version+1;end if;return new;
end;$$;
revoke all on function agency_private.validate_workspace_flow() from public,anon,authenticated;
create trigger workspace_flow_validation before insert or update on public.agency_workspace_flows for each row execute function agency_private.validate_workspace_flow();
create function agency_private.queue_workspace_flows() returns trigger language plpgsql security definer set search_path='' as $$ declare f record;t jsonb;begin
 if new.depth>=8 or not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=new.workspace_id and w.status='active') then return new;end if;
 for f in select * from public.agency_workspace_flows where workspace_id=new.workspace_id and enabled loop
 select value into t from jsonb_array_elements(f.definition->'nodes') where value->>'type'='trigger' limit 1;
 if t->'data'->>'event'<>new.event_type then continue;end if;
 if coalesce(t->'data'->>'source_id','')<>'' and t->'data'->>'source_id' is distinct from new.source_id then continue;end if;
 if new.event_type='message_received' then
 if coalesce(t->'data'->>'contains','')<>'' and position(lower(t->'data'->>'contains') in lower(coalesce(new.payload->>'message','')))=0 then continue;end if;
 if coalesce(t->'data'->>'direction','incoming')<>'both' and coalesce(t->'data'->>'direction','incoming')<>(case when new.payload->>'direction'='entrada' then 'incoming' else 'outgoing' end) then continue;end if;
 if coalesce((t->'data'->>'first_contact')::boolean,false) and not coalesce((new.payload->>'first_contact')::boolean,false) then continue;end if;
 end if;
 if new.origin_run is not null and exists(select 1 from public.agency_workspace_flow_runs where id=new.origin_run and flow_id=f.id) then continue;end if;
 insert into public.agency_workspace_flow_runs(workspace_id,flow_id,event_id,definition,version,cursor) values(new.workspace_id,f.id,new.id,f.definition,f.version,t->>'id') on conflict(flow_id,event_id) do nothing;
 end loop;return new;
end;$$;
revoke all on function agency_private.queue_workspace_flows() from public,anon,authenticated;
create trigger workspace_flows_queue after insert on public.agency_workspace_events for each row execute function agency_private.queue_workspace_flows();

create function agency_private.workflow_template(p_text text,p_lead public.agency_workspace_leads) returns text language sql immutable set search_path='' as $$select replace(replace(replace(replace(coalesce(p_text,''),'{nome}',coalesce(p_lead.name,'')),'{telefone}',coalesce(p_lead.phone,'')),'{email}',coalesce(p_lead.email,'')),'{valor}',coalesce(p_lead.value::text,'0'));$$;
revoke all on function agency_private.workflow_template(text,public.agency_workspace_leads) from public,anon,authenticated;
create function agency_private.workflow_condition(p_rules jsonb,p_mode text,p_lead public.agency_workspace_leads,p_payload jsonb) returns boolean language plpgsql immutable set search_path='' as $$ declare rule jsonb;actual text;expected text;ok boolean;result boolean;begin
 if jsonb_typeof(p_rules) is distinct from 'array' or jsonb_array_length(p_rules)=0 or jsonb_array_length(p_rules)>20 then return false;end if;result:=coalesce(p_mode,'all')<>'any';
 for rule in select value from jsonb_array_elements(p_rules) loop
 actual:=case rule->>'field' when 'name' then p_lead.name when 'phone' then p_lead.phone when 'email' then p_lead.email when 'source' then p_lead.source_type when 'stage' then p_lead.stage_id::text when 'message' then p_payload->>'message' when 'tag' then array_to_string(p_lead.tags,',') when 'value' then p_lead.value::text else case when rule->>'field' like 'answer:%' then coalesce(p_payload->'answers'->substr(rule->>'field',8)->>'value',p_payload->'answers'->>substr(rule->>'field',8)) else '' end end;
 actual:=lower(trim(coalesce(actual,'')));expected:=lower(trim(coalesce(rule->>'value','')));
 ok:=case rule->>'operator' when 'equals' then actual=expected when 'not_equals' then actual<>expected when 'contains' then position(expected in actual)>0 when 'filled' then actual<>'' when 'not_filled' then actual='' when 'greater_than' then case when actual~'^-?[0-9]+([.][0-9]+)?$' and expected~'^-?[0-9]+([.][0-9]+)?$' then actual::numeric>expected::numeric else false end else false end;
 if p_mode='any' then result:=result or ok;else result:=result and ok;end if;end loop;return result;
end;$$;
revoke all on function agency_private.workflow_condition(jsonb,text,public.agency_workspace_leads,jsonb) from public,anon,authenticated;
create function agency_private.process_workspace_flows(p_workspace uuid default null,p_limit integer default 10) returns integer language plpgsql security definer set search_path='' as $$ declare r public.agency_workspace_flow_runs;ev public.agency_workspace_events;lead public.agency_workspace_leads;n jsonb;next_node text;branch text;action text;body text;target public.agency_workspace_stages;tag_values text[];processed integer:=0;steps integer;begin
 for r in select run.* from public.agency_workspace_flow_runs run join public.agency_workspace_flows f on f.id=run.flow_id and f.enabled join public.agency_client_workspaces w on w.id=run.workspace_id and w.status='active' join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where run.status in ('queued','waiting') and run.next_run_at<=now() and (p_workspace is null or run.workspace_id=p_workspace) order by run.next_run_at,run.created_at limit greatest(1,least(p_limit,30)) for update of run skip locked loop
 select * into ev from public.agency_workspace_events where id=r.event_id;perform set_config('agency.workflow_run',r.id::text,true);update public.agency_workspace_flow_runs set status='running',error=null where id=r.id;update public.agency_workspace_flow_steps step set status='completed' where step.run_id=r.id and step.action='wait' and step.status='waiting';steps:=0;
 loop
 if r.cursor is null then update public.agency_workspace_flow_runs set status='completed',finished_at=now() where id=r.id;exit;end if;
 select value into n from jsonb_array_elements(r.definition->'nodes') where value->>'id'=r.cursor;action:=n->>'type';if action is null or steps>=40 then update public.agency_workspace_flow_runs set status='failed',error='Bloco inválido ou limite de execução atingido.',finished_at=now() where id=r.id;exit;end if;steps:=steps+1;
 select * into lead from public.agency_workspace_leads where id=ev.lead_id and workspace_id=r.workspace_id;branch:=null;
 begin
 if action='condition' then branch:=case when agency_private.workflow_condition(n->'data'->'rules',n->'data'->>'match',lead,ev.payload) then 'yes' else 'no' end;end if;
 select edge->>'target' into next_node from jsonb_array_elements(r.definition->'edges') edge where edge->>'source'=r.cursor and coalesce(edge->>'branch','')=coalesce(branch,'') limit 1;
 body:=agency_private.workflow_template(n->'data'->>'text',lead);
 if action in ('add_tags','remove_tags','move_stage','assign_user','send_message') and lead.id is null then raise exception 'Nenhum lead disponível para este bloco.';end if;
 if action='add_tags' then select array_agg(distinct trim(t)) into tag_values from unnest(lead.tags||array(select jsonb_array_elements_text(n->'data'->'tags'))) t;update public.agency_workspace_leads set tags=coalesce(tag_values,'{}') where id=lead.id;
 elsif action='remove_tags' then update public.agency_workspace_leads set tags=array(select t from unnest(tags) t where not(n->'data'->'tags' ? t)) where id=lead.id;
 elsif action='move_stage' then select * into target from public.agency_workspace_stages where id::text=n->'data'->>'stage_id' and workspace_id=r.workspace_id;if target.id is null then raise exception 'Etapa de destino não encontrada.';end if;update public.agency_workspace_leads set stage_id=target.id,pipeline_id=target.pipeline_id where id=lead.id and stage_id<>target.id;
 elsif action='assign_user' then update public.agency_workspace_leads set assignee_user_id=(n->'data'->>'user_id')::uuid where id=lead.id;
 elsif action='create_task' then insert into public.agency_workspace_tasks(workspace_id,lead_id,title,due_at,origin_run,origin_node) values(r.workspace_id,lead.id,left(body,200),now()+make_interval(mins=>greatest(0,least(coalesce((n->'data'->>'due_minutes')::int,1440),43200))),r.id,r.cursor) on conflict(origin_run,origin_node) do nothing;
 elsif action='notify' then insert into public.agency_workspace_notifications(workspace_id,lead_id,title,origin_run,origin_node) values(r.workspace_id,lead.id,left(body,500),r.id,r.cursor) on conflict(origin_run,origin_node) do nothing;
 elsif action='send_message' then
 insert into public.agency_workspace_message_outbox(workspace_id,lead_id,phone,body,run_id,node_id) values(r.workspace_id,lead.id,lead.phone,body,r.id,r.cursor) on conflict(run_id,node_id) do nothing;
 end if;
 insert into public.agency_workspace_flow_steps(run_id,node_id,workspace_id,action,status,detail) values(r.id,r.cursor,r.workspace_id,action,case when action in ('wait','send_message') then 'waiting' else 'completed' end,case when action='condition' then branch else null end) on conflict(run_id,node_id) do update set status=excluded.status,detail=excluded.detail;
 update public.agency_workspace_flow_runs set cursor=next_node,status=case when action in ('wait','send_message') then 'waiting' else 'running' end,next_run_at=case when action='wait' then now()+make_interval(mins=>(n->'data'->>'minutes')::int) when action='send_message' then now()+interval '1 year' else now() end where id=r.id;
 r.cursor:=next_node;if action in ('wait','send_message') then exit;end if;
 exception when others then
 update public.agency_workspace_flow_runs set status='failed',error=case when sqlstate in ('23503','23514','23502','22P02') then 'Confira os campos e vínculos do bloco.' else left(sqlerrm,300) end,finished_at=now() where id=r.id;
 insert into public.agency_workspace_flow_steps(run_id,node_id,workspace_id,action,status,detail) values(r.id,r.cursor,r.workspace_id,coalesce(action,'unknown'),'failed','Não foi possível executar este bloco.') on conflict(run_id,node_id) do update set status='failed',detail=excluded.detail;exit;
 end;
 end loop;processed:=processed+1;perform set_config('agency.workflow_run','',true);
 end loop;return processed;
end;$$;
revoke all on function agency_private.process_workspace_flows(uuid,integer) from public,anon,authenticated;grant execute on function agency_private.process_workspace_flows(uuid,integer) to service_role;
create function public.agency_workspace_process_due(p_workspace uuid default null) returns integer language sql security invoker set search_path='' as $$select agency_private.process_workspace_flows(p_workspace,20);$$;
revoke all on function public.agency_workspace_process_due(uuid) from public,anon,authenticated;grant execute on function public.agency_workspace_process_due(uuid) to service_role;
create function agency_private.cancel_workspace_flows() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='agency_workspace_flows' then if not new.enabled then update public.agency_workspace_flow_runs set status='cancelled',finished_at=now() where flow_id=new.id and status in ('queued','waiting');end if;
 elsif tg_table_name='agency_client_workspaces' and new.status='archived' then update public.agency_workspace_flow_runs set status='cancelled',finished_at=now() where workspace_id=new.id and status in ('queued','waiting');end if;return new;
end;$$;
revoke all on function agency_private.cancel_workspace_flows() from public,anon,authenticated;
create trigger workspace_flows_cancel after update of enabled on public.agency_workspace_flows for each row execute function agency_private.cancel_workspace_flows();
create trigger workspace_archive_flows after update of status on public.agency_client_workspaces for each row execute function agency_private.cancel_workspace_flows();
grant execute on function agency_private.capture_contact(uuid,uuid,uuid,text,text,text,text,text),agency_private.emit_workspace_event(uuid,text,uuid,text,jsonb) to service_role;
create function agency_private.validate_workspace_invite() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if current_user='authenticated' then
 if tg_op='INSERT' then if new.invited_by<>auth.uid() or new.status<>'pending' or new.accepted_by is not null then raise exception 'Convite inválido.';end if;
 else if new.invited_by<>old.invited_by or new.accepted_by is distinct from old.accepted_by or new.status='accepted' and old.status<>'accepted' then raise exception 'A aceitação do convite é confirmada pelo destinatário.';end if;end if;
 if new.expires_at>now()+interval '30 days' then raise exception 'Validade máxima de 30 dias.';end if;end if;return new;
end;$$;
revoke all on function agency_private.validate_workspace_invite() from public,anon,authenticated;
create trigger workspace_invite_validation before insert or update on public.agency_workspace_invitations for each row execute function agency_private.validate_workspace_invite();
create function agency_private.validate_workspace_task() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.assignee_user_id is not null and not exists(select 1 from public.agency_workspace_members where workspace_id=new.workspace_id and user_id=new.assignee_user_id) then raise exception 'Responsável não pertence a esta subconta.';end if;return new;
end;$$;
revoke all on function agency_private.validate_workspace_task() from public,anon,authenticated;
create trigger workspace_task_validation before insert or update on public.agency_workspace_tasks for each row execute function agency_private.validate_workspace_task();
create function agency_private.seed_workspace_commercial(p_workspace uuid) returns void language plpgsql security invoker set search_path='' as $$declare stage public.agency_workspace_stages;f public.agency_workspace_forms;c public.agency_workspace_calendars;begin
 if current_user not in ('postgres','supabase_admin','service_role') and not agency_private.workspace_manage(p_workspace) then raise exception 'Sem permissão nesta subconta.' using errcode='42501';end if;
 perform 1 from public.agency_client_workspaces where id=p_workspace for update;select * into stage from public.agency_workspace_stages where workspace_id=p_workspace order by position limit 1;if stage.id is null then return;end if;
 if not exists(select 1 from public.agency_workspace_forms where workspace_id=p_workspace) then
 insert into public.agency_workspace_forms(workspace_id,title,description,fields,pipeline_id,stage_id) values(p_workspace,'Captação de contatos','Preencha seus dados para conversarmos.', '[{"id":"name","label":"Nome","type":"text","required":true},{"id":"phone","label":"WhatsApp","type":"tel","required":true},{"id":"email","label":"E-mail","type":"email","required":false}]',stage.pipeline_id,stage.id) returning * into f;
 insert into public.agency_workspace_flows(workspace_id,name,enabled,definition) values(p_workspace,'Formulário → qualificar atendimento',true,jsonb_build_object('nodes',jsonb_build_array(
 jsonb_build_object('id','trigger','type','trigger','position',jsonb_build_object('x',80,'y',60),'data',jsonb_build_object('event','form_submitted','source_id',f.id::text)),
 jsonb_build_object('id','tags','type','add_tags','position',jsonb_build_object('x',80,'y',240),'data',jsonb_build_object('tags',jsonb_build_array('Formulário'))),
 jsonb_build_object('id','task','type','create_task','position',jsonb_build_object('x',80,'y',420),'data',jsonb_build_object('text','Analisar respostas de {nome}','due_minutes',1440)),
 jsonb_build_object('id','notify','type','notify','position',jsonb_build_object('x',80,'y',600),'data',jsonb_build_object('text','Novo formulário recebido de {nome}'))),
 'edges',jsonb_build_array(jsonb_build_object('id','e1','source','trigger','target','tags'),jsonb_build_object('id','e2','source','tags','target','task'),jsonb_build_object('id','e3','source','task','target','notify'))));
 end if;
 if not exists(select 1 from public.agency_workspace_calendars where workspace_id=p_workspace) then insert into public.agency_workspace_calendars(workspace_id,title,description,pipeline_id,stage_id) values(p_workspace,'Reunião comercial','Escolha o melhor horário para conversarmos.',stage.pipeline_id,stage.id) returning * into c;end if;
end;$$;
revoke all on function agency_private.seed_workspace_commercial(uuid) from public,anon;grant execute on function agency_private.seed_workspace_commercial(uuid) to authenticated,service_role;
create function public.agency_workspace_setup_capture(p_workspace uuid) returns void language sql security invoker set search_path='' as $$select agency_private.seed_workspace_commercial(p_workspace);$$;
revoke all on function public.agency_workspace_setup_capture(uuid) from public,anon;grant execute on function public.agency_workspace_setup_capture(uuid) to authenticated;
-- Backfill only module definitions for pilot-owned workspaces: never fake leads, conversations or appointments.
do $$declare w record;begin for w in select s.id from public.agency_client_workspaces s join agency_private.pilot_accounts a on a.user_id=s.owner_user_id and a.enabled where s.status='active' loop perform agency_private.seed_workspace_commercial(w.id);end loop;end$$;

create function agency_private.initialize_workspace_owner(p_workspace uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not agency_private.pilot_enabled() or not exists(select 1 from public.agency_client_workspaces where id=p_workspace and owner_user_id=auth.uid()) then raise exception 'Sem permissão.' using errcode='42501';end if;
 insert into public.agency_workspace_members(workspace_id,user_id,role) values(p_workspace,auth.uid(),'owner') on conflict do nothing;
end;$$;
revoke all on function agency_private.initialize_workspace_owner(uuid) from public,anon;grant execute on function agency_private.initialize_workspace_owner(uuid) to authenticated;
create or replace function public.agency_workspace_create(p_name text,p_description text default '') returns uuid language plpgsql security invoker set search_path='' as $$
 declare w uuid;p uuid;o uuid;begin
 if not agency_private.pilot_enabled() then raise exception 'Área piloto não liberada para esta conta.' using errcode='42501';end if;
 select id into o from public.organizations where owner_user_id=auth.uid() order by created_at limit 1;if o is null then raise exception 'Organização não encontrada.';end if;
 insert into public.agency_client_workspaces(organization_id,owner_user_id,name,description) values(o,auth.uid(),trim(p_name),trim(coalesce(p_description,''))) returning id into w;
 perform agency_private.initialize_workspace_owner(w);
 insert into public.agency_workspace_pipelines(workspace_id,name) values(w,'Comercial') returning id into p;
 insert into public.agency_workspace_stages(workspace_id,pipeline_id,name,position,color,kind) values(w,p,'Novo contato',0,'#8b5cf6','open'),(w,p,'Em conversa',1,'#3b82f6','open'),(w,p,'Proposta enviada',2,'#f59e0b','open'),(w,p,'Ganho',3,'#10b981','won'),(w,p,'Perdido',4,'#ef4444','lost');perform agency_private.seed_workspace_commercial(w);return w;
 end;$$;
