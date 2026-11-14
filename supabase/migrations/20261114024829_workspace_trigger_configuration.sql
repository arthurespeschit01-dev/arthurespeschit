-- Additive pilot-only configuration: scoped trigger filters, real webhook endpoints, response watches and attribution receipts.
create function agency_private.workflow_text(p_text text) returns text language sql immutable set search_path='' as $$select regexp_replace(translate(lower(trim(coalesce(p_text,''))),'áàãâäéèêëíìîïóòõôöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),'[[:space:]]+',' ','g');$$;
revoke all on function agency_private.workflow_text(text) from public,anon,authenticated;
create function agency_private.workflow_message_matches(p_text text,p_terms jsonb,p_mode text default 'any') returns boolean language plpgsql immutable set search_path='' as $$declare term text;actual text;hit boolean;result boolean;begin
 if p_terms is null or p_terms='[]'::jsonb then return true;end if;if jsonb_typeof(p_terms)<>'array' or jsonb_array_length(p_terms)>30 then return false;end if;actual:=agency_private.workflow_text(p_text);result:=p_mode='all' or p_mode='none';
 for term in select jsonb_array_elements_text(p_terms) loop term:=agency_private.workflow_text(term);if term='' then continue;end if;hit:=case when p_mode='exact' then actual=term else position(term in actual)>0 end;if p_mode in ('any','exact') then result:=result or hit;elsif p_mode='all' then result:=result and hit;elsif p_mode='none' then result:=result and not hit;else return false;end if;end loop;return result;
end;$$;
revoke all on function agency_private.workflow_message_matches(text,jsonb,text) from public,anon,authenticated;

create table agency_private.workspace_automation_webhooks(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,name text not null default 'Webhook do funil' check(length(trim(name)) between 1 and 160),token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),enabled boolean not null default false,stage_id uuid not null,pipeline_id uuid not null,contact_map jsonb not null default '{"name":"contact.name","phone":"contact.phone","email":"contact.email","request_id":"request_id"}',created_at timestamptz not null default now(),foreign key(stage_id,pipeline_id,workspace_id) references public.agency_workspace_stages(id,pipeline_id,workspace_id));
alter table agency_private.workspace_automation_webhooks enable row level security;revoke all on agency_private.workspace_automation_webhooks from public,anon,authenticated;grant all on agency_private.workspace_automation_webhooks to service_role;
create index workspace_automation_webhooks_scope on agency_private.workspace_automation_webhooks(workspace_id);
create table public.agency_workspace_webhook_receipts(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,webhook_id uuid not null references agency_private.workspace_automation_webhooks(id) on delete cascade,request_id uuid not null,lead_id uuid,contact jsonb not null,created_at timestamptz not null default now(),unique(webhook_id,request_id),foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id));
create index workspace_webhook_receipts_scope on public.agency_workspace_webhook_receipts(workspace_id,created_at);
create index workspace_webhook_receipts_lead on public.agency_workspace_webhook_receipts(lead_id,workspace_id);
alter table public.agency_workspace_webhook_receipts enable row level security;revoke all on public.agency_workspace_webhook_receipts from public,anon,authenticated;grant select on public.agency_workspace_webhook_receipts to authenticated;grant all on public.agency_workspace_webhook_receipts to service_role;
create policy workspace_webhook_receipts_read on public.agency_workspace_webhook_receipts for select to authenticated using(agency_private.workspace_manage(workspace_id));
create function agency_private.workspace_webhook_owned(p_workspace uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select agency_private.workspace_manage(p_workspace) and exists(select 1 from agency_private.workspace_automation_webhooks where workspace_id=p_workspace and id=p_id);$$;
revoke all on function agency_private.workspace_webhook_owned(uuid,uuid) from public,anon;grant execute on function agency_private.workspace_webhook_owned(uuid,uuid) to authenticated,service_role;
create function public.agency_workspace_automation_webhook(p_workspace uuid,p_id uuid default null,p_values jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$declare w agency_private.workspace_automation_webhooks;stage public.agency_workspace_stages;m jsonb;begin
 if p_values is not null then
 select * into stage from public.agency_workspace_stages where workspace_id=p_workspace and id=(p_values->>'stage_id')::uuid;if stage.id is null then raise exception 'Escolha uma etapa desta empresa.';end if;
 m:=coalesce(p_values->'contact_map','{"name":"contact.name","phone":"contact.phone","email":"contact.email","request_id":"request_id"}');
 if jsonb_typeof(m)<>'object' or coalesce(m->>'name','')!~'^[A-Za-z0-9_.-]{1,100}$' or coalesce(m->>'request_id','')!~'^[A-Za-z0-9_.-]{1,100}$' or exists(select 1 from jsonb_each_text(m) x where x.key not in ('name','phone','email','request_id') or x.value!~'^[A-Za-z0-9_.-]{0,100}$' or x.value~'(__proto__|constructor|prototype)') then raise exception 'Revise o mapeamento dos campos.';end if;
 if p_id is null then insert into agency_private.workspace_automation_webhooks(workspace_id,name,stage_id,pipeline_id,contact_map,enabled) values(p_workspace,trim(coalesce(p_values->>'name','Webhook do funil')),stage.id,stage.pipeline_id,m,coalesce((p_values->>'enabled')::boolean,false)) returning * into w;
 else update agency_private.workspace_automation_webhooks set name=trim(coalesce(p_values->>'name','Webhook do funil')),stage_id=stage.id,pipeline_id=stage.pipeline_id,contact_map=m,enabled=coalesce((p_values->>'enabled')::boolean,false) where workspace_id=p_workspace and id=p_id returning * into w;if w.id is null then raise exception 'Webhook não encontrado nesta empresa.';end if;end if;
 else select * into w from agency_private.workspace_automation_webhooks where workspace_id=p_workspace and id=p_id;end if;return case when w.id is null then null else to_jsonb(w) end;
end;$$;
revoke all on function public.agency_workspace_automation_webhook(uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_automation_webhook(uuid,uuid,jsonb) to service_role;
create function public.agency_workspace_find_automation_webhook(p_token text) returns jsonb language sql security invoker set search_path='' as $$select to_jsonb(w) from agency_private.workspace_automation_webhooks w where token=p_token and enabled;$$;
revoke all on function public.agency_workspace_find_automation_webhook(text) from public,anon,authenticated;grant execute on function public.agency_workspace_find_automation_webhook(text) to service_role;
create function public.agency_workspace_receive_automation_webhook(p_id uuid,p_request uuid,p_contact jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare w agency_private.workspace_automation_webhooks;l uuid;r public.agency_workspace_webhook_receipts;begin
 select * into w from agency_private.workspace_automation_webhooks where id=p_id and enabled for update;if w.id is null then raise exception 'Webhook desativado.';end if;
 if not public.agency_workspace_available(w.workspace_id) then raise exception 'Subconta indisponível.';end if;
 select * into r from public.agency_workspace_webhook_receipts where webhook_id=w.id and request_id=p_request;if r.id is not null then if r.contact<>p_contact then raise exception 'Este identificador já foi usado com outros dados.';end if;return jsonb_build_object('received',true,'duplicate',true);end if;
 if (select count(*) from public.agency_workspace_webhook_receipts where webhook_id=w.id and created_at>now()-interval '1 minute')>=30 then raise exception 'Limite de recebimentos atingido. Aguarde um minuto.';end if;
 l:=agency_private.capture_contact(w.workspace_id,w.pipeline_id,w.stage_id,p_contact->>'name',p_contact->>'phone',p_contact->>'email','form',w.id::text);
 if p_contact ? 'attribution' then perform agency_private.attach_workspace_click(w.workspace_id,l,p_contact->'attribution');end if;
 insert into public.agency_workspace_webhook_receipts(workspace_id,webhook_id,request_id,lead_id,contact) values(w.workspace_id,w.id,p_request,l,p_contact);
 perform agency_private.emit_workspace_event(w.workspace_id,'external_webhook',l,w.id::text,jsonb_build_object('webhook_id',w.id,'contact',p_contact));return jsonb_build_object('received',true,'duplicate',false);
end;$$;
revoke all on function public.agency_workspace_receive_automation_webhook(uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_receive_automation_webhook(uuid,uuid,jsonb) to service_role;
create or replace function agency_private.queue_workspace_flows() returns trigger language plpgsql security definer set search_path='' as $$ declare f record;t jsonb;l public.agency_workspace_leads;begin
 if new.depth>=8 or not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=new.workspace_id and w.status='active') then return new;end if;
 select * into l from public.agency_workspace_leads where id=new.lead_id and workspace_id=new.workspace_id;
 for f in select * from public.agency_workspace_flows where workspace_id=new.workspace_id and enabled loop
 select value into t from jsonb_array_elements(f.definition->'nodes') where value->>'type'='trigger' limit 1;
 if t->'data'->>'event'<>new.event_type then continue;end if;
 if coalesce(t->'data'->>'source_id','')<>'' and t->'data'->>'source_id' is distinct from new.source_id then continue;end if;
 if new.event_type='stage_changed' then
 if coalesce(t->'data'->>'pipeline_id','')<>'' and t->'data'->>'pipeline_id' is distinct from new.payload->>'pipeline_id' then continue;end if;
 if coalesce(t->'data'->>'from_stage_id','')<>'' and t->'data'->>'from_stage_id' is distinct from new.payload->>'old_stage_id' then continue;end if;
 if coalesce(t->'data'->>'to_stage_id','')<>'' and t->'data'->>'to_stage_id' is distinct from new.payload->>'stage_id' then continue;end if;
 elsif new.event_type='lead_created' then
 if coalesce(t->'data'->>'pipeline_id','')<>'' and t->'data'->>'pipeline_id' is distinct from new.payload->>'pipeline_id' then continue;end if;
 if coalesce(t->'data'->>'entry_stage_id','')<>'' and t->'data'->>'entry_stage_id' is distinct from new.payload->>'stage_id' then continue;end if;
 if coalesce(t->'data'->>'lead_source','')<>'' and t->'data'->>'lead_source' is distinct from new.payload->>'source' then continue;end if;
 elsif new.event_type='tag_added' and coalesce(t->'data'->>'tag','')<>'' and agency_private.workflow_text(t->'data'->>'tag')<>agency_private.workflow_text(new.payload->>'tag') then continue;
 elsif new.event_type='external_webhook' and coalesce(t->'data'->>'webhook_id','')<>'' and t->'data'->>'webhook_id' is distinct from new.payload->>'webhook_id' then continue;
 elsif new.event_type='meta_lead' and coalesce(t->'data'->>'meta_form_id','')<>'' and t->'data'->>'meta_form_id' is distinct from new.payload->>'form_id' then continue;
 end if;
 if coalesce(t->'data'->>'required_tag','')<>'' and not exists(select 1 from unnest(l.tags) tag where agency_private.workflow_text(tag)=agency_private.workflow_text(t->'data'->>'required_tag')) then continue;end if;
 if new.event_type='message_received' then
 if t->'data' ? 'texts' then if not agency_private.workflow_message_matches(new.payload->>'message',t->'data'->'texts',coalesce(t->'data'->>'text_mode','any')) then continue;end if;
 elsif coalesce(t->'data'->>'contains','')<>'' and not agency_private.workflow_message_matches(new.payload->>'message',jsonb_build_array(t->'data'->>'contains'),'any') then continue;end if;
 if coalesce(t->'data'->>'account_id','')<>'' and t->'data'->>'account_id' is distinct from new.payload->>'account_id' then continue;end if;
 if coalesce((t->'data'->>'ad_only')::boolean,false) and coalesce(new.payload->'attribution'->>'utm_source','')<>'meta' and coalesce(new.payload->'attribution'->>'ctwa_clid','')='' then continue;end if;
 if t->'data'->>'message_mode'='first_unanswered' and not coalesce((new.payload->>'starts_burst')::boolean,false) then continue;end if;

 if coalesce(t->'data'->>'direction','incoming')<>'both' and coalesce(t->'data'->>'direction','incoming')<>(case when new.payload->>'direction'='entrada' then 'incoming' else 'outgoing' end) then continue;end if;
 if (coalesce((t->'data'->>'first_contact')::boolean,false) or t->'data'->>'message_mode'='first_contact') and not coalesce((new.payload->>'first_contact')::boolean,false) then continue;end if;
 end if;
 if new.origin_run is not null and exists(select 1 from public.agency_workspace_flow_runs where id=new.origin_run and flow_id=f.id) then continue;end if;
 insert into public.agency_workspace_flow_runs(workspace_id,flow_id,event_id,definition,version,cursor) values(new.workspace_id,f.id,new.id,f.definition,f.version,t->>'id') on conflict(flow_id,event_id) do nothing;
 end loop;return new;
end;$$;
create or replace function agency_private.workspace_lead_events() returns trigger language plpgsql security definer set search_path='' as $$ declare tag text;begin
 if tg_op='INSERT' then perform agency_private.emit_workspace_event(new.workspace_id,'lead_created',new.id,new.source_id,jsonb_build_object('source',new.source_type,'name',new.name,'phone',new.phone,'email',new.email,'stage_id',new.stage_id,'pipeline_id',new.pipeline_id));
 else if new.stage_id<>old.stage_id then perform agency_private.emit_workspace_event(new.workspace_id,'stage_changed',new.id,new.stage_id::text,jsonb_build_object('old_stage_id',old.stage_id,'stage_id',new.stage_id,'pipeline_id',new.pipeline_id));end if;foreach tag in array new.tags loop if not(tag=any(old.tags)) then perform agency_private.emit_workspace_event(new.workspace_id,'tag_added',new.id,tag,jsonb_build_object('tag',tag));end if;end loop;end if;return new;
end;$$;
create or replace function agency_private.validate_workspace_flow() returns trigger language plpgsql security invoker set search_path='' as $$ declare nodes jsonb;edges jsonb;n jsonb;e jsonb;node_id text;ids text[]:='{}';reachable text[]:='{}';next_ids text[];trigger_id text;count_trigger integer:=0;kind text;begin
 nodes:=new.definition->'nodes';edges:=new.definition->'edges';if jsonb_typeof(nodes) is distinct from 'array' or jsonb_typeof(edges) is distinct from 'array' or jsonb_array_length(nodes)>40 or jsonb_array_length(edges)>80 or length(new.definition::text)>60000 then raise exception 'Definição de fluxo inválida.';end if;
 for n in select value from jsonb_array_elements(nodes) loop
 node_id:=n->>'id';kind:=n->>'type';if coalesce(node_id,'')!~'^[a-zA-Z0-9_-]{1,80}$' or node_id=any(ids) or coalesce(kind,'') not in ('trigger','condition','add_tags','remove_tags','move_stage','create_task','notify','send_message','wait','assign_user','stage','wait_response','team_response','wait_appointment','business_hours','split','distribute','send_event','create_group','add_participants','send_email','send_sms','meta_event') then raise exception 'Bloco inválido ou repetido.';end if;ids:=array_append(ids,node_id);
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
 if kind='split' and (jsonb_typeof(n->'data'->'branches') is distinct from 'array' or jsonb_array_length(n->'data'->'branches') not between 2 and 10 or exists(select 1 from jsonb_array_elements(n->'data'->'branches') b where coalesce(b->>'id','')!~'^[a-zA-Z0-9_-]{1,80}$' or coalesce(b->>'weight','')!~'^[0-9]{1,3}$' or (b->>'weight')::int not between 1 and 99) or (select sum((b->>'weight')::int) from jsonb_array_elements(n->'data'->'branches') b)<>100 or (select count(distinct b->>'id') from jsonb_array_elements(n->'data'->'branches') b)<>jsonb_array_length(n->'data'->'branches')) then raise exception 'Os caminhos devem ter pesos positivos que somam 100%%.';end if;
 if kind='business_hours' and (not exists(select 1 from pg_catalog.pg_timezone_names where name=n->'data'->>'timezone') or jsonb_typeof(n->'data'->'days') is distinct from 'array' or jsonb_array_length(n->'data'->'days') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(n->'data'->'days') d where d.value!~'^[1-7]$') or coalesce(n->'data'->>'start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(n->'data'->>'end','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (n->'data'->>'end')::time<=(n->'data'->>'start')::time) then raise exception 'Configure os dias, horários e fuso do bloco.';end if;
 if kind='distribute' and (jsonb_typeof(n->'data'->'user_ids') is distinct from 'array' or jsonb_array_length(n->'data'->'user_ids') not between 1 and 30 or exists(select 1 from jsonb_array_elements_text(n->'data'->'user_ids') chosen where not exists(select 1 from public.agency_workspace_members m where m.workspace_id=new.workspace_id and m.user_id::text=chosen.value and m.role<>'viewer'))) then raise exception 'Selecione atendentes desta empresa.';end if;
 if kind='send_email' and length(trim(coalesce(n->'data'->>'subject',''))) not between 1 and 200 then raise exception 'Preencha o assunto do e-mail.';end if;
 if kind='send_sms' and length(coalesce(n->'data'->>'text',''))>160 then raise exception 'O SMS deve ter no máximo 160 caracteres.';end if;
 if kind='meta_event' and coalesce(n->'data'->>'event_name','')!~'^[A-Za-z][A-Za-z0-9_]{0,59}$' then raise exception 'Escolha o evento de conversão.';end if;
 if kind='add_participants' and (jsonb_typeof(n->'data'->'participants') is distinct from 'array' or jsonb_array_length(n->'data'->'participants') not between 1 and 50) then raise exception 'Informe os telefones a adicionar ao grupo.';end if;
 if kind='trigger' then
 if exists(select 1 from jsonb_each(n->'data') flag where flag.key in ('first_contact','ad_only') and jsonb_typeof(flag.value)<>'boolean') then raise exception 'Opção do gatilho inválida.';end if;
 if coalesce(n->'data'->>'meta_form_id','')<>'' and n->'data'->>'meta_form_id'!~'^[0-9]{5,40}$' then raise exception 'ID do formulário Meta inválido.';end if;
 if length(coalesce(n->'data'->>'tag',''))>60 or length(coalesce(n->'data'->>'required_tag',''))>60 then raise exception 'A etiqueta deve ter até 60 caracteres.';end if;
 if coalesce(n->'data'->>'pipeline_id','')<>'' and not exists(select 1 from public.agency_workspace_pipelines where workspace_id=new.workspace_id and id::text=n->'data'->>'pipeline_id') then raise exception 'Pipeline do gatilho não pertence à empresa.';end if;
 if exists(select 1 from jsonb_each_text(n->'data') selector where selector.key in ('from_stage_id','to_stage_id','entry_stage_id') and selector.value<>'' and not exists(select 1 from public.agency_workspace_stages where workspace_id=new.workspace_id and id::text=selector.value)) then raise exception 'Escolha etapas desta empresa no gatilho.';end if;
 if coalesce(n->'data'->>'to_stage_id','')<>'' and coalesce(n->'data'->>'pipeline_id','')<>'' and not exists(select 1 from public.agency_workspace_stages where id::text=n->'data'->>'to_stage_id' and pipeline_id::text=n->'data'->>'pipeline_id' and workspace_id=new.workspace_id) then raise exception 'A etapa de destino não pertence à pipeline selecionada.';end if;
 if coalesce(n->'data'->>'account_id','')<>'' and not exists(select 1 from public.agency_workspace_whatsapp_accounts where workspace_id=new.workspace_id and id::text=n->'data'->>'account_id') then raise exception 'O WhatsApp selecionado não pertence à empresa.';end if;
 if n->'data' ? 'texts' and (jsonb_typeof(n->'data'->'texts') is distinct from 'array' or jsonb_array_length(n->'data'->'texts')>30 or exists(select 1 from jsonb_array_elements_text(n->'data'->'texts') t where length(t.value)>500)) then raise exception 'Use até 30 filtros de mensagem com até 500 caracteres cada.';end if;
 if n->'data' ? 'text_mode' and coalesce(n->'data'->>'text_mode','') not in ('any','all','exact','none') then raise exception 'Modo de filtro da mensagem inválido.';end if;
 if n->'data' ? 'message_mode' and coalesce(n->'data'->>'message_mode','') not in ('any','first_contact','first_unanswered') then raise exception 'Modo de disparo da mensagem inválido.';end if;
 if coalesce(n->'data'->>'webhook_id','')<>'' and not agency_private.workspace_webhook_owned(new.workspace_id,(n->'data'->>'webhook_id')::uuid) then raise exception 'Configure um webhook desta empresa.';end if;
 if new.enabled and n->'data'->>'event'='external_webhook' and n->'data'->>'config_version'='2' and coalesce(n->'data'->>'webhook_id','')='' then raise exception 'Gere e configure o webhook antes de ativar o funil.';end if;
 end if;
 if kind in ('team_response','wait_response') then
 if n->'data' ? 'reply_text_mode' and coalesce(n->'data'->>'reply_text_mode','') not in ('any','all','exact','none') then raise exception 'Filtro de resposta inválido.';end if;
 if n->'data' ? 'reply_texts' and (jsonb_typeof(n->'data'->'reply_texts') is distinct from 'array' or jsonb_array_length(n->'data'->'reply_texts')>30) then raise exception 'Use até 30 filtros de resposta.';end if;
 if n->'data' ? 'reply_anchor' and coalesce(n->'data'->>'reply_anchor','') not in ('block_entry','last_incoming','last_outgoing') then raise exception 'Início da contagem inválido.';end if;
 if n->'data' ? 'response_mode' and coalesce(n->'data'->>'response_mode','') not in ('immediate','deadline') then raise exception 'Modo de conferência inválido.';end if;
 if n->'data' ? 'deduplicate' and jsonb_typeof(n->'data'->'deduplicate')<>'boolean' then raise exception 'Configuração de agrupamento inválida.';end if;
 if coalesce(n->'data'->>'account_id','')<>'' and not exists(select 1 from public.agency_workspace_whatsapp_accounts where workspace_id=new.workspace_id and id::text=n->'data'->>'account_id') then raise exception 'O WhatsApp monitorado não pertence à empresa.';end if;
 end if;
 if kind='move_stage' and not exists(select 1 from public.agency_workspace_stages where workspace_id=new.workspace_id and id::text=n->'data'->>'stage_id') then raise exception 'A etapa do bloco não pertence à subconta.';end if;
 if kind='assign_user' and not exists(select 1 from public.agency_workspace_members where workspace_id=new.workspace_id and user_id::text=n->'data'->>'user_id') then raise exception 'O responsável não pertence à subconta.';end if;
 if kind in ('wait','wait_response','team_response','wait_appointment') and (coalesce(n->'data'->>'minutes','')!~'^[0-9]{1,6}$' or (n->'data'->>'minutes')::int not between 1 and 43200) then raise exception 'Informe uma espera entre 1 minuto e 30 dias.';end if;
 if kind in ('notify','send_message','create_task','send_email','send_sms','create_group') and length(trim(coalesce(n->'data'->>'text',''))) not between 1 and 4000 then raise exception 'Preencha o texto do bloco.';end if;
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
 if n->>'type'='split' then if not exists(select 1 from jsonb_array_elements(n->'data'->'branches') b where b->>'id'=e->>'branch') then raise exception 'Escolha um caminho da divisão.';end if;elsif n->>'type' in ('condition','wait_response','team_response') then if coalesce(e->>'branch','') not in ('yes','no') then raise exception 'Escolha Sim ou Não na condição.';end if;else if coalesce(e->>'branch','')<>'' then raise exception 'Somente condições usam ramificações.';end if;end if;
 if (select count(*) from jsonb_array_elements(edges) x where x->>'source'=e->>'source' and coalesce(x->>'branch','')=coalesce(e->>'branch',''))>1 then raise exception 'Cada saída deve apontar para um único bloco.';end if;
 end loop;
 reachable:=array[trigger_id];for count_trigger in 1..40 loop
 select coalesce(array_agg(distinct edge->>'target'),'{}') into next_ids from jsonb_array_elements(edges) edge where edge->>'source'=any(reachable);if next_ids<@reachable then exit;end if;select array_agg(distinct x) into reachable from unnest(reachable||next_ids) x;
 end loop;if not ids<@reachable then raise exception 'Há blocos sem conexão ao gatilho.';end if;
 reachable:=ids;for count_trigger in 1..40 loop
 select coalesce(array_agg(id),'{}') into next_ids from unnest(reachable) id where not exists(select 1 from jsonb_array_elements(edges) edge where edge->>'target'=id and edge->>'source'=any(reachable));
 if cardinality(next_ids)=0 then exit;end if;select coalesce(array_agg(id),'{}') into reachable from unnest(reachable) id where not(id=any(next_ids));
 end loop;if cardinality(reachable)>0 then raise exception 'O fluxo não pode ter ciclos.';end if;

 end if;
 if tg_op='UPDATE' and new.definition is distinct from old.definition then new.version:=old.version+1;end if;return new;
end;$$;

-- Actual first-party click receipts, tied to the same workspace and contact.
alter table public.agency_workspace_tracking_links drop constraint agency_workspace_tracking_links_destination_check;
alter table public.agency_workspace_tracking_links add constraint agency_workspace_tracking_links_destination_check check(destination ~ '^https://[^[:space:]]+$' and length(destination) between 11 and 2008);
alter table public.agency_workspace_tracking_links add column medium text not null default '',add column content text not null default '',add column term text not null default '';
grant insert(medium,content,term),update(medium,content,term) on public.agency_workspace_tracking_links to authenticated;
create table public.agency_workspace_tracking_clicks(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,link_id uuid not null references public.agency_workspace_tracking_links(id) on delete cascade,click_ref text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,16),attributes jsonb not null default '{}',lead_id uuid,created_at timestamptz not null default now(),foreign key(lead_id,workspace_id) references public.agency_workspace_leads(id,workspace_id) on delete set null(lead_id));
create index workspace_tracking_clicks_scope on public.agency_workspace_tracking_clicks(workspace_id,created_at);
create index workspace_tracking_clicks_link on public.agency_workspace_tracking_clicks(link_id);
create index workspace_tracking_clicks_lead on public.agency_workspace_tracking_clicks(lead_id,workspace_id);
alter table public.agency_workspace_tracking_clicks enable row level security;revoke all on public.agency_workspace_tracking_clicks from public,anon,authenticated;grant select on public.agency_workspace_tracking_clicks to authenticated;grant all on public.agency_workspace_tracking_clicks to service_role;
create policy workspace_tracking_clicks_read on public.agency_workspace_tracking_clicks for select to authenticated using(agency_private.workspace_manage(workspace_id));
create function public.agency_workspace_resolve_tracking_link(p_token text,p_attributes jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$declare l public.agency_workspace_tracking_links;c public.agency_workspace_tracking_clicks;attrs jsonb;begin
 select * into l from public.agency_workspace_tracking_links where token=p_token and enabled for update;if l.id is null or not public.agency_workspace_available(l.workspace_id) then return null;end if;
 if jsonb_typeof(p_attributes) is distinct from 'object' or length(p_attributes::text)>6000 then raise exception 'Atribuição inválida.';end if;
 attrs:=p_attributes||jsonb_strip_nulls(jsonb_build_object('utm_source',nullif(l.source,''),'utm_medium',nullif(l.medium,''),'utm_campaign',nullif(l.campaign,''),'utm_content',nullif(l.content,''),'utm_term',nullif(l.term,''),'tracking_link_id',l.id));
 insert into public.agency_workspace_tracking_clicks(workspace_id,link_id,attributes) values(l.workspace_id,l.id,attrs) returning * into c;
 update public.agency_workspace_tracking_links set clicks=clicks+1 where id=l.id;
 return jsonb_build_object('destination',l.destination,'source',l.source,'campaign',l.campaign,'attributes',attrs,'click_id',c.id,'click_ref',c.click_ref);
end;$$;
revoke all on function public.agency_workspace_resolve_tracking_link(text,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_resolve_tracking_link(text,jsonb) to service_role;
create or replace function public.agency_workspace_resolve_link(p_token text) returns jsonb language sql security invoker set search_path='' as $$select public.agency_workspace_resolve_tracking_link(p_token,'{}');$$;
create function agency_private.attach_workspace_click(p_workspace uuid,p_lead uuid,p_attributes jsonb) returns void language plpgsql security invoker set search_path='' as $$declare c public.agency_workspace_tracking_clicks;begin
 if p_lead is null then return;end if;
 select * into c from public.agency_workspace_tracking_clicks where workspace_id=p_workspace and ((coalesce(p_attributes->>'cg_click','')~'^[a-f0-9-]{36}$' and id::text=p_attributes->>'cg_click') or (coalesce(p_attributes->>'cg_ref','')<>'' and click_ref=lower(p_attributes->>'cg_ref'))) for update;
 if c.id is null then update public.agency_workspace_leads set attributes=coalesce(p_attributes,'{}')||attributes where id=p_lead and workspace_id=p_workspace;return;end if;
 update public.agency_workspace_leads set attributes=c.attributes||p_attributes||jsonb_build_object('cg_click',c.id,'tracking_link_id',c.link_id)||attributes where id=p_lead and workspace_id=p_workspace;
 update public.agency_workspace_tracking_clicks set lead_id=coalesce(lead_id,p_lead) where id=c.id;
end;$$;
revoke all on function agency_private.attach_workspace_click(uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function agency_private.attach_workspace_click(uuid,uuid,jsonb) to service_role;
create or replace function public.agency_workspace_submit_form_v2(p_token text,p_request uuid,p_answers jsonb,p_attribution jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$declare result jsonb;r record;begin
 result:=public.agency_workspace_submit_form(p_token,p_request,p_answers);
 select s.workspace_id,s.lead_id into r from public.agency_workspace_form_submissions s join public.agency_workspace_forms f on f.id=s.form_id where f.token=p_token and s.request_id=p_request;
 if r.lead_id is not null then perform agency_private.attach_workspace_click(r.workspace_id,r.lead_id,p_attribution);end if;return result;
end;$$;

create or replace function public.agency_workspace_ingest_message(p_workspace uuid,p_account uuid,p_event jsonb) returns uuid language plpgsql security invoker set search_path='' as $$declare c agency_private.workspace_whatsapp;l uuid;m uuid;first_contact boolean;starts_burst boolean;attrs jsonb;ref text;previous_direction text;begin
 select * into c from agency_private.workspace_whatsapp where workspace_id=p_workspace and enabled and active_account_id=p_account for update;if c.workspace_id is null then raise exception 'Conexão inativa.';end if;
 if not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where w.id=p_workspace and w.status='active') then raise exception 'Subconta indisponível.';end if;
 select id into m from public.agency_workspace_messages where account_id=p_account and provider_id=p_event->>'providerId';if m is not null then return m;end if;
 select direction into previous_direction from public.agency_workspace_messages where account_id=p_account and phone=p_event->>'phone' and created_at<=coalesce((p_event->>'createdAt')::timestamptz,now()) order by created_at desc limit 1;starts_burst:=(p_event->>'direction'='entrada' and (previous_direction is null or previous_direction='saida'));
 first_contact:=not exists(select 1 from public.agency_workspace_messages where account_id=p_account and phone=p_event->>'phone');
 if not coalesce((p_event->>'isGroup')::boolean,false) then l:=agency_private.capture_contact(p_workspace,c.pipeline_id,c.stage_id,coalesce(nullif(p_event->>'contactName',''),p_event->>'phone'),p_event->>'phone','','whatsapp',p_event->>'providerId');end if;
 attrs:=coalesce(p_event->'attribution','{}');ref:=(regexp_match(coalesce(p_event->>'body',''),'(?i)CG-([a-f0-9]{16})'))[1];if ref is not null then attrs:=attrs||jsonb_build_object('cg_ref',lower(ref));end if;
 if l is not null then perform agency_private.attach_workspace_click(p_workspace,l,attrs);select attributes into attrs from public.agency_workspace_leads where id=l and workspace_id=p_workspace;end if;
 insert into public.agency_workspace_messages(workspace_id,account_id,provider_id,phone,contact_name,is_group,sender_name,direction,body,kind,lead_id,created_at) values(p_workspace,p_account,p_event->>'providerId',p_event->>'phone',p_event->>'contactName',coalesce((p_event->>'isGroup')::boolean,false),p_event->>'senderName',p_event->>'direction',p_event->>'body',coalesce(p_event->>'kind','texto'),l,coalesce((p_event->>'createdAt')::timestamptz,now())) returning id into m;
 perform agency_private.emit_workspace_event(p_workspace,'message_received',l,p_event->>'providerId',jsonb_build_object('message',case when p_event->>'body' in ('[imagem]','[audio]','[video]','[documento]') then '' else p_event->>'body' end,'direction',p_event->>'direction','first_contact',first_contact,'starts_burst',starts_burst,'account_id',p_account,'phone',p_event->>'phone','message_at',coalesce(p_event->>'createdAt',now()::text),'message_id',m,'attribution',attrs));return m;
end;$$;

create or replace function public.agency_workspace_meta_lead(p_workspace uuid,p_provider text,p_contact jsonb,p_stage uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare stage public.agency_workspace_stages;l uuid;begin
 perform 1 from public.agency_client_workspaces where id=p_workspace for update;
 if exists(select 1 from agency_private.workspace_meta_receipts where workspace_id=p_workspace and provider_id=p_provider) then return null;end if;
 select * into stage from public.agency_workspace_stages where workspace_id=p_workspace and id=p_stage;if stage.id is null then raise exception 'Configure a etapa de entrada do Meta Ads.';end if;
 l:=agency_private.capture_contact(p_workspace,stage.pipeline_id,stage.id,p_contact->>'name',p_contact->>'phone',p_contact->>'email','meta',p_provider);
 insert into agency_private.workspace_meta_receipts(workspace_id,provider_id) values(p_workspace,p_provider);
 update public.agency_workspace_leads set attributes=jsonb_build_object('meta_lead_id',p_provider,'utm_source','meta')||attributes where id=l;
 perform agency_private.emit_workspace_event(p_workspace,'meta_lead',l,p_provider,jsonb_build_object('provider_id',p_provider,'form_id',p_contact->>'meta_form_id','page_id',p_contact->>'meta_page_id'));return l;
end;$$;

create table agency_private.workspace_reply_watches(workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,flow_id uuid not null references public.agency_workspace_flows(id) on delete cascade,node_id text not null,account_id uuid not null references public.agency_workspace_whatsapp_accounts(id) on delete cascade,contact_key text not null,run_id uuid not null references public.agency_workspace_flow_runs(id) on delete cascade,anchor_at timestamptz not null,created_at timestamptz not null default now(),primary key(workspace_id,flow_id,node_id,account_id,contact_key));
create index workspace_reply_watches_run on agency_private.workspace_reply_watches(run_id);
alter table agency_private.workspace_reply_watches enable row level security;revoke all on agency_private.workspace_reply_watches from public,anon,authenticated;grant all on agency_private.workspace_reply_watches to service_role;

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
 select * into booking from public.agency_workspace_appointments a where a.workspace_id=r.workspace_id and a.lead_id=lead.id and a.status='confirmed' and a.starts_at>now() order by case when a.id::text=ev.payload->>'appointment_id' then 0 else 1 end,a.starts_at limit 1;
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
 node_payload:=coalesce(n->'data','{}')||jsonb_build_object('lead_id',lead.id,'name',lead.name,'phone',lead.phone,'email',lead.email,'text',body,'attributes',lead.attributes,'value',lead.value,'group_id',r.context->>'group_id');
 if action='send_email' then node_payload:=node_payload||jsonb_build_object('subject',agency_private.workflow_template(n->'data'->>'subject',lead));end if;
 if action='send_event' then select * into booking from public.agency_workspace_appointments a where a.workspace_id=r.workspace_id and a.lead_id=lead.id and a.status='confirmed' and a.starts_at>now() order by a.starts_at limit 1;if booking.id is null then raise exception 'Nenhuma reunião confirmada para enviar.';end if;node_payload:=node_payload||jsonb_build_object('starts_at',booking.starts_at,'ends_at',booking.ends_at);end if;
 insert into public.agency_workspace_action_outbox(workspace_id,run_id,node_id,action,payload) values(r.workspace_id,r.id,r.cursor,action,node_payload) on conflict(run_id,node_id) do nothing;
 elsif action='add_tags' then select array_agg(distinct trim(t)) into tag_values from unnest(lead.tags||array(select jsonb_array_elements_text(n->'data'->'tags'))) t;update public.agency_workspace_leads set tags=coalesce(tag_values,'{}') where id=lead.id;
 elsif action='remove_tags' then update public.agency_workspace_leads set tags=array(select t from unnest(tags) t where not(n->'data'->'tags' ? t)) where id=lead.id;
 elsif action='move_stage' then select * into target from public.agency_workspace_stages where id::text=n->'data'->>'stage_id' and workspace_id=r.workspace_id;if target.id is null then raise exception 'Etapa de destino não encontrada.';end if;update public.agency_workspace_leads set stage_id=target.id,pipeline_id=target.pipeline_id where id=lead.id and stage_id<>target.id;
 elsif action='assign_user' then update public.agency_workspace_leads set assignee_user_id=(n->'data'->>'user_id')::uuid where id=lead.id;
 elsif action='create_task' then insert into public.agency_workspace_tasks(workspace_id,lead_id,title,due_at,origin_run,origin_node) values(r.workspace_id,lead.id,left(body,200),now()+make_interval(mins=>greatest(0,least(coalesce((n->'data'->>'due_minutes')::int,1440),43200))),r.id,r.cursor) on conflict(origin_run,origin_node) do nothing;
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

create or replace function public.agency_workspace_finish_message(p_id uuid,p_status text,p_provider text default null) returns void language plpgsql security invoker set search_path='' as $$declare m public.agency_workspace_message_outbox;c agency_private.workspace_whatsapp;first_contact boolean;begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'Status inválido.';end if;
 select * into m from public.agency_workspace_message_outbox where id=p_id and status='sending' for update;if m.id is null then return;end if;
 if p_status='sent' and coalesce(p_provider,'')='' then raise exception 'Confirmação ausente.';end if;
 if p_status='sent' then
 select * into c from agency_private.workspace_whatsapp where workspace_id=m.workspace_id;
 if m.lead_id is null and m.phone not like '%@g.us' then m.lead_id:=agency_private.capture_contact(m.workspace_id,c.pipeline_id,c.stage_id,m.phone,m.phone,'','whatsapp',p_provider);end if;
 first_contact:=not exists(select 1 from public.agency_workspace_messages where account_id=m.account_id and phone=m.phone);
 perform agency_private.emit_workspace_event(m.workspace_id,'message_received',m.lead_id,p_provider,jsonb_build_object('message',m.body,'direction','saida','first_contact',first_contact,'account_id',m.account_id,'phone',m.phone,'message_at',now(),'attribution',coalesce((select attributes from public.agency_workspace_leads where id=m.lead_id and workspace_id=m.workspace_id),'{}')));
 insert into public.agency_workspace_messages(workspace_id,account_id,provider_id,phone,direction,body,lead_id,is_group,media_path) values(m.workspace_id,m.account_id,p_provider,m.phone,'saida',m.body,m.lead_id,m.phone like '%@g.us',m.media_path) on conflict(account_id,provider_id) do nothing;end if;
 update public.agency_workspace_message_outbox set status=p_status,provider_id=p_provider,error=case when p_status='failed' then 'O provedor recusou o envio.' when p_status='uncertain' then 'Envio não confirmado. Confira o WhatsApp antes de reenviar.' else null end,updated_at=now() where id=m.id;
 if m.run_id is not null then update public.agency_workspace_flow_steps set status=case when p_status='sent' then 'completed' else 'failed' end,detail=case when p_status='sent' then null else 'Envio não confirmado pelo provedor.' end where run_id=m.run_id and node_id=m.node_id;
 update public.agency_workspace_flow_runs set status=case when p_status='sent' then 'queued' else 'failed' end,next_run_at=now(),error=case when p_status='sent' then null else 'Confira o envio da mensagem no WhatsApp.' end where id=m.run_id and status='waiting';end if;
end;$$;

create index workspace_messages_response_watch on public.agency_workspace_messages(workspace_id,account_id,agency_private.contact_key(phone,''),created_at);
