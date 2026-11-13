-- Credentials are private and are never returned to the browser. No legacy connection is reused.
create table agency_private.workspace_whatsapp(workspace_id uuid primary key references public.agency_client_workspaces(id) on delete cascade,instance_id text not null unique,token text not null,webhook_secret text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),worker_secret text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),active_account_id uuid,enabled boolean not null default false,pipeline_id uuid not null,stage_id uuid not null,foreign key(stage_id,pipeline_id,workspace_id) references public.agency_workspace_stages(id,pipeline_id,workspace_id));
alter table agency_private.workspace_whatsapp enable row level security;revoke all on agency_private.workspace_whatsapp from public,anon,authenticated;grant all on agency_private.workspace_whatsapp to service_role;
create table public.agency_workspace_whatsapp_accounts(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,phone text not null,created_at timestamptz not null default now(),unique(workspace_id,phone),unique(id,workspace_id));
create table public.agency_workspace_messages(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,account_id uuid not null,provider_id text not null,phone text not null,contact_name text,is_group boolean not null default false,sender_name text,direction text not null check(direction in ('entrada','saida')),body text not null,kind text not null default 'texto',lead_id uuid,created_at timestamptz not null default now(),unique(account_id,provider_id),foreign key(account_id,workspace_id) references public.agency_workspace_whatsapp_accounts(id,workspace_id) on delete cascade,foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id));
create index workspace_messages_chat on public.agency_workspace_messages(workspace_id,account_id,phone,created_at);
create index workspace_messages_lead on public.agency_workspace_messages(lead_id,workspace_id);
create table public.agency_workspace_message_outbox(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,account_id uuid,lead_id uuid,phone text not null,body text not null check(length(trim(body)) between 1 and 4000),run_id uuid references public.agency_workspace_flow_runs(id) on delete cascade,node_id text,request_id uuid,status text not null default 'queued' check(status in ('queued','sending','sent','failed','uncertain','cancelled')),provider_id text,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(run_id,node_id),unique(workspace_id,request_id),foreign key(account_id,workspace_id) references public.agency_workspace_whatsapp_accounts(id,workspace_id),foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id));
create index workspace_outbox_queue on public.agency_workspace_message_outbox(workspace_id,status,created_at);
create index workspace_outbox_lead on public.agency_workspace_message_outbox(lead_id,workspace_id);
create index workspace_outbox_account on public.agency_workspace_message_outbox(account_id,workspace_id);
alter table agency_private.workspace_whatsapp add foreign key(active_account_id,workspace_id) references public.agency_workspace_whatsapp_accounts(id,workspace_id);
create table agency_private.workspace_webhooks(workspace_id uuid primary key references public.agency_client_workspaces(id) on delete cascade,token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),enabled boolean not null default false,pipeline_id uuid not null,stage_id uuid not null,foreign key(stage_id,pipeline_id,workspace_id) references public.agency_workspace_stages(id,pipeline_id,workspace_id));
alter table agency_private.workspace_webhooks enable row level security;revoke all on agency_private.workspace_webhooks from public,anon,authenticated;grant all on agency_private.workspace_webhooks to service_role;
create table agency_private.workspace_webhook_requests(workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,request_id uuid not null,created_at timestamptz not null default now(),primary key(workspace_id,request_id));
alter table agency_private.workspace_webhook_requests enable row level security;revoke all on agency_private.workspace_webhook_requests from public,anon,authenticated;grant all on agency_private.workspace_webhook_requests to service_role;
-- The private schema is not exposed by PostgREST. Explicit service-only RPCs perform secret operations.
create function public.agency_workspace_connection(p_workspace uuid,p_kind text,p_values jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;begin
 if p_kind='whatsapp' then
 if p_values is not null then
  if p_values ? 'instance_id' then
   if exists(select 1 from public.agency_whatsapp_connections where instance_id=p_values->>'instance_id') then raise exception 'Esta instância já pertence à Central. Use uma instância exclusiva desta subconta.';end if;
   insert into agency_private.workspace_whatsapp(workspace_id,instance_id,token,pipeline_id,stage_id) values(p_workspace,p_values->>'instance_id',p_values->>'token',(p_values->>'pipeline_id')::uuid,(p_values->>'stage_id')::uuid) on conflict(workspace_id) do update set instance_id=excluded.instance_id,token=excluded.token,pipeline_id=excluded.pipeline_id,stage_id=excluded.stage_id,enabled=false,active_account_id=null,webhook_secret=case when workspace_whatsapp.instance_id=excluded.instance_id then workspace_whatsapp.webhook_secret else replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') end;
  else update agency_private.workspace_whatsapp set enabled=coalesce((p_values->>'enabled')::boolean,enabled),active_account_id=case when p_values ? 'active_account_id' then (p_values->>'active_account_id')::uuid else active_account_id end where workspace_id=p_workspace;end if;
 end if;
 select to_jsonb(c) into r from agency_private.workspace_whatsapp c where workspace_id=p_workspace;
 elsif p_kind='webhook' then
 if p_values is not null then insert into agency_private.workspace_webhooks(workspace_id,pipeline_id,stage_id,enabled) values(p_workspace,(p_values->>'pipeline_id')::uuid,(p_values->>'stage_id')::uuid,coalesce((p_values->>'enabled')::boolean,true)) on conflict(workspace_id) do update set pipeline_id=excluded.pipeline_id,stage_id=excluded.stage_id,enabled=excluded.enabled;end if;
 select to_jsonb(c) into r from agency_private.workspace_webhooks c where workspace_id=p_workspace;
 else raise exception 'Integração inválida.';end if;return r;
end;$$;
revoke all on function public.agency_workspace_connection(uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_connection(uuid,text,jsonb) to service_role;
create function public.agency_workspace_find_connection(p_secret text,p_worker boolean default false) returns jsonb language sql security invoker set search_path='' as $$select to_jsonb(c) from agency_private.workspace_whatsapp c where case when p_worker then worker_secret=p_secret else webhook_secret=p_secret end and enabled;$$;
revoke all on function public.agency_workspace_find_connection(text,boolean) from public,anon,authenticated;grant execute on function public.agency_workspace_find_connection(text,boolean) to service_role;
create function public.agency_workspace_ingest_message(p_workspace uuid,p_account uuid,p_event jsonb) returns uuid language plpgsql security invoker set search_path='' as $$declare c agency_private.workspace_whatsapp;l uuid;m uuid;first_contact boolean;begin
 select * into c from agency_private.workspace_whatsapp where workspace_id=p_workspace and enabled and active_account_id=p_account for update;if c.workspace_id is null then raise exception 'Conexão inativa.';end if;
 if not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=p_workspace and w.status='active') then raise exception 'Subconta indisponível.';end if;
 select id into m from public.agency_workspace_messages where account_id=p_account and provider_id=p_event->>'providerId';if m is not null then return m;end if;
 first_contact:=not exists(select 1 from public.agency_workspace_messages where account_id=p_account and phone=p_event->>'phone');
 if not coalesce((p_event->>'isGroup')::boolean,false) then l:=agency_private.capture_contact(p_workspace,c.pipeline_id,c.stage_id,coalesce(nullif(p_event->>'contactName',''),p_event->>'phone'),p_event->>'phone','','whatsapp',p_event->>'providerId');end if;
 insert into public.agency_workspace_messages(workspace_id,account_id,provider_id,phone,contact_name,is_group,sender_name,direction,body,kind,lead_id,created_at) values(p_workspace,p_account,p_event->>'providerId',p_event->>'phone',p_event->>'contactName',coalesce((p_event->>'isGroup')::boolean,false),p_event->>'senderName',p_event->>'direction',p_event->>'body',coalesce(p_event->>'kind','texto'),l,coalesce((p_event->>'createdAt')::timestamptz,now())) returning id into m;
 perform agency_private.emit_workspace_event(p_workspace,'message_received',l,p_event->>'providerId',jsonb_build_object('message',p_event->>'body','direction',p_event->>'direction','first_contact',first_contact));return m;
end;$$;
revoke all on function public.agency_workspace_ingest_message(uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_ingest_message(uuid,uuid,jsonb) to service_role;
create function public.agency_workspace_external_capture(p_token text,p_request uuid,p_contact jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare c agency_private.workspace_webhooks;l uuid;begin
 select * into c from agency_private.workspace_webhooks where token=p_token and enabled for update;if c.workspace_id is null then raise exception 'Webhook inválido.';end if;
 if exists(select 1 from agency_private.workspace_webhook_requests where workspace_id=c.workspace_id and request_id=p_request) then return jsonb_build_object('ok',true,'workspace_id',c.workspace_id);end if;
 if (select count(*) from agency_private.workspace_webhook_requests where workspace_id=c.workspace_id and created_at>now()-interval '1 minute')>=30 then raise exception 'Limite de recebimentos atingido.';end if;
 l:=agency_private.capture_contact(c.workspace_id,c.pipeline_id,c.stage_id,p_contact->>'name',p_contact->>'phone',p_contact->>'email','form',p_request::text);
 insert into agency_private.workspace_webhook_requests(workspace_id,request_id) values(c.workspace_id,p_request);
 perform agency_private.emit_workspace_event(c.workspace_id,'external_webhook',l,p_request::text,jsonb_build_object('contact',p_contact));return jsonb_build_object('ok',true,'workspace_id',c.workspace_id);
end;$$;
revoke all on function public.agency_workspace_external_capture(text,uuid,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_external_capture(text,uuid,jsonb) to service_role;
do $$declare t text;begin foreach t in array array['agency_workspace_whatsapp_accounts','agency_workspace_messages','agency_workspace_message_outbox'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);execute format('create policy workspace_messages_read on public.%I for select to authenticated using(agency_private.workspace_access(workspace_id))',t);end loop;end$$;
-- Every outgoing automation binds to the currently connected account at enqueue time.
create function agency_private.bind_workspace_outbox() returns trigger language plpgsql security definer set search_path='' as $$declare account uuid;begin
 select active_account_id into account from agency_private.workspace_whatsapp where workspace_id=new.workspace_id and enabled;
 if account is null then raise exception 'Conecte o WhatsApp desta subconta antes de enviar mensagens.';end if;
 if not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=new.workspace_id and w.status='active') then raise exception 'Subconta indisponível.';end if;
 if new.account_id is not null and new.account_id<>account then raise exception 'O número conectado foi alterado.';end if;new.account_id:=account;return new;
end;$$;
revoke all on function agency_private.bind_workspace_outbox() from public,anon,authenticated;
create trigger workspace_outbox_binding before insert on public.agency_workspace_message_outbox for each row execute function agency_private.bind_workspace_outbox();
create function agency_private.cancel_workspace_outbox() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='cancelled' then update public.agency_workspace_message_outbox set status='cancelled',updated_at=now() where run_id=new.id and status='queued';end if;return new;
end;$$;
revoke all on function agency_private.cancel_workspace_outbox() from public,anon,authenticated;
create trigger workspace_runs_cancel_messages after update of status on public.agency_workspace_flow_runs for each row execute function agency_private.cancel_workspace_outbox();
create function public.agency_workspace_claim_message(p_workspace uuid) returns jsonb language plpgsql security invoker set search_path='' as $$declare m public.agency_workspace_message_outbox;begin
 update public.agency_workspace_message_outbox set status='uncertain',error='O envio não foi confirmado. Confira o WhatsApp antes de reenviar.',updated_at=now() where workspace_id=p_workspace and status='sending' and updated_at<now()-interval '2 minutes';
 select o.* into m from public.agency_workspace_message_outbox o join agency_private.workspace_whatsapp c on c.workspace_id=o.workspace_id and c.enabled and c.active_account_id=o.account_id join public.agency_client_workspaces w on w.id=o.workspace_id and w.status='active' join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where o.workspace_id=p_workspace and o.status='queued' and (o.run_id is null or exists(select 1 from public.agency_workspace_flow_runs r join public.agency_workspace_flows f on f.id=r.flow_id and f.enabled where r.id=o.run_id and r.status='waiting')) order by o.created_at limit 1 for update of o skip locked;
 if m.id is null then return null;end if;update public.agency_workspace_message_outbox set status='sending',updated_at=now() where id=m.id;return to_jsonb(m);
end;$$;
revoke all on function public.agency_workspace_claim_message(uuid) from public,anon,authenticated;grant execute on function public.agency_workspace_claim_message(uuid) to service_role;
create function public.agency_workspace_finish_message(p_id uuid,p_status text,p_provider text default null) returns void language plpgsql security invoker set search_path='' as $$declare m public.agency_workspace_message_outbox;c agency_private.workspace_whatsapp;first_contact boolean;begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'Status inválido.';end if;
 select * into m from public.agency_workspace_message_outbox where id=p_id and status='sending' for update;if m.id is null then return;end if;
 if p_status='sent' and coalesce(p_provider,'')='' then raise exception 'Confirmação ausente.';end if;
 if p_status='sent' then
 select * into c from agency_private.workspace_whatsapp where workspace_id=m.workspace_id;
 if m.lead_id is null and m.phone not like '%@g.us' then m.lead_id:=agency_private.capture_contact(m.workspace_id,c.pipeline_id,c.stage_id,m.phone,m.phone,'','whatsapp',p_provider);end if;
 first_contact:=not exists(select 1 from public.agency_workspace_messages where account_id=m.account_id and phone=m.phone);
 perform agency_private.emit_workspace_event(m.workspace_id,'message_received',m.lead_id,p_provider,jsonb_build_object('message',m.body,'direction','saida','first_contact',first_contact));
 insert into public.agency_workspace_messages(workspace_id,account_id,provider_id,phone,direction,body,lead_id,is_group) values(m.workspace_id,m.account_id,p_provider,m.phone,'saida',m.body,m.lead_id,m.phone like '%@g.us') on conflict(account_id,provider_id) do nothing;end if;
 update public.agency_workspace_message_outbox set status=p_status,provider_id=p_provider,error=case when p_status='failed' then 'O provedor recusou o envio.' when p_status='uncertain' then 'Envio não confirmado. Confira o WhatsApp antes de reenviar.' else null end,updated_at=now() where id=m.id;
 if m.run_id is not null then update public.agency_workspace_flow_steps set status=case when p_status='sent' then 'completed' else 'failed' end,detail=case when p_status='sent' then null else 'Envio não confirmado pelo provedor.' end where run_id=m.run_id and node_id=m.node_id;
 update public.agency_workspace_flow_runs set status=case when p_status='sent' then 'queued' else 'failed' end,next_run_at=now(),error=case when p_status='sent' then null else 'Confira o envio da mensagem no WhatsApp.' end where id=m.run_id and status='waiting';end if;
end;$$;
revoke all on function public.agency_workspace_finish_message(uuid,text,text) from public,anon,authenticated;grant execute on function public.agency_workspace_finish_message(uuid,text,text) to service_role;
create function public.agency_workspace_available(p_workspace uuid) returns boolean language sql stable security invoker set search_path='' as $$select exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=p_workspace and w.status='active');$$;
revoke all on function public.agency_workspace_available(uuid) from public,anon,authenticated;grant execute on function public.agency_workspace_available(uuid) to service_role;
create table agency_private.workspace_google(workspace_id uuid primary key references public.agency_client_workspaces(id) on delete cascade,refresh_token text not null,access_token text not null,expires_at timestamptz not null,worker_secret text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
create table agency_private.workspace_google_states(token text primary key,workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,user_id uuid not null references auth.users(id),expires_at timestamptz not null default now()+interval '10 minutes');
alter table agency_private.workspace_google enable row level security;alter table agency_private.workspace_google_states enable row level security;
revoke all on agency_private.workspace_google,agency_private.workspace_google_states from public,anon,authenticated;grant all on agency_private.workspace_google,agency_private.workspace_google_states to service_role;
alter table public.agency_workspace_appointments add column google_event_id text,add column google_synced_at timestamptz,add column google_sync_error text;
create function public.agency_workspace_google(p_workspace uuid,p_action text,p_values jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;s agency_private.workspace_google_states;begin
 if p_action='get' then select to_jsonb(c) into r from agency_private.workspace_google c where workspace_id=p_workspace;
 elsif p_action='save' then
 insert into agency_private.workspace_google(workspace_id,refresh_token,access_token,expires_at) values(p_workspace,p_values->>'refresh_token',p_values->>'access_token',(p_values->>'expires_at')::timestamptz) on conflict(workspace_id) do update set refresh_token=coalesce(nullif(excluded.refresh_token,''),workspace_google.refresh_token),access_token=excluded.access_token,expires_at=excluded.expires_at;
 elsif p_action='disconnect' then delete from agency_private.workspace_google where workspace_id=p_workspace;delete from agency_private.workspace_google_states where workspace_id=p_workspace;
 elsif p_action='state' then delete from agency_private.workspace_google_states where expires_at<now();insert into agency_private.workspace_google_states(token,workspace_id,user_id) values(p_values->>'state',p_workspace,(p_values->>'user_id')::uuid);
 elsif p_action='consume' then delete from agency_private.workspace_google_states where token=p_values->>'state' and expires_at>now() returning * into s;
 if s.token is not null and exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=s.workspace_id and w.status='active' and (w.owner_user_id=s.user_id or exists(select 1 from public.agency_workspace_members m where m.workspace_id=w.id and m.user_id=s.user_id and m.role in ('owner','admin')))) then r:=jsonb_build_object('workspace_id',s.workspace_id);end if;
 elsif p_action='worker' then select to_jsonb(c) into r from agency_private.workspace_google c where worker_secret=p_values->>'secret';
 else raise exception 'Operação inválida.';end if;return r;
end;$$;
revoke all on function public.agency_workspace_google(uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_google(uuid,text,jsonb) to service_role;
-- Only the integration worker may write sync state.
revoke update on public.agency_workspace_appointments from authenticated;
grant update(name,phone,email,starts_at,ends_at,status,notes) on public.agency_workspace_appointments to authenticated;
