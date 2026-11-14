-- Audit every catalog option; preserve existing snapshots and legacy integration boundaries.
create or replace function agency_private.process_workspace_flows(p_workspace uuid default null,p_limit integer default 10) returns integer language plpgsql security definer set search_path='' as $$ declare r public.agency_workspace_flow_runs;ev public.agency_workspace_events;lead public.agency_workspace_leads;n jsonb;next_node text;branch text;action text;body text;target public.agency_workspace_stages;tag_values text[];processed integer:=0;steps integer;resume_at timestamptz;booking public.agency_workspace_appointments;local_time timestamp;offset_day integer;chosen uuid;node_payload jsonb;watch_account uuid;anchor timestamptz;last_incoming timestamptz;last_outgoing timestamptz;watch agency_private.workspace_reply_watches;answered boolean;wait_mode text;deadline timestamptz;begin
 for r in select run.* from public.agency_workspace_flow_runs run join public.agency_workspace_flows f on f.id=run.flow_id and f.enabled join public.agency_client_workspaces w on w.id=run.workspace_id and w.status='active' join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where run.status in ('queued','waiting') and run.next_run_at<=now() and (p_workspace is null or run.workspace_id=p_workspace) order by run.next_run_at,run.created_at limit greatest(1,least(p_limit,30)) for update of run skip locked loop
 select * into ev from public.agency_workspace_events where id=r.event_id;perform set_config('agency.workflow_run',r.id::text,true);update public.agency_workspace_flow_runs set status='running',error=null where id=r.id;update public.agency_workspace_flow_steps step set status='completed' where step.run_id=r.id and step.action in ('wait','wait_appointment','business_hours') and step.status='waiting';steps:=0;
 loop
 if r.cursor is null then update public.agency_workspace_flow_runs set status='completed',finished_at=now() where id=r.id;exit;end if;
 select value into n from jsonb_array_elements(r.definition->'nodes') where value->>'id'=r.cursor;action:=n->>'type';if action is null or steps>=40 then update public.agency_workspace_flow_runs set status='failed',error='Bloco inválido ou limite de execução atingido.',finished_at=now() where id=r.id;exit;end if;steps:=steps+1;
 select * into lead from public.agency_workspace_leads where id=ev.lead_id and workspace_id=r.workspace_id;branch:=null;
 begin
 if action in ('wait_response','team_response') then
 if lead.id is null or coalesce(lead.phone,'')='' then raise exception 'O bloco precisa de um contato com WhatsApp.';end if;
 if coalesce(r.context->>'wait_node','')<>r.cursor then
 select c.active_account_id into watch_account from agency_private.workspace_whatsapp c where c.workspace_id=r.workspace_id and c.enabled;
 if coalesce(n->'data'->>'account_id','')<>'' then watch_account:=(n->'data'->>'account_id')::uuid;elsif coalesce(ev.payload->>'account_id','')<>'' then watch_account:=(ev.payload->>'account_id')::uuid;end if;
 -- Legacy waits still follow the active account; newly configured waits pin the origin account.
 if watch_account is null then raise exception 'Conecte o WhatsApp da empresa antes de aguardar respostas.';end if;
 select max(m.created_at) filter(where m.direction='entrada'),max(m.created_at) filter(where m.direction='saida') into last_incoming,last_outgoing from public.agency_workspace_messages m where m.workspace_id=r.workspace_id and m.account_id=watch_account and agency_private.contact_key(m.phone,'')=agency_private.contact_key(lead.phone,'');
 wait_mode:=coalesce(n->'data'->>'reply_anchor','block_entry');
 if wait_mode='last_incoming' then
 if last_incoming is null then raise exception 'Nenhuma mensagem recebida para iniciar o prazo. Escolha Entrada no bloco ou use Mensagem no WhatsApp como gatilho.';end if;
 -- Anchor the unanswered burst to its first incoming message, after the last prior team response.
 select min(m.created_at) into anchor from public.agency_workspace_messages m where m.workspace_id=r.workspace_id and m.account_id=watch_account and agency_private.contact_key(m.phone,'')=agency_private.contact_key(lead.phone,'') and m.direction='entrada' and m.created_at<=last_incoming and m.created_at>coalesce((select max(x.created_at) from public.agency_workspace_messages x where x.workspace_id=r.workspace_id and x.account_id=watch_account and agency_private.contact_key(x.phone,'')=agency_private.contact_key(lead.phone,'') and x.direction='saida' and x.created_at<last_incoming),'epoch'::timestamptz);
 elsif wait_mode='last_outgoing' then if last_outgoing is null then raise exception 'Nenhuma mensagem enviada para iniciar a espera. Escolha Entrada no bloco ou envie uma mensagem antes.';end if;anchor:=last_outgoing;
 else anchor:=now();end if;
 anchor:=coalesce(anchor,now());deadline:=anchor+make_interval(mins=>(n->'data'->>'minutes')::int);
 if coalesce((n->'data'->>'deduplicate')::boolean,false) then
 perform pg_advisory_xact_lock(hashtextextended(r.workspace_id::text||r.flow_id::text||r.cursor||watch_account::text||agency_private.contact_key(lead.phone,''),0));
 select * into watch from agency_private.workspace_reply_watches where workspace_id=r.workspace_id and flow_id=r.flow_id and node_id=r.cursor and account_id=watch_account and contact_key=agency_private.contact_key(lead.phone,'') for update;
 if watch.run_id is not null and watch.run_id<>r.id and ((watch.anchor_at=anchor) or exists(select 1 from public.agency_workspace_flow_runs existing where existing.id=watch.run_id and existing.status in ('queued','running','waiting'))) then
 update public.agency_workspace_flow_runs set status='cancelled',error='Mensagem agrupada ao acompanhamento já existente desta conversa.',finished_at=now() where id=r.id;
 insert into public.agency_workspace_flow_steps(run_id,node_id,workspace_id,action,status,detail) values(r.id,r.cursor,r.workspace_id,action,'completed','Agrupado: já existe um acompanhamento desta sequência de mensagens.') on conflict(run_id,node_id) do nothing;exit;
 end if;
 insert into agency_private.workspace_reply_watches(workspace_id,flow_id,node_id,account_id,contact_key,run_id,anchor_at) values(r.workspace_id,r.flow_id,r.cursor,watch_account,agency_private.contact_key(lead.phone,''),r.id,anchor) on conflict(workspace_id,flow_id,node_id,account_id,contact_key) do update set run_id=excluded.run_id,anchor_at=excluded.anchor_at,created_at=now();
 end if;
 r.context:=r.context||jsonb_build_object('wait_node',r.cursor,'wait_started',anchor,'wait_until',deadline,'wait_account_id',watch_account,'wait_phone',lead.phone);
 update public.agency_workspace_flow_runs set context=r.context,status='waiting',next_run_at=least(now()+interval '1 minute',greatest(now(),deadline)) where id=r.id;
 insert into public.agency_workspace_flow_steps(run_id,node_id,workspace_id,action,status,detail) values(r.id,r.cursor,r.workspace_id,action,'waiting',jsonb_build_object('count_from',anchor,'deadline',deadline,'account_id',watch_account)::text) on conflict(run_id,node_id) do nothing;
 -- Continue in this transaction to account for replies already received while earlier blocks ran.
 end if;
 watch_account:=coalesce((r.context->>'wait_account_id')::uuid,(select active_account_id from agency_private.workspace_whatsapp where workspace_id=r.workspace_id and enabled));
 select exists(select 1 from public.agency_workspace_messages m where m.workspace_id=r.workspace_id and m.account_id=watch_account and agency_private.contact_key(m.phone,'')=agency_private.contact_key(coalesce(r.context->>'wait_phone',lead.phone),'') and m.created_at>(r.context->>'wait_started')::timestamptz and m.created_at<=least(now(),(r.context->>'wait_until')::timestamptz) and m.direction=(case when action='wait_response' then 'entrada' else 'saida' end) and agency_private.workflow_message_matches(m.body,n->'data'->'reply_texts',coalesce(n->'data'->>'reply_text_mode','any'))) into answered;
 if coalesce(n->'data'->>'response_mode','immediate')='deadline' and now()<(r.context->>'wait_until')::timestamptz then
 update public.agency_workspace_flow_runs set status='waiting',next_run_at=(r.context->>'wait_until')::timestamptz where id=r.id;exit;
 elsif answered then branch:='yes';
 elsif now()>=(r.context->>'wait_until')::timestamptz then branch:='no';
 else update public.agency_workspace_flow_runs set status='waiting',next_run_at=least(now()+interval '1 minute',(r.context->>'wait_until')::timestamptz) where id=r.id;exit;end if;
 r.context:=r.context-array['wait_node','wait_started','wait_until','wait_account_id','wait_phone'];update public.agency_workspace_flow_runs set context=r.context where id=r.id;
 elsif action='split' then
 select choice.id into branch from (select b.value->>'id' id,sum((b.value->>'weight')::int) over(order by b.ordinality) boundary from jsonb_array_elements(n->'data'->'branches') with ordinality b) choice where choice.boundary>(('x'||substr(md5(r.flow_id::text||coalesce(lead.id::text,r.id::text)||r.cursor),1,8))::bit(32)::bigint%100) order by choice.boundary limit 1;
 elsif action='wait_appointment' then
 select * into booking from public.agency_workspace_appointments a where a.workspace_id=r.workspace_id and a.lead_id=lead.id and a.status='confirmed' and a.starts_at>now() and (coalesce(n->'data'->>'calendar_id','')='' or a.calendar_id::text=n->'data'->>'calendar_id') order by case when a.id::text=ev.payload->>'appointment_id' then 0 else 1 end,a.starts_at limit 1;
 if booking.id is null then raise exception 'Nenhuma reunião futura confirmada para este lead.';end if;resume_at:=greatest(now(),booking.starts_at-make_interval(mins=>(n->'data'->>'minutes')::int));
 elsif action='business_hours' then
 local_time:=now() at time zone (n->'data'->>'timezone');resume_at:=null;
 for offset_day in 0..7 loop
 if n->'data'->'days' @> to_jsonb(array[extract(isodow from local_time::date+offset_day)::int]) then
 if offset_day=0 and local_time::time>=(n->'data'->>'start')::time and local_time::time<(n->'data'->>'end')::time then resume_at:=now();exit;
 elsif offset_day>0 or local_time::time<(n->'data'->>'start')::time then resume_at:=((local_time::date+offset_day)+(n->'data'->>'start')::time) at time zone (n->'data'->>'timezone');exit;end if;end if;end loop;
 if resume_at is null then raise exception 'Não foi possível encontrar uma janela de atendimento.';end if;
 end if;
 if action='condition' then branch:=case when agency_private.workflow_condition(n->'data'->'rules',n->'data'->>'match',lead,ev.payload) then 'yes' else 'no' end;end if;
 select edge->>'target' into next_node from jsonb_array_elements(r.definition->'edges') edge where edge->>'source'=r.cursor and coalesce(edge->>'branch','')=coalesce(branch,'') limit 1;
 body:=agency_private.workflow_template(n->'data'->>'text',lead);
 if action in ('add_tags','remove_tags','move_stage','assign_user','send_message') and lead.id is null then raise exception 'Nenhum lead disponível para este bloco.';end if;
 if action='distribute' then
 select m.user_id into chosen from public.agency_workspace_members m where m.workspace_id=r.workspace_id and m.role<>'viewer' and n->'data'->'user_ids' ? m.user_id::text order by (select count(*) from public.agency_workspace_leads l where l.workspace_id=r.workspace_id and l.assignee_user_id=m.user_id),m.user_id limit 1;if chosen is null then raise exception 'Nenhum atendente disponível.';end if;update public.agency_workspace_leads set assignee_user_id=chosen where id=lead.id;
 elsif action in ('send_email','send_sms','create_group','add_participants','send_event','meta_event') then
 if lead.id is null then raise exception 'Nenhum lead vinculado ao bloco.';end if;
 node_payload:=coalesce(n->'data','{}')||jsonb_build_object('lead_id',lead.id,'name',lead.name,'phone',lead.phone,'email',lead.email,'text',body,'attributes',lead.attributes,'value',lead.value,'group_id',coalesce(nullif(n->'data'->>'group_id',''),r.context->>'group_id'));
 if action='send_email' then node_payload:=node_payload||jsonb_build_object('subject',agency_private.workflow_template(n->'data'->>'subject',lead));end if;
 if action='send_event' then select * into booking from public.agency_workspace_appointments a where a.workspace_id=r.workspace_id and a.lead_id=lead.id and a.status='confirmed' and a.starts_at>now() and (coalesce(n->'data'->>'calendar_id','')='' or a.calendar_id::text=n->'data'->>'calendar_id') order by a.starts_at limit 1;if booking.id is null then raise exception 'Nenhuma reunião confirmada para enviar.';end if;node_payload:=node_payload||jsonb_build_object('starts_at',booking.starts_at,'ends_at',booking.ends_at);end if;
 insert into public.agency_workspace_action_outbox(workspace_id,run_id,node_id,action,payload) values(r.workspace_id,r.id,r.cursor,action,node_payload) on conflict(run_id,node_id) do nothing;
 elsif action='add_tags' then select array_agg(distinct trim(t)) into tag_values from unnest(lead.tags||array(select jsonb_array_elements_text(n->'data'->'tags'))) t;update public.agency_workspace_leads set tags=coalesce(tag_values,'{}') where id=lead.id;
 elsif action='remove_tags' then update public.agency_workspace_leads set tags=array(select t from unnest(tags) t where not(n->'data'->'tags' ? t)) where id=lead.id;
 elsif action='move_stage' then select * into target from public.agency_workspace_stages where id::text=n->'data'->>'stage_id' and workspace_id=r.workspace_id;if target.id is null then raise exception 'Etapa de destino não encontrada.';end if;update public.agency_workspace_leads set stage_id=target.id,pipeline_id=target.pipeline_id where id=lead.id and stage_id<>target.id;
 elsif action='assign_user' then update public.agency_workspace_leads set assignee_user_id=(n->'data'->>'user_id')::uuid where id=lead.id;
 elsif action='create_task' then insert into public.agency_workspace_tasks(workspace_id,lead_id,title,due_at,assignee_user_id,origin_run,origin_node) values(r.workspace_id,lead.id,left(body,200),now()+make_interval(mins=>greatest(0,least(coalesce((n->'data'->>'due_minutes')::int,1440),43200))),nullif(n->'data'->>'assignee_user_id','')::uuid,r.id,r.cursor) on conflict(origin_run,origin_node) do nothing;
 elsif action='notify' then insert into public.agency_workspace_notifications(workspace_id,lead_id,title,origin_run,origin_node) values(r.workspace_id,lead.id,left(body,500),r.id,r.cursor) on conflict(origin_run,origin_node) do nothing;
 elsif action='send_message' then
 insert into public.agency_workspace_message_outbox(workspace_id,lead_id,phone,body,run_id,node_id,media_path) values(r.workspace_id,lead.id,lead.phone,body,r.id,r.cursor,n->'data'->>'file_path') on conflict(run_id,node_id) do nothing;
 end if;
 insert into public.agency_workspace_flow_steps(run_id,node_id,workspace_id,action,status,detail) values(r.id,r.cursor,r.workspace_id,action,case when action in ('wait','send_message','wait_appointment','business_hours','send_email','send_sms','create_group','add_participants','send_event','meta_event') then 'waiting' else 'completed' end,case when action in ('condition','wait_response','team_response','split') then branch else null end) on conflict(run_id,node_id) do update set status=excluded.status,detail=excluded.detail;
 update public.agency_workspace_flow_runs set cursor=next_node,status=case when action in ('wait','send_message','wait_appointment','business_hours','send_email','send_sms','create_group','add_participants','send_event','meta_event') then 'waiting' else 'running' end,next_run_at=case when action='wait' then now()+make_interval(mins=>(n->'data'->>'minutes')::int) when action in ('wait_appointment','business_hours') then resume_at when action in ('send_message','send_email','send_sms','create_group','add_participants','send_event','meta_event') then now()+interval '1 year' else now() end where id=r.id;
 r.cursor:=next_node;if action in ('wait','send_message','wait_appointment','business_hours','send_email','send_sms','create_group','add_participants','send_event','meta_event') then exit;end if;
 exception when others then
 update public.agency_workspace_flow_runs set status='failed',error=case when sqlstate in ('23503','23514','23502','22P02') then 'Confira os campos e vínculos do bloco.' else left(sqlerrm,300) end,finished_at=now() where id=r.id;
 insert into public.agency_workspace_flow_steps(run_id,node_id,workspace_id,action,status,detail) values(r.id,r.cursor,r.workspace_id,coalesce(action,'unknown'),'failed','Não foi possível executar este bloco.') on conflict(run_id,node_id) do update set status='failed',detail=excluded.detail;exit;
 end;
 end loop;processed:=processed+1;perform set_config('agency.workflow_run','',true);
 end loop;return processed;
