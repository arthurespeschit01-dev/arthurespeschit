-- The principal account uses the same isolated control plane, without becoming a client subaccount.
alter table public.agency_client_workspaces add column account_kind text not null default 'client' check(account_kind in ('client','agency'));
create table agency_private.agency_account_workspaces(owner_user_id uuid primary key references auth.users(id),workspace_id uuid not null unique references public.agency_client_workspaces(id));
alter table agency_private.agency_account_workspaces enable row level security;
revoke all on agency_private.agency_account_workspaces from public,anon,authenticated;
grant all on agency_private.agency_account_workspaces to service_role;
create function agency_private.agency_account_kind_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' and new.account_kind<>old.account_kind and current_user not in ('postgres','service_role') then raise exception 'O tipo da conta não pode ser alterado.';end if;
 if tg_op='INSERT' and new.account_kind<>'client' and current_user not in ('postgres','service_role') then raise exception 'Tipo de conta reservado.';end if;
 if new.account_kind='agency' and new.status<>'active' then raise exception 'A conta principal não pode ser arquivada como subconta.';end if;
 return new;end;$$;
revoke all on function agency_private.agency_account_kind_guard() from public,anon,authenticated;
create trigger account_kind_guard before insert or update on public.agency_client_workspaces for each row execute function agency_private.agency_account_kind_guard();

-- Only this explicit owner-bound adapter touches legacy CRM rows. Client workspace queries never do.
alter table public.agency_workspace_leads alter column value type numeric(14,2);
create function agency_private.sync_agency_account_crm(p_owner uuid) returns void language plpgsql security definer set search_path='' as $$declare w uuid;prior text;begin
 select workspace_id into w from agency_private.agency_account_workspaces where owner_user_id=p_owner;
 if w is null then return;end if;
 prior:=current_setting('agency.primary_import',true);
 perform set_config('agency.primary_import','true',true);
 set constraints all deferred;
 insert into public.agency_workspace_pipelines(id,workspace_id,name) select id,w,name from public.agency_pipelines where user_id=p_owner and area='comercial'
 on conflict(id) do update set name=excluded.name where agency_workspace_pipelines.workspace_id=w and agency_workspace_pipelines.name is distinct from excluded.name;
 insert into public.agency_workspace_stages(id,workspace_id,pipeline_id,name,position,color,kind)
 select s.id,w,s.pipeline_id,s.name,s.position,s.color,case public.agency_stage_outcome(s.outcome,s.name) when 'won' then 'won' when 'lost' then 'lost' else 'open' end
 from public.agency_pipeline_stages s join public.agency_pipelines p on p.id=s.pipeline_id and p.user_id=s.user_id where s.user_id=p_owner and p.area='comercial'
 on conflict(id) do update set name=excluded.name,position=excluded.position,color=excluded.color,kind=excluded.kind where agency_workspace_stages.workspace_id=w;
 insert into public.agency_workspace_leads(id,workspace_id,pipeline_id,stage_id,name,phone,notes,value)
 select c.id,w,c.pipeline_id,c.stage_id,c.title,c.phone,c.notes,c.value from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id and p.user_id=c.user_id where c.user_id=p_owner and p.area='comercial'
 on conflict(id) do update set pipeline_id=excluded.pipeline_id,stage_id=excluded.stage_id,name=excluded.name,phone=excluded.phone,notes=excluded.notes,value=excluded.value where agency_workspace_leads.workspace_id=w and (agency_workspace_leads.pipeline_id,agency_workspace_leads.stage_id,agency_workspace_leads.name,agency_workspace_leads.phone,agency_workspace_leads.notes,agency_workspace_leads.value) is distinct from (excluded.pipeline_id,excluded.stage_id,excluded.name,excluded.phone,excluded.notes,excluded.value);
 perform set_config('agency.primary_import',coalesce(prior,''),true);
end;$$;
revoke all on function agency_private.sync_agency_account_crm(uuid) from public,anon,authenticated;

create function agency_private.agency_account_workspace() returns uuid language plpgsql security definer set search_path='' as $$declare w uuid;seed uuid;u uuid:=auth.uid();begin
 if u is null then raise exception 'Entre na sua conta.' using errcode='42501';end if;
 if not exists(select 1 from public.organizations where owner_user_id=u) then raise exception 'Somente o proprietário pode configurar a conta principal.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('agency-account:'||u::text,0));
 select workspace_id into w from agency_private.agency_account_workspaces where owner_user_id=u;
 if w is null then
  w:=public.agency_workspace_create('Central do Gestor','Conta principal');
  select id into seed from public.agency_workspace_pipelines where workspace_id=w limit 1;
  insert into agency_private.agency_account_workspaces values(u,w);
  update public.agency_client_workspaces set account_kind='agency' where id=w;
 end if;
 perform agency_private.sync_agency_account_crm(u);
 if exists(select 1 from public.agency_pipelines where user_id=u and area='comercial') then
  if seed is not null then
   update public.agency_workspace_forms set (pipeline_id,stage_id)=(select p.id,s.id from public.agency_pipelines p join public.agency_pipeline_stages s on s.pipeline_id=p.id and s.user_id=p.user_id where p.user_id=u and p.area='comercial' order by p.created_at,p.id,s.position,s.id limit 1) where workspace_id=w and pipeline_id=seed;
   update public.agency_workspace_calendars set (pipeline_id,stage_id)=(select p.id,s.id from public.agency_pipelines p join public.agency_pipeline_stages s on s.pipeline_id=p.id and s.user_id=p.user_id where p.user_id=u and p.area='comercial' order by p.created_at,p.id,s.position,s.id limit 1) where workspace_id=w and pipeline_id=seed;
   delete from public.agency_workspace_stages where workspace_id=w and pipeline_id=seed;
   delete from public.agency_workspace_pipelines where workspace_id=w and id=seed;
  end if;
  update public.agency_workspace_pipelines set is_default=false where workspace_id=w and is_default;
  update public.agency_workspace_pipelines set is_default=true where id=(select id from public.agency_pipelines where user_id=u and area='comercial' order by created_at,id limit 1) and workspace_id=w;
 end if;
 return w;
end;$$;
revoke all on function agency_private.agency_account_workspace() from public,anon;
grant execute on function agency_private.agency_account_workspace() to authenticated;
create function public.agency_account_workspace() returns uuid language sql security invoker set search_path='' as $$select agency_private.agency_account_workspace();$$;
revoke all on function public.agency_account_workspace() from public,anon;
grant execute on function public.agency_account_workspace() to authenticated;
create function public.agency_account_owner(p_workspace uuid) returns uuid language sql stable security invoker set search_path='' as $$select owner_user_id from agency_private.agency_account_workspaces where workspace_id=p_workspace;$$;
revoke all on function public.agency_account_owner(uuid) from public,anon,authenticated;
grant execute on function public.agency_account_owner(uuid) to service_role;

create function agency_private.bridge_agency_crm() returns trigger language plpgsql security definer set search_path='' as $$declare u uuid;begin
 if pg_trigger_depth()>1 then return coalesce(new,old);end if;
 u:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if tg_op='DELETE' then
  if tg_table_name='agency_pipeline_cards' then delete from public.agency_workspace_leads where id=old.id and workspace_id=(select workspace_id from agency_private.agency_account_workspaces where owner_user_id=u);
  elsif tg_table_name='agency_pipeline_stages' then delete from public.agency_workspace_stages where id=old.id and workspace_id=(select workspace_id from agency_private.agency_account_workspaces where owner_user_id=u);
  elsif tg_table_name='agency_pipelines' then delete from public.agency_workspace_pipelines where id=old.id and workspace_id=(select workspace_id from agency_private.agency_account_workspaces where owner_user_id=u);end if;
 else perform agency_private.sync_agency_account_crm(u);end if;
 return coalesce(new,old);end;$$;
revoke all on function agency_private.bridge_agency_crm() from public,anon,authenticated;
create trigger agency_account_pipeline_sync after insert or update or delete on public.agency_pipelines for each row execute function agency_private.bridge_agency_crm();
create trigger agency_account_stage_sync after insert or update or delete on public.agency_pipeline_stages for each row execute function agency_private.bridge_agency_crm();
create trigger agency_account_card_sync after insert or update or delete on public.agency_pipeline_cards for each row execute function agency_private.bridge_agency_crm();