end;$$;
create function agency_private.flow_configuration_issues(p_workspace uuid,p_definition jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$declare n jsonb;kind text;msg text;issues jsonb:='[]';begin
 if not agency_private.workspace_permission(p_workspace,'flows','read') then raise exception 'Sem acesso aos funis.' using errcode='42501';end if;
 for n in select value from jsonb_array_elements(coalesce(p_definition->'nodes','[]')) loop kind:=n->>'type';msg:=null;
 if kind='trigger' then
 if n->'data'->>'event'='external_webhook' and not exists(select 1 from agency_private.workspace_automation_webhooks where workspace_id=p_workspace and id::text=n->'data'->>'webhook_id' and enabled) then msg:='Gere e ative o webhook deste bloco.';
 elsif n->'data'->>'event'='form_submitted' and not exists(select 1 from public.agency_workspace_forms where workspace_id=p_workspace and enabled and (coalesce(n->'data'->>'source_id','')='' or id::text=n->'data'->>'source_id')) then msg:='Ative um formulário da empresa para este gatilho.';
 elsif n->'data'->>'event'='appointment_created' and not exists(select 1 from public.agency_workspace_calendars where workspace_id=p_workspace and enabled and (coalesce(n->'data'->>'source_id','')='' or id::text=n->'data'->>'source_id')) then msg:='Configure uma agenda ativa para este gatilho.';
 end if;
 end if;
 if kind='trigger' and n->'data'->>'event'='meta_lead' and not exists(select 1 from agency_private.workspace_providers provider where provider.workspace_id=p_workspace and provider.kind='meta' and provider.enabled and nullif(provider.credentials->>'app_secret','') is not null and nullif(provider.credentials->>'page_id','') is not null and nullif(provider.credentials->>'entry_stage_id','') is not null) then msg:='Configure o aplicativo, página, etapa de entrada e webhook Meta em Rastreamento de anúncios.';end if;
 if coalesce(n->'data'->>'account_id','')<>'' and not exists(select 1 from agency_private.workspace_whatsapp where workspace_id=p_workspace and enabled and active_account_id::text=n->'data'->>'account_id') then msg:='O WhatsApp selecionado não está conectado nesta empresa.';end if;
 if kind in ('send_message','send_event','create_group','add_participants','team_response','wait_response') or (kind='trigger' and n->'data'->>'event'='message_received') then
 if not exists(select 1 from agency_private.workspace_whatsapp where workspace_id=p_workspace and enabled and active_account_id is not null) then msg:='Conecte o WhatsApp desta empresa antes de ativar este bloco.';end if;
 end if;
 if kind in ('send_email','send_sms','meta_event') and not exists(select 1 from agency_private.workspace_providers provider where provider.workspace_id=p_workspace and provider.enabled and provider.kind=case when n->>'type'='send_email' then 'email' when n->>'type'='send_sms' then 'sms' else 'meta' end) then msg:='Configure e ative o provedor em Configurações → Geral.';end if;
 if kind in ('wait_appointment','send_event') and not exists(select 1 from public.agency_workspace_calendars where workspace_id=p_workspace and enabled and (coalesce(n->'data'->>'calendar_id','')='' or id::text=n->'data'->>'calendar_id')) then msg:='Escolha uma agenda ativa. O contato precisa ter reunião confirmada na execução.';end if;
 if kind='add_participants' and coalesce(n->'data'->>'group_id','')='' and not exists(with recursive ancestors(id) as(select e->>'source' from jsonb_array_elements(p_definition->'edges') e where e->>'target'=n->>'id' union select e->>'source' from jsonb_array_elements(p_definition->'edges') e join ancestors a on e->>'target'=a.id) select 1 from ancestors a join jsonb_array_elements(p_definition->'nodes') source on source->>'id'=a.id where source->>'type'='create_group') then msg:='Informe o ID de um grupo ou conecte um bloco Criar grupo antes desta ação.';end if;
 if kind='create_task' and coalesce(n->'data'->>'assignee_user_id','')<>'' and not exists(select 1 from public.agency_workspace_members where workspace_id=p_workspace and user_id::text=n->'data'->>'assignee_user_id') then msg:='Selecione um responsável desta empresa.';end if;
 if kind='add_participants' and coalesce(n->'data'->>'group_id','')<>'' and n->'data'->>'group_id'!~'^[0-9-]+@g[.]us$' then msg:='ID do grupo inválido.';end if;
 if kind<>'trigger' and not exists(select 1 from jsonb_array_elements(p_definition->'edges') e where e->>'target'=n->>'id') then msg:='Conecte este bloco à entrada do fluxo.';end if;
 if msg is not null then issues:=issues||jsonb_build_array(jsonb_build_object('node_id',n->>'id','message',msg));end if;
 end loop;return issues;
end;$$;
revoke all on function agency_private.flow_configuration_issues(uuid,jsonb) from public,anon;grant execute on function agency_private.flow_configuration_issues(uuid,jsonb) to authenticated;
create function public.agency_workspace_flow_issues(p_workspace uuid,p_definition jsonb) returns jsonb language sql security invoker set search_path='' as $$select agency_private.flow_configuration_issues(p_workspace,p_definition);$$;
revoke all on function public.agency_workspace_flow_issues(uuid,jsonb) from public,anon;grant execute on function public.agency_workspace_flow_issues(uuid,jsonb) to authenticated;
create function agency_private.enforce_flow_readiness() returns trigger language plpgsql security invoker set search_path='' as $$declare issues jsonb;n jsonb;begin
 for n in select value from jsonb_array_elements(new.definition->'nodes') loop
 if coalesce(n->'data'->>'assignee_user_id','')<>'' and not exists(select 1 from public.agency_workspace_members where workspace_id=new.workspace_id and user_id::text=n->'data'->>'assignee_user_id') then raise exception 'Responsável da tarefa não pertence a esta empresa.';end if;
 if coalesce(n->'data'->>'calendar_id','')<>'' and not exists(select 1 from public.agency_workspace_calendars where workspace_id=new.workspace_id and id::text=n->'data'->>'calendar_id') then raise exception 'Agenda não pertence a esta empresa.';end if;
 end loop;
 if new.enabled and new.definition->>'configuration_version'='3' and current_user='authenticated' then issues:=agency_private.flow_configuration_issues(new.workspace_id,new.definition);if jsonb_array_length(issues)>0 then raise exception 'Corrija os blocos antes de ativar: %',issues;end if;end if;return new;
end;$$;
revoke all on function agency_private.enforce_flow_readiness() from public,anon,authenticated;
create trigger workspace_flow_readiness before insert or update on public.agency_workspace_flows for each row execute function agency_private.enforce_flow_readiness();
alter table public.agency_workspace_tracking_links add column slug text unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,59}$');
grant insert(slug),update(slug) on public.agency_workspace_tracking_links to authenticated;
-- Tracking destinations and privacy-safe, revocable Google CSV import capability.
alter table public.agency_workspace_tracking_links add column whatsapp_account_id uuid,add column stage_id uuid,add column capture_lead boolean not null default true,add column code_style text not null default 'visible' check(code_style in ('visible','invisible'));
alter table public.agency_workspace_tracking_links add constraint workspace_link_stage foreign key(stage_id,workspace_id) references public.agency_workspace_stages(id,workspace_id);
alter table public.agency_workspace_tracking_links add constraint workspace_link_account foreign key(whatsapp_account_id,workspace_id) references public.agency_workspace_whatsapp_accounts(id,workspace_id);
grant insert(whatsapp_account_id,stage_id,capture_lead,code_style),update(whatsapp_account_id,stage_id,capture_lead,code_style) on public.agency_workspace_tracking_links to authenticated;
create table agency_private.workspace_ad_destinations(workspace_id uuid primary key references public.agency_client_workspaces(id) on delete cascade,create_leads boolean not null default true,stage_id uuid,foreign key(stage_id,workspace_id) references public.agency_workspace_stages(id,workspace_id));
alter table agency_private.workspace_ad_destinations enable row level security;revoke all on agency_private.workspace_ad_destinations from public,anon,authenticated;grant all on agency_private.workspace_ad_destinations to service_role;
create function public.agency_workspace_ad_destination(p_workspace uuid,p_values jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$declare r agency_private.workspace_ad_destinations;begin
 if p_values is not null then insert into agency_private.workspace_ad_destinations(workspace_id,create_leads,stage_id) values(p_workspace,coalesce((p_values->>'create_leads')::boolean,true),nullif(p_values->>'stage_id','')::uuid) on conflict(workspace_id) do update set create_leads=excluded.create_leads,stage_id=excluded.stage_id;end if;select * into r from agency_private.workspace_ad_destinations where workspace_id=p_workspace;return case when r.workspace_id is null then jsonb_build_object('create_leads',true,'stage_id',null) else to_jsonb(r) end;end;$$;
revoke all on function public.agency_workspace_ad_destination(uuid,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_ad_destination(uuid,jsonb) to service_role;
create table agency_private.workspace_google_feeds(workspace_id uuid primary key references public.agency_client_workspaces(id) on delete cascade,token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),enabled boolean not null default false,last_fetched_at timestamptz,fetch_count bigint not null default 0);
create table agency_private.workspace_google_feed_rows(action_id uuid primary key references public.agency_workspace_action_outbox(id) on delete cascade,workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,first_fetched_at timestamptz not null default now());
create index workspace_google_feed_rows_scope on agency_private.workspace_google_feed_rows(workspace_id,first_fetched_at);
alter table agency_private.workspace_google_feeds enable row level security;alter table agency_private.workspace_google_feed_rows enable row level security;
revoke all on agency_private.workspace_google_feeds,agency_private.workspace_google_feed_rows from public,anon,authenticated;grant all on agency_private.workspace_google_feeds,agency_private.workspace_google_feed_rows to service_role;
create function public.agency_workspace_google_feed_settings(p_workspace uuid,p_values jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$declare f agency_private.workspace_google_feeds;begin
 if p_values is not null then
 if coalesce((p_values->>'enabled')::boolean,false) and exists(select 1 from agency_private.workspace_providers where workspace_id=p_workspace and kind='google_ads' and enabled) then raise exception 'Desative o envio por API antes de ativar a importação CSV, para não duplicar conversões.';end if;
 insert into agency_private.workspace_google_feeds(workspace_id,enabled) values(p_workspace,coalesce((p_values->>'enabled')::boolean,false)) on conflict(workspace_id) do update set enabled=excluded.enabled,token=case when coalesce((p_values->>'rotate')::boolean,false) then replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') else agency_private.workspace_google_feeds.token end;
 end if;
 select * into f from agency_private.workspace_google_feeds where workspace_id=p_workspace;
 return jsonb_build_object('enabled',coalesce(f.enabled,false),'token',f.token,'last_fetched_at',f.last_fetched_at,'fetch_count',coalesce(f.fetch_count,0),'available',(select count(*) from public.agency_workspace_action_outbox where workspace_id=p_workspace and action='google_conversion' and status in ('queued','failed') and nullif(payload->'attributes'->>'gclid','') is not null),'without_click',(select count(*) from public.agency_workspace_action_outbox where workspace_id=p_workspace and action='google_conversion' and nullif(payload->'attributes'->>'gclid','') is null),'fetched_7d',(select count(*) from agency_private.workspace_google_feed_rows where workspace_id=p_workspace and first_fetched_at>now()-interval '7 days'));
end;$$;
revoke all on function public.agency_workspace_google_feed_settings(uuid,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_google_feed_settings(uuid,jsonb) to service_role;
create function public.agency_workspace_google_feed_rows(p_token text) returns jsonb language plpgsql security invoker set search_path='' as $$declare f agency_private.workspace_google_feeds;rows jsonb;begin
 select * into f from agency_private.workspace_google_feeds where token=p_token and enabled for update;if f.workspace_id is null or not public.agency_workspace_available(f.workspace_id) then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'gclid',payload->'attributes'->>'gclid','name',payload->>'event_name','time',to_char(created_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')||'+00:00','value',coalesce(payload->>'value','0'),'currency','BRL') order by created_at),'[]') into rows from public.agency_workspace_action_outbox o where workspace_id=f.workspace_id and action='google_conversion' and status in ('queued','failed') and created_at>now()-interval '90 days' and nullif(payload->'attributes'->>'gclid','') is not null and (rule_id is null or exists(select 1 from public.agency_workspace_conversion_rules r where r.id=o.rule_id and r.enabled));
 insert into agency_private.workspace_google_feed_rows(action_id,workspace_id) select (value->>'id')::uuid,f.workspace_id from jsonb_array_elements(rows) on conflict(action_id) do nothing;
 update agency_private.workspace_google_feeds set last_fetched_at=now(),fetch_count=fetch_count+1 where workspace_id=f.workspace_id;return jsonb_build_object('rows',rows);
end;$$;
revoke all on function public.agency_workspace_google_feed_rows(text) from public,anon,authenticated;grant execute on function public.agency_workspace_google_feed_rows(text) to service_role;
-- Prevent API/CSV double delivery even if settings are modified outside the UI.
create function agency_private.google_delivery_exclusivity() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.kind='google_ads' and new.enabled and exists(select 1 from agency_private.workspace_google_feeds where workspace_id=new.workspace_id and enabled) then raise exception 'Desative a importação CSV antes de ativar o envio por API.';end if;return new;
end;$$;
revoke all on function agency_private.google_delivery_exclusivity() from public,anon,authenticated;
create trigger workspace_google_delivery before insert or update on agency_private.workspace_providers for each row execute function agency_private.google_delivery_exclusivity();

create or replace function public.agency_workspace_claim_action(p_workspace uuid) returns jsonb language plpgsql security invoker set search_path='' as $$declare a public.agency_workspace_action_outbox;begin
 update public.agency_workspace_action_outbox set status='uncertain',error='A confirmação do provedor não chegou. Confira antes de repetir.',updated_at=now() where workspace_id=p_workspace and status='sending' and updated_at<now()-interval '2 minutes';
 select o.* into a from public.agency_workspace_action_outbox o join public.agency_client_workspaces w on w.id=o.workspace_id and w.status='active' join agency_private.pilot_accounts p on p.user_id=w.owner_user_id and p.enabled where o.workspace_id=p_workspace and o.status='queued' and not(o.action='google_conversion' and exists(select 1 from agency_private.workspace_google_feeds f where f.workspace_id=o.workspace_id and f.enabled)) and (o.run_id is null or exists(select 1 from public.agency_workspace_flow_runs r join public.agency_workspace_flows f on f.id=r.flow_id and f.enabled where r.id=o.run_id and r.status='waiting')) order by o.created_at limit 1 for update of o skip locked;
 if a.id is null then return null;end if;update public.agency_workspace_action_outbox set status='sending',updated_at=now() where id=a.id;return to_jsonb(a);
end;$$;

create or replace function public.agency_workspace_resolve_tracking_link(p_token text,p_attributes jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$declare l public.agency_workspace_tracking_links;c public.agency_workspace_tracking_clicks;attrs jsonb;begin
 select * into l from public.agency_workspace_tracking_links where (token=p_token or slug=p_token) and enabled for update;if l.id is null or not public.agency_workspace_available(l.workspace_id) then return null;end if;
 if jsonb_typeof(p_attributes) is distinct from 'object' or length(p_attributes::text)>6000 then raise exception 'Atribuição inválida.';end if;
 attrs:=jsonb_strip_nulls(jsonb_build_object('utm_source',nullif(l.source,''),'utm_medium',nullif(l.medium,''),'utm_campaign',nullif(l.campaign,''),'utm_content',nullif(l.content,''),'utm_term',nullif(l.term,''),'tracking_link_id',l.id))||p_attributes;
 insert into public.agency_workspace_tracking_clicks(workspace_id,link_id,attributes) values(l.workspace_id,l.id,attrs) returning * into c;
 update public.agency_workspace_tracking_links set clicks=clicks+1 where id=l.id;
 return jsonb_build_object('destination',l.destination,'source',l.source,'campaign',l.campaign,'attributes',attrs,'click_id',c.id,'click_ref',c.click_ref,'code_style',l.code_style);
end;$$;

create or replace function public.agency_workspace_ingest_message(p_workspace uuid,p_account uuid,p_event jsonb) returns uuid language plpgsql security invoker set search_path='' as $$declare c agency_private.workspace_whatsapp;l uuid;m uuid;first_contact boolean;starts_burst boolean;attrs jsonb;ref text;previous_direction text;link public.agency_workspace_tracking_links;target public.agency_workspace_stages;ad agency_private.workspace_ad_destinations;capture boolean:=true;begin
 select * into c from agency_private.workspace_whatsapp where workspace_id=p_workspace and enabled and active_account_id=p_account for update;if c.workspace_id is null then raise exception 'Conexão inativa.';end if;
 if not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=p_workspace and w.status='active') then raise exception 'Subconta indisponível.';end if;
 select id into m from public.agency_workspace_messages where account_id=p_account and provider_id=p_event->>'providerId';if m is not null then return m;end if;
 select direction into previous_direction from public.agency_workspace_messages where account_id=p_account and phone=p_event->>'phone' and created_at<=coalesce((p_event->>'createdAt')::timestamptz,now()) order by created_at desc limit 1;starts_burst:=(p_event->>'direction'='entrada' and (previous_direction is null or previous_direction='saida'));
 first_contact:=not exists(select 1 from public.agency_workspace_messages where account_id=p_account and phone=p_event->>'phone');
 attrs:=coalesce(p_event->'attribution','{}');ref:=coalesce(nullif(attrs->>'cg_ref',''),(regexp_match(coalesce(p_event->>'body',''),'(?i)CG-([a-f0-9]{16})'))[1]);
 select t.* into link from public.agency_workspace_tracking_links t join public.agency_workspace_tracking_clicks x on x.link_id=t.id and x.workspace_id=t.workspace_id where x.workspace_id=p_workspace and (x.click_ref=lower(ref) or x.id::text=attrs->>'cg_click') and t.enabled limit 1;
 if link.id is not null then capture:=link.capture_lead;select * into target from public.agency_workspace_stages where workspace_id=p_workspace and id=link.stage_id;
 elsif attrs->>'utm_source'='meta' or coalesce(attrs->>'ctwa_clid','')<>'' then select * into ad from agency_private.workspace_ad_destinations where workspace_id=p_workspace;capture:=coalesce(ad.create_leads,true);select * into target from public.agency_workspace_stages where workspace_id=p_workspace and id=ad.stage_id;end if;
 if not coalesce((p_event->>'isGroup')::boolean,false) then if capture then l:=agency_private.capture_contact(p_workspace,coalesce(target.pipeline_id,c.pipeline_id),coalesce(target.id,c.stage_id),coalesce(nullif(p_event->>'contactName',''),p_event->>'phone'),p_event->>'phone','','whatsapp',p_event->>'providerId');else select id into l from public.agency_workspace_leads where workspace_id=p_workspace and agency_private.contact_key(phone,email)=agency_private.contact_key(p_event->>'phone','') limit 1;end if;end if;
 attrs:=coalesce(p_event->'attribution','{}');ref:=(regexp_match(coalesce(p_event->>'body',''),'(?i)CG-([a-f0-9]{16})'))[1];if ref is not null then attrs:=attrs||jsonb_build_object('cg_ref',lower(ref));end if;
 if l is not null then perform agency_private.attach_workspace_click(p_workspace,l,attrs);select attributes into attrs from public.agency_workspace_leads where id=l and workspace_id=p_workspace;end if;
 insert into public.agency_workspace_messages(workspace_id,account_id,provider_id,phone,contact_name,is_group,sender_name,direction,body,kind,lead_id,created_at) values(p_workspace,p_account,p_event->>'providerId',p_event->>'phone',p_event->>'contactName',coalesce((p_event->>'isGroup')::boolean,false),p_event->>'senderName',p_event->>'direction',p_event->>'body',coalesce(p_event->>'kind','texto'),l,coalesce((p_event->>'createdAt')::timestamptz,now())) returning id into m;
 if link.id is not null then update public.agency_workspace_tracking_clicks set conversation_at=coalesce(conversation_at,coalesce((p_event->>'createdAt')::timestamptz,now())),account_id=p_account where workspace_id=p_workspace and link_id=link.id and (click_ref=lower(ref) or id::text=attrs->>'cg_click');end if;
 perform agency_private.emit_workspace_event(p_workspace,'message_received',l,p_event->>'providerId',jsonb_build_object('message',case when p_event->>'body' in ('[imagem]','[audio]','[video]','[documento]') then '' else p_event->>'body' end,'kind',coalesce(p_event->>'kind','texto'),'direction',p_event->>'direction','first_contact',first_contact,'starts_burst',starts_burst,'account_id',p_account,'phone',p_event->>'phone','message_at',coalesce(p_event->>'createdAt',now()::text),'message_id',m,'attribution',attrs));return m;
end;$$;

alter table public.agency_workspace_conversion_rules drop constraint agency_workspace_conversion_rules_event_name_check;
alter table public.agency_workspace_conversion_rules add constraint agency_workspace_conversion_rules_event_name_check check((provider='meta' and event_name~'^[A-Za-z][A-Za-z0-9_]{0,59}$') or (provider='google_ads' and length(trim(event_name)) between 1 and 200));
alter table public.agency_workspace_tracking_clicks add column conversation_at timestamptz,add column account_id uuid;
alter table public.agency_workspace_tracking_clicks add constraint workspace_click_account foreign key(account_id,workspace_id) references public.agency_workspace_whatsapp_accounts(id,workspace_id);
create function public.agency_workspace_tracking_summary(p_workspace uuid,p_days integer default 30) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(row_to_json(s)),'[]') from (
 select l.id,count(c.id)::integer clicks,count(c.conversation_at)::integer conversations,count(c.lead_id)::integer leads,count(c.id) filter(where coalesce(c.attributes->>'gclid',c.attributes->>'gbraid',c.attributes->>'wbraid','')<>'')::integer google,max(c.created_at) last_click
 from public.agency_workspace_tracking_links l left join public.agency_workspace_tracking_clicks c on c.link_id=l.id and c.workspace_id=l.workspace_id and c.created_at>=now()-make_interval(days=>greatest(1,least(p_days,90)))
 where l.workspace_id=p_workspace and agency_private.workspace_permission(p_workspace,'settings','read') group by l.id
 ) s;
$$;
revoke all on function public.agency_workspace_tracking_summary(uuid,integer) from public,anon;grant execute on function public.agency_workspace_tracking_summary(uuid,integer) to authenticated;