create function agency_private.bridge_workspace_agency_crm() returns trigger language plpgsql security definer set search_path='' as $$declare u uuid;w uuid;begin
 if pg_trigger_depth()>1 or current_setting('agency.primary_import',true)='true' then return coalesce(new,old);end if;
 w:=case when tg_op='DELETE' then old.workspace_id else new.workspace_id end;
 select owner_user_id into u from agency_private.agency_account_workspaces where workspace_id=w;
 if u is null then return coalesce(new,old);end if;
 if tg_table_name='agency_workspace_pipelines' then
  if tg_op='DELETE' then delete from public.agency_pipelines where id=old.id and user_id=u and area='comercial';
  else
   if length(new.name)>100 then raise exception 'Informe entre 1 e 100 caracteres para o funil da Central.';end if;
   insert into public.agency_pipelines(id,user_id,area,name) values(new.id,u,'comercial',new.name)
   on conflict(id) do update set name=excluded.name where agency_pipelines.user_id=u and agency_pipelines.area='comercial';
  end if;
 elsif tg_table_name='agency_workspace_stages' then
  if tg_op='DELETE' then delete from public.agency_pipeline_stages s where s.id=old.id and s.user_id=u and exists(select 1 from public.agency_pipelines p where p.id=s.pipeline_id and p.user_id=u and p.area='comercial');
  else
   if length(new.name)>80 then raise exception 'Informe entre 1 e 80 caracteres para a etapa da Central.';end if;
   if not exists(select 1 from public.agency_pipelines where id=new.pipeline_id and user_id=u and area='comercial') then raise exception 'Funil da conta inválido.';end if;
   insert into public.agency_pipeline_stages(id,user_id,pipeline_id,name,color,position,outcome) values(new.id,u,new.pipeline_id,new.name,new.color,new.position,case new.kind when 'won' then 'won' when 'lost' then 'lost' else 'in_progress' end)
   on conflict(id) do update set name=excluded.name,color=excluded.color,position=excluded.position,outcome=case when new.kind='open' and agency_pipeline_stages.outcome='completed' then 'completed' else excluded.outcome end where agency_pipeline_stages.user_id=u and agency_pipeline_stages.pipeline_id=new.pipeline_id;
  end if;
 elsif tg_table_name='agency_workspace_leads' then
  if tg_op='DELETE' then delete from public.agency_pipeline_cards where id=old.id and user_id=u;
  else
   insert into public.agency_pipelines(id,user_id,area,name) select id,u,'comercial',left(name,100) from public.agency_workspace_pipelines where id=new.pipeline_id and workspace_id=w on conflict(id) do nothing;
   insert into public.agency_pipeline_stages(id,user_id,pipeline_id,name,color,position,outcome) select id,u,pipeline_id,left(name,80),color,position,case kind when 'won' then 'won' when 'lost' then 'lost' else 'in_progress' end from public.agency_workspace_stages where id=new.stage_id and workspace_id=w on conflict(id) do nothing;
   if not exists(select 1 from public.agency_pipeline_stages s join public.agency_pipelines p on p.id=s.pipeline_id and p.user_id=s.user_id where s.id=new.stage_id and s.pipeline_id=new.pipeline_id and s.user_id=u and p.area='comercial') then raise exception 'Funil da conta inválido.';end if;
   insert into public.agency_pipeline_cards(id,user_id,pipeline_id,stage_id,title,phone,notes,value) values(new.id,u,new.pipeline_id,new.stage_id,new.name,new.phone,new.notes,new.value)
   on conflict(id) do update set pipeline_id=excluded.pipeline_id,stage_id=excluded.stage_id,title=excluded.title,phone=excluded.phone,notes=excluded.notes,value=excluded.value where agency_pipeline_cards.user_id=u and (agency_pipeline_cards.pipeline_id,agency_pipeline_cards.stage_id,agency_pipeline_cards.title,agency_pipeline_cards.phone,agency_pipeline_cards.notes,agency_pipeline_cards.value) is distinct from (excluded.pipeline_id,excluded.stage_id,excluded.title,excluded.phone,excluded.notes,excluded.value);
  end if;
 end if;
 return coalesce(new,old);end;$$;
revoke all on function agency_private.bridge_workspace_agency_crm() from public,anon,authenticated;
create trigger workspace_agency_pipeline_sync after insert or update or delete on public.agency_workspace_pipelines for each row execute function agency_private.bridge_workspace_agency_crm();
create trigger workspace_agency_stage_sync after insert or update or delete on public.agency_workspace_stages for each row execute function agency_private.bridge_workspace_agency_crm();
create trigger workspace_agency_card_sync after insert or update or delete on public.agency_workspace_leads for each row execute function agency_private.bridge_workspace_agency_crm();

-- Legacy appointments retain their table and identity; only their Google delivery state is added.
alter table public.agency_appointments add column google_event_id text,add column google_synced_at timestamptz,add column google_sync_error text,add column updated_at timestamptz not null default now();
create function agency_private.agency_appointment_revision() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if (to_jsonb(new)-array['google_event_id','google_synced_at','google_sync_error','updated_at']) is distinct from (to_jsonb(old)-array['google_event_id','google_synced_at','google_sync_error','updated_at']) then new.updated_at:=now();end if;return new;end;$$;
revoke all on function agency_private.agency_appointment_revision() from public,anon,authenticated;
create trigger agency_appointment_revision before update on public.agency_appointments for each row execute function agency_private.agency_appointment_revision();

-- Existing workspace Google worker also checks principal-account appointments.
create function public.agency_account_google_pending(p_workspace uuid) returns boolean language sql stable security invoker set search_path='' as $$select exists(select 1 from agency_private.agency_account_workspaces c join public.agency_appointments a on a.user_id=c.owner_user_id where c.workspace_id=p_workspace and (a.google_synced_at is null or a.google_synced_at<a.updated_at));$$;
revoke all on function public.agency_account_google_pending(uuid) from public,anon,authenticated;
grant execute on function public.agency_account_google_pending(uuid) to service_role;
do $job$declare r record;begin
 if to_regclass('cron.job') is not null then
  for r in execute 'select jobname,schedule,command from cron.job where jobname=''pilot-workspace-google''' loop
   perform cron.schedule(r.jobname,r.schedule,regexp_replace(r.command,';[[:space:]]*$','')||' or public.agency_account_google_pending(c.workspace_id);');
  end loop;
 end if;
end;$job$;

create table agency_private.agency_calendar_cancellations(user_id uuid not null references auth.users(id),event_id text not null,created_at timestamptz not null default now(),primary key(user_id,event_id));
alter table agency_private.agency_calendar_cancellations enable row level security;
revoke all on agency_private.agency_calendar_cancellations from public,anon,authenticated;
grant all on agency_private.agency_calendar_cancellations to service_role;
create function agency_private.agency_calendar_delete_queue() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.google_event_id is not null then insert into agency_private.agency_calendar_cancellations(user_id,event_id) values(old.user_id,old.google_event_id) on conflict do nothing;end if;return old;end;$$;
revoke all on function agency_private.agency_calendar_delete_queue() from public,anon,authenticated;
create trigger agency_calendar_delete before delete on public.agency_appointments for each row execute function agency_private.agency_calendar_delete_queue();
create function public.agency_account_calendar_cancellations(p_workspace uuid,p_event text default null) returns jsonb language plpgsql security invoker set search_path='' as $$declare u uuid;begin
 u:=public.agency_account_owner(p_workspace);
 if u is null then return '[]';end if;
 if p_event is not null then delete from agency_private.agency_calendar_cancellations where user_id=u and event_id=p_event;end if;
 return coalesce((select jsonb_agg(event_id) from agency_private.agency_calendar_cancellations where user_id=u),'[]');
end;$$;
revoke all on function public.agency_account_calendar_cancellations(uuid,text) from public,anon,authenticated;
grant execute on function public.agency_account_calendar_cancellations(uuid,text) to service_role;
create or replace function public.agency_account_google_pending(p_workspace uuid) returns boolean language sql stable security invoker set search_path='' as $$select exists(select 1 from agency_private.agency_account_workspaces c join public.agency_appointments a on a.user_id=c.owner_user_id where c.workspace_id=p_workspace and (a.google_synced_at is null or a.google_synced_at<a.updated_at)) or exists(select 1 from agency_private.agency_account_workspaces c join agency_private.agency_calendar_cancellations a on a.user_id=c.owner_user_id where c.workspace_id=p_workspace);$$;

create function agency_private.account_calendar(p_workspace uuid,p_action text,p_id uuid,p_values jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid;cid uuid;begin
 select owner_user_id into u from agency_private.agency_account_workspaces where workspace_id=p_workspace;
 if u is null or not agency_private.workspace_permission(p_workspace,'calendar','read') then raise exception 'Sem acesso à agenda desta conta.' using errcode='42501';end if;
 if p_action not in ('get','save','delete') then raise exception 'Ação inválida.';end if;
 if p_action<>'get' then
  if not agency_private.workspace_permission(p_workspace,'calendar',case p_action when 'delete' then 'manage' else 'write' end) then raise exception 'Sem permissão para alterar esta agenda.' using errcode='42501';end if;
  if p_action='delete' then
   if exists(select 1 from public.agency_workspace_appointments where workspace_id=p_workspace and id=p_id) then update public.agency_workspace_appointments set status='cancelled' where workspace_id=p_workspace and id=p_id;
   else delete from public.agency_appointments where user_id=u and id=p_id;end if;
  else
   cid:=nullif(p_values->>'client_id','')::uuid;
   if cid is not null and not exists(select 1 from public.clients where id=cid and user_id=u) then raise exception 'Escolha um cliente desta conta.';end if;
   if exists(select 1 from public.agency_workspace_appointments where workspace_id=p_workspace and id=p_id) then
    update public.agency_workspace_appointments set name=p_values->>'title',starts_at=(p_values->>'starts_at')::timestamptz,ends_at=(p_values->>'ends_at')::timestamptz,notes=coalesce(p_values->>'notes',''),status=case p_values->>'status' when 'cancelado' then 'cancelled' when 'concluido' then 'completed' else 'confirmed' end where workspace_id=p_workspace and id=p_id;
   elsif p_id is null then
    insert into public.agency_appointments(user_id,title,starts_at,ends_at,notes,client_id,status) values(u,p_values->>'title',(p_values->>'starts_at')::timestamptz,(p_values->>'ends_at')::timestamptz,coalesce(p_values->>'notes',''),cid,p_values->>'status');
   else
    update public.agency_appointments set title=p_values->>'title',starts_at=(p_values->>'starts_at')::timestamptz,ends_at=(p_values->>'ends_at')::timestamptz,notes=coalesce(p_values->>'notes',''),client_id=cid,status=p_values->>'status' where user_id=u and id=p_id;
    if not found then raise exception 'Agendamento não encontrado nesta conta.';end if;
   end if;
  end if;
 end if;
 return jsonb_build_object(
  'events',coalesce((select jsonb_agg(e order by e.starts_at) from (select id,title,starts_at,ends_at,notes,client_id,status,created_at,user_id,'agency'::text source,google_sync_error from public.agency_appointments where user_id=u union all select id,name,starts_at,ends_at,notes,null::uuid,case status when 'cancelled' then 'cancelado' when 'completed' then 'concluido' else 'agendado' end,created_at,u,'workspace',google_sync_error from public.agency_workspace_appointments where workspace_id=p_workspace) e),'[]'),
  'clients',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status)) from public.clients where user_id=u),'[]'),
  'google_connected',exists(select 1 from agency_private.workspace_google where workspace_id=p_workspace),
  'can_write',agency_private.workspace_permission(p_workspace,'calendar','write'),'can_manage',agency_private.workspace_permission(p_workspace,'calendar','manage'));
end;$$;
revoke all on function agency_private.account_calendar(uuid,text,uuid,jsonb) from public,anon;
grant execute on function agency_private.account_calendar(uuid,text,uuid,jsonb) to authenticated;
create function public.agency_account_calendar(p_workspace uuid,p_action text default 'get',p_id uuid default null,p_values jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select agency_private.account_calendar(p_workspace,p_action,p_id,p_values);$$;
revoke all on function public.agency_account_calendar(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.agency_account_calendar(uuid,text,uuid,jsonb) to authenticated;

create function agency_private.account_legacy_forms(p_workspace uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid;begin
 select owner_user_id into u from agency_private.agency_account_workspaces where workspace_id=p_workspace;
 if u is null or not agency_private.workspace_permission(p_workspace,'forms','read') then raise exception 'Sem acesso aos formulários desta conta.' using errcode='42501';end if;
 return jsonb_build_object('forms',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'description',f.description,'token',f.token,'enabled',f.enabled,'fields',f.fields,'responses',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'answers',r.answers,'created_at',r.created_at)),'[]') from public.agency_form_responses r where r.form_id=f.id and r.user_id=u))) from public.agency_forms f where f.user_id=u),'[]'));
end;$$;
revoke all on function agency_private.account_legacy_forms(uuid) from public,anon;
grant execute on function agency_private.account_legacy_forms(uuid) to authenticated;
create function public.agency_account_legacy_forms(p_workspace uuid) returns jsonb language sql security invoker set search_path='' as $$select agency_private.account_legacy_forms(p_workspace);$$;
revoke all on function public.agency_account_legacy_forms(uuid) from public,anon;
grant execute on function public.agency_account_legacy_forms(uuid) to authenticated;
-- Google handles/revision bookkeeping are server-only, while legacy business writes stay available.
revoke insert,update on public.agency_appointments from authenticated;
grant insert(id,user_id,client_id,title,starts_at,ends_at,notes,status) on public.agency_appointments to authenticated;
grant update(user_id,client_id,title,starts_at,ends_at,notes,status) on public.agency_appointments to authenticated;
revoke insert on public.agency_workspace_appointments from authenticated;
grant insert(id,workspace_id,calendar_id,lead_id,request_id,name,phone,email,starts_at,ends_at,status,notes,source) on public.agency_workspace_appointments to authenticated;
-- Existing Central WhatsApp remains on its current connection/webhook. Only new, confirmed
-- text-message events tied to an existing CRM contact feed principal-account tracking.
create unique index agency_message_event_once on public.agency_workspace_events(workspace_id,event_type,source_id) where event_type='message_received' and source_id like 'agency-message:%';
create function agency_private.agency_message_tracking() returns trigger language plpgsql security definer set search_path='' as $$declare w uuid;l uuid;current_account text;begin
 if new.kind<>'texto' or new.phone !~ '^[0-9]{10,15}$' or new.status not in ('recebido','enviado') then return new;end if;
 if tg_op='UPDATE' and old.status in ('recebido','enviado') then return new;end if;
 if to_jsonb(new)->>'duplicate_of' is not null or new.created_at<now()-interval '1 day' then return new;end if;
 select to_jsonb(c)->>'active_account_id' into current_account from public.agency_whatsapp_connections c where c.user_id=new.user_id;
 if current_account is not null and current_account is distinct from to_jsonb(new)->>'account_id' then return new;end if;
 select workspace_id into w from agency_private.agency_account_workspaces where owner_user_id=new.user_id;
 if w is null then return new;end if;
 select id into l from public.agency_workspace_leads where workspace_id=w and public.agency_whatsapp_phone_key(phone)=public.agency_whatsapp_phone_key(new.phone) order by updated_at desc,id limit 1;
 if l is null then return new;end if;
 insert into public.agency_workspace_events(workspace_id,event_type,lead_id,source_id,payload) values(w,'message_received',l,'agency-message:'||new.id::text,jsonb_build_object('message',new.body,'kind','texto','direction',new.direction,'phone',new.phone,'message_at',new.created_at)) on conflict do nothing;
 return new;end;$$;
revoke all on function agency_private.agency_message_tracking() from public,anon,authenticated;
do $tracking$begin
 if to_regclass('public.agency_whatsapp_messages') is not null then
  execute 'create trigger agency_account_message_tracking after insert or update of status on public.agency_whatsapp_messages for each row execute function agency_private.agency_message_tracking()';
 end if;
end;$tracking$;
-- Query only pending rows so old, already-synced appointments cannot starve new bookings.
create index agency_calendar_google_pending on public.agency_appointments(user_id,updated_at) where google_synced_at is null or google_synced_at<updated_at;
create index workspace_calendar_google_pending on public.agency_workspace_appointments(workspace_id,updated_at) where google_synced_at is null or google_synced_at<updated_at;
create function public.agency_workspace_calendar_pending(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$select coalesce(jsonb_agg(a),'[]') from (select * from public.agency_workspace_appointments where workspace_id=p_workspace and public.agency_workspace_available(p_workspace) and (google_synced_at is null or google_synced_at<updated_at) order by updated_at,id limit 10) a;$$;
create function public.agency_account_calendar_pending(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$select coalesce(jsonb_agg(a),'[]') from (select * from public.agency_appointments where user_id=public.agency_account_owner(p_workspace) and public.agency_workspace_available(p_workspace) and (google_synced_at is null or google_synced_at<updated_at) order by updated_at,id limit 10) a;$$;
revoke all on function public.agency_workspace_calendar_pending(uuid),public.agency_account_calendar_pending(uuid) from public,anon,authenticated;
grant execute on function public.agency_workspace_calendar_pending(uuid),public.agency_account_calendar_pending(uuid) to service_role;
