-- Additive release: extend only pilot workspace automations, integration settings and attribution.
alter table public.agency_workspace_leads add column attributes jsonb not null default '{}';
alter table public.agency_workspace_flow_runs add column context jsonb not null default '{}';
create table agency_private.workspace_providers(workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,kind text not null check(kind in ('meta','google_ads','email','sms')),enabled boolean not null default false,credentials jsonb not null default '{}',worker_secret text not null default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),primary key(workspace_id,kind),unique(worker_secret));
alter table agency_private.workspace_providers enable row level security;revoke all on agency_private.workspace_providers from public,anon,authenticated;grant all on agency_private.workspace_providers to service_role;
create table public.agency_workspace_action_outbox(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,run_id uuid references public.agency_workspace_flow_runs(id) on delete cascade,node_id text,event_id uuid references public.agency_workspace_events(id) on delete cascade,rule_id uuid,action text not null,payload jsonb not null,status text not null default 'queued' check(status in ('queued','sending','sent','failed','uncertain','cancelled')),error text,provider_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(run_id,node_id),unique(event_id,rule_id));
create index workspace_actions_queue on public.agency_workspace_action_outbox(workspace_id,status,created_at);
create index workspace_actions_run on public.agency_workspace_action_outbox(run_id);
create index workspace_actions_event on public.agency_workspace_action_outbox(event_id);
alter table public.agency_workspace_stages add constraint workspace_stage_identity unique(id,workspace_id);
create table public.agency_workspace_conversion_rules(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 160),provider text not null check(provider in ('meta','google_ads')),event_name text not null default 'Lead' check(event_name~'^[A-Za-z][A-Za-z0-9_]{0,59}$'),trigger_type text not null check(trigger_type in ('stage_changed','message_received')),stage_id uuid,phrase text not null default '' check(length(phrase)<=500),direction text not null default 'incoming' check(direction in ('incoming','outgoing','both')),value numeric(14,2) not null default 0 check(value>=0),enabled boolean not null default false,created_at timestamptz not null default now(),foreign key(stage_id,workspace_id) references public.agency_workspace_stages(id,workspace_id));
-- stage/workspace identity for tracking rules uses an independent scope key.
alter table public.agency_workspace_action_outbox add foreign key(rule_id) references public.agency_workspace_conversion_rules(id) on delete set null;
alter table public.agency_workspace_action_outbox enable row level security;revoke all on public.agency_workspace_action_outbox from public,anon,authenticated;grant select on public.agency_workspace_action_outbox to authenticated;grant all on public.agency_workspace_action_outbox to service_role;
create policy workspace_actions_read on public.agency_workspace_action_outbox for select to authenticated using(agency_private.workspace_access(workspace_id));
alter table public.agency_workspace_conversion_rules enable row level security;revoke all on public.agency_workspace_conversion_rules from public,anon;grant select,insert,update,delete on public.agency_workspace_conversion_rules to authenticated,service_role;
create policy workspace_conversion_rules_read on public.agency_workspace_conversion_rules for select to authenticated using(agency_private.workspace_access(workspace_id));
create policy workspace_conversion_rules_manage on public.agency_workspace_conversion_rules for all to authenticated using(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true));
create trigger workspace_conversion_identity before update on public.agency_workspace_conversion_rules for each row execute function agency_private.commercial_scope_guard();
create function public.agency_workspace_provider(p_workspace uuid,p_kind text,p_values jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;begin
 if p_values is not null then insert into agency_private.workspace_providers(workspace_id,kind,enabled,credentials) values(p_workspace,p_kind,coalesce((p_values->>'enabled')::boolean,false),coalesce(p_values->'credentials','{}')) on conflict(workspace_id,kind) do update set enabled=excluded.enabled,credentials=workspace_providers.credentials||excluded.credentials;end if;
 select to_jsonb(c) into r from agency_private.workspace_providers c where workspace_id=p_workspace and kind=p_kind;return r;
end;$$;
revoke all on function public.agency_workspace_provider(uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_provider(uuid,text,jsonb) to service_role;
create function public.agency_workspace_provider_worker(p_secret text) returns uuid language sql security invoker set search_path='' as $$select workspace_id from agency_private.workspace_providers where worker_secret=p_secret and enabled;$$;
revoke all on function public.agency_workspace_provider_worker(text) from public,anon,authenticated;grant execute on function public.agency_workspace_provider_worker(text) to service_role;
create function public.agency_workspace_claim_action(p_workspace uuid) returns jsonb language plpgsql security invoker set search_path='' as $$declare a public.agency_workspace_action_outbox;begin
 update public.agency_workspace_action_outbox set status='uncertain',error='A confirmação do provedor não chegou. Confira antes de repetir.',updated_at=now() where workspace_id=p_workspace and status='sending' and updated_at<now()-interval '2 minutes';
 select o.* into a from public.agency_workspace_action_outbox o join public.agency_client_workspaces w on w.id=o.workspace_id and w.status='active' join agency_private.pilot_accounts p on p.user_id=w.owner_user_id and p.enabled where o.workspace_id=p_workspace and o.status='queued' and (o.run_id is null or exists(select 1 from public.agency_workspace_flow_runs r join public.agency_workspace_flows f on f.id=r.flow_id and f.enabled where r.id=o.run_id and r.status='waiting')) order by o.created_at limit 1 for update of o skip locked;
 if a.id is null then return null;end if;update public.agency_workspace_action_outbox set status='sending',updated_at=now() where id=a.id;return to_jsonb(a);
end;$$;
revoke all on function public.agency_workspace_claim_action(uuid) from public,anon,authenticated;grant execute on function public.agency_workspace_claim_action(uuid) to service_role;
create function public.agency_workspace_finish_action(p_id uuid,p_status text,p_provider text default null,p_result jsonb default '{}') returns void language plpgsql security invoker set search_path='' as $$declare a public.agency_workspace_action_outbox;begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'Status inválido.';end if;select * into a from public.agency_workspace_action_outbox where id=p_id and status='sending' for update;if a.id is null then return;end if;
 update public.agency_workspace_action_outbox set status=p_status,provider_id=left(p_provider,200),error=case when p_status='sent' then null else left(coalesce(p_result->>'error','Ação não confirmada pelo provedor.'),300) end,updated_at=now() where id=a.id;
 if a.run_id is not null then
 if a.action='create_group' and p_status='sent' and p_result->>'group_id'~'^[0-9-]+@g[.]us$' then update public.agency_workspace_flow_runs set context=context||jsonb_build_object('group_id',p_result->>'group_id') where id=a.run_id;end if;
 update public.agency_workspace_flow_steps set status=case when p_status='sent' then 'completed' else 'failed' end,detail=case when p_status='sent' then null else 'Confira o histórico de integrações.' end where run_id=a.run_id and node_id=a.node_id;
 update public.agency_workspace_flow_runs set status=case when p_status='sent' then 'queued' else 'failed' end,next_run_at=now(),error=case when p_status='sent' then null else 'Ação externa não confirmada. Confira o histórico.' end where id=a.run_id and status='waiting';end if;
end;$$;
revoke all on function public.agency_workspace_finish_action(uuid,text,text,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_finish_action(uuid,text,text,jsonb) to service_role;
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
create or replace function agency_private.process_workspace_flows(p_workspace uuid default null,p_limit integer default 10) returns integer language plpgsql security definer set search_path='' as $$ declare r public.agency_workspace_flow_runs;ev public.agency_workspace_events;lead public.agency_workspace_leads;n jsonb;next_node text;branch text;action text;body text;target public.agency_workspace_stages;tag_values text[];processed integer:=0;steps integer;resume_at timestamptz;booking public.agency_workspace_appointments;local_time timestamp;offset_day integer;chosen uuid;node_payload jsonb;begin
 for r in select run.* from public.agency_workspace_flow_runs run join public.agency_workspace_flows f on f.id=run.flow_id and f.enabled join public.agency_client_workspaces w on w.id=run.workspace_id and w.status='active' join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where run.status in ('queued','waiting') and run.next_run_at<=now() and (p_workspace is null or run.workspace_id=p_workspace) order by run.next_run_at,run.created_at limit greatest(1,least(p_limit,30)) for update of run skip locked loop
 select * into ev from public.agency_workspace_events where id=r.event_id;perform set_config('agency.workflow_run',r.id::text,true);update public.agency_workspace_flow_runs set status='running',error=null where id=r.id;update public.agency_workspace_flow_steps step set status='completed' where step.run_id=r.id and step.action in ('wait','wait_appointment','business_hours') and step.status='waiting';steps:=0;
 loop
 if r.cursor is null then update public.agency_workspace_flow_runs set status='completed',finished_at=now() where id=r.id;exit;end if;
 select value into n from jsonb_array_elements(r.definition->'nodes') where value->>'id'=r.cursor;action:=n->>'type';if action is null or steps>=40 then update public.agency_workspace_flow_runs set status='failed',error='Bloco inválido ou limite de execução atingido.',finished_at=now() where id=r.id;exit;end if;steps:=steps+1;
 select * into lead from public.agency_workspace_leads where id=ev.lead_id and workspace_id=r.workspace_id;branch:=null;
 begin
 if action in ('wait_response','team_response') then
 if coalesce(r.context->>'wait_node','')<>r.cursor then
 r.context:=r.context||jsonb_build_object('wait_node',r.cursor,'wait_started',now(),'wait_until',now()+make_interval(mins=>(n->'data'->>'minutes')::int));
 update public.agency_workspace_flow_runs set context=r.context,status='waiting',next_run_at=now()+interval '1 minute' where id=r.id;
 insert into public.agency_workspace_flow_steps(run_id,node_id,workspace_id,action,status) values(r.id,r.cursor,r.workspace_id,action,'waiting') on conflict(run_id,node_id) do nothing;exit;
 end if;
 if exists(select 1 from public.agency_workspace_messages m join agency_private.workspace_whatsapp c on c.workspace_id=m.workspace_id and c.enabled and c.active_account_id=m.account_id where m.workspace_id=r.workspace_id and agency_private.contact_key(m.phone,'')=agency_private.contact_key(lead.phone,'') and m.created_at>=(r.context->>'wait_started')::timestamptz and m.direction=case when action='wait_response' then 'entrada' else 'saida' end) then branch:='yes';
 elsif now()>=(r.context->>'wait_until')::timestamptz then branch:='no';
 else update public.agency_workspace_flow_runs set status='waiting',next_run_at=least(now()+interval '1 minute',(r.context->>'wait_until')::timestamptz) where id=r.id;exit;end if;
 r.context:=r.context-array['wait_node','wait_started','wait_until'];update public.agency_workspace_flow_runs set context=r.context where id=r.id;
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
create function agency_private.wake_workspace_flow() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.agency_workspace_flow_runs r set next_run_at=now() from public.agency_workspace_events e where e.id=r.event_id and e.lead_id=new.lead_id and r.workspace_id=new.workspace_id and r.status='waiting' and r.context ? 'wait_node';return new;
end;$$;
revoke all on function agency_private.wake_workspace_flow() from public,anon,authenticated;
create trigger workspace_flow_message_wake after insert on public.agency_workspace_messages for each row execute function agency_private.wake_workspace_flow();
create function agency_private.cancel_external_workspace_actions() returns trigger language plpgsql security definer set search_path='' as $$begin if new.status='cancelled' then update public.agency_workspace_action_outbox set status='cancelled',updated_at=now() where run_id=new.id and status='queued';end if;return new;end;$$;
revoke all on function agency_private.cancel_external_workspace_actions() from public,anon,authenticated;
create trigger workspace_external_cancel after update of status on public.agency_workspace_flow_runs for each row execute function agency_private.cancel_external_workspace_actions();
create function agency_private.queue_workspace_conversion() returns trigger language plpgsql security definer set search_path='' as $$declare rule public.agency_workspace_conversion_rules;l public.agency_workspace_leads;begin
 if new.lead_id is null then return new;end if;select * into l from public.agency_workspace_leads where id=new.lead_id and workspace_id=new.workspace_id;
 for rule in select * from public.agency_workspace_conversion_rules where workspace_id=new.workspace_id and enabled and trigger_type=new.event_type loop
 if new.event_type='stage_changed' and rule.stage_id is distinct from l.stage_id then continue;end if;
 if new.event_type='message_received' and (rule.phrase='' or position(lower(rule.phrase) in lower(coalesce(new.payload->>'message','')))=0 or rule.direction<>'both' and rule.direction<>(case when new.payload->>'direction'='entrada' then 'incoming' else 'outgoing' end)) then continue;end if;
 insert into public.agency_workspace_action_outbox(workspace_id,event_id,rule_id,action,payload) values(new.workspace_id,new.id,rule.id,case when rule.provider='meta' then 'meta_event' else 'google_conversion' end,jsonb_build_object('event_name',rule.event_name,'lead_id',l.id,'phone',l.phone,'email',l.email,'attributes',l.attributes,'value',case when rule.value>0 then rule.value else l.value end)) on conflict(event_id,rule_id) do nothing;
 end loop;return new;
end;$$;
revoke all on function agency_private.queue_workspace_conversion() from public,anon,authenticated;
create trigger workspace_conversion_queue after insert on public.agency_workspace_events for each row execute function agency_private.queue_workspace_conversion();
create function public.agency_workspace_submit_form_v2(p_token text,p_request uuid,p_answers jsonb,p_attribution jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$declare result jsonb;begin
 result:=public.agency_workspace_submit_form(p_token,p_request,p_answers);
 update public.agency_workspace_leads l set attributes=p_attribution||l.attributes from public.agency_workspace_form_submissions s join public.agency_workspace_forms f on f.id=s.form_id where f.token=p_token and s.request_id=p_request and l.id=s.lead_id and l.workspace_id=f.workspace_id;return result;
end;$$;
revoke all on function public.agency_workspace_submit_form_v2(text,uuid,jsonb,jsonb) from public,anon,authenticated;grant execute on function public.agency_workspace_submit_form_v2(text,uuid,jsonb,jsonb) to service_role;
-- Bind external WhatsApp actions to the selected phone before any provider call.
create function agency_private.bind_workspace_action() returns trigger language plpgsql security definer set search_path='' as $$declare account uuid;begin
 if new.action in ('create_group','add_participants','send_event') then
 select active_account_id into account from agency_private.workspace_whatsapp where workspace_id=new.workspace_id and enabled;if account is null then raise exception 'Conecte o WhatsApp da empresa antes de ativar esta ação.';end if;new.payload:=new.payload||jsonb_build_object('account_id',account);end if;return new;
end;$$;
revoke all on function agency_private.bind_workspace_action() from public,anon,authenticated;
create trigger workspace_action_account before insert on public.agency_workspace_action_outbox for each row execute function agency_private.bind_workspace_action();
alter table public.agency_workspace_message_outbox add column media_path text;
alter table public.agency_workspace_messages add column media_path text;
do $$begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit) values('workspace-automation-assets','workspace-automation-assets',false,16777216) on conflict(id) do nothing;
end if;end$$;
create table agency_private.workspace_meta_receipts(workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,provider_id text not null,created_at timestamptz not null default now(),primary key(workspace_id,provider_id));
alter table agency_private.workspace_meta_receipts enable row level security;revoke all on agency_private.workspace_meta_receipts from public,anon,authenticated;grant all on agency_private.workspace_meta_receipts to service_role;
create function public.agency_workspace_meta_lead(p_workspace uuid,p_provider text,p_contact jsonb,p_stage uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare stage public.agency_workspace_stages;l uuid;begin
 perform 1 from public.agency_client_workspaces where id=p_workspace for update;
 if exists(select 1 from agency_private.workspace_meta_receipts where workspace_id=p_workspace and provider_id=p_provider) then return null;end if;
 select * into stage from public.agency_workspace_stages where workspace_id=p_workspace and id=p_stage;if stage.id is null then raise exception 'Configure a etapa de entrada do Meta Ads.';end if;
 l:=agency_private.capture_contact(p_workspace,stage.pipeline_id,stage.id,p_contact->>'name',p_contact->>'phone',p_contact->>'email','meta',p_provider);
 insert into agency_private.workspace_meta_receipts(workspace_id,provider_id) values(p_workspace,p_provider);
 update public.agency_workspace_leads set attributes=jsonb_build_object('meta_lead_id',p_provider,'utm_source','meta')||attributes where id=l;
 perform agency_private.emit_workspace_event(p_workspace,'meta_lead',l,p_provider,jsonb_build_object('provider_id',p_provider));return l;
end;$$;
revoke all on function public.agency_workspace_meta_lead(uuid,text,jsonb,uuid) from public,anon,authenticated;grant execute on function public.agency_workspace_meta_lead(uuid,text,jsonb,uuid) to service_role;
create table public.agency_workspace_tracking_links(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 160),destination text not null check(destination~'^https://[^[:space:]]{3,2000}$'),source text not null default '',campaign text not null default '',token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),clicks bigint not null default 0,enabled boolean not null default true,created_at timestamptz not null default now());
create index workspace_tracking_links_scope on public.agency_workspace_tracking_links(workspace_id);
alter table public.agency_workspace_tracking_links enable row level security;revoke all on public.agency_workspace_tracking_links from public,anon,authenticated;grant select,delete on public.agency_workspace_tracking_links to authenticated;grant insert(workspace_id,name,destination,source,campaign,enabled) on public.agency_workspace_tracking_links to authenticated;grant update(name,destination,source,campaign,enabled) on public.agency_workspace_tracking_links to authenticated;grant all on public.agency_workspace_tracking_links to service_role;
create policy workspace_links_read on public.agency_workspace_tracking_links for select to authenticated using(agency_private.workspace_access(workspace_id));
create policy workspace_links_manage on public.agency_workspace_tracking_links for all to authenticated using(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_manage(workspace_id) and agency_private.workspace_access(workspace_id,true));
create trigger workspace_links_identity before update on public.agency_workspace_tracking_links for each row execute function agency_private.commercial_scope_guard();
create function public.agency_workspace_resolve_link(p_token text) returns jsonb language plpgsql security invoker set search_path='' as $$declare r public.agency_workspace_tracking_links;begin
 update public.agency_workspace_tracking_links l set clicks=clicks+1 where token=p_token and enabled and exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts p on p.user_id=w.owner_user_id and p.enabled where w.id=l.workspace_id and w.status='active') returning l.* into r;
 if r.id is null then return null;end if;return jsonb_build_object('destination',r.destination,'source',r.source,'campaign',r.campaign);
end;$$;
revoke all on function public.agency_workspace_resolve_link(text) from public,anon,authenticated;grant execute on function public.agency_workspace_resolve_link(text) to service_role;

create or replace function public.agency_workspace_finish_message(p_id uuid,p_status text,p_provider text default null) returns void language plpgsql security invoker set search_path='' as $$declare m public.agency_workspace_message_outbox;c agency_private.workspace_whatsapp;first_contact boolean;begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'Status inválido.';end if;
 select * into m from public.agency_workspace_message_outbox where id=p_id and status='sending' for update;if m.id is null then return;end if;
 if p_status='sent' and coalesce(p_provider,'')='' then raise exception 'Confirmação ausente.';end if;
 if p_status='sent' then
 select * into c from agency_private.workspace_whatsapp where workspace_id=m.workspace_id;
 if m.lead_id is null and m.phone not like '%@g.us' then m.lead_id:=agency_private.capture_contact(m.workspace_id,c.pipeline_id,c.stage_id,m.phone,m.phone,'','whatsapp',p_provider);end if;
 first_contact:=not exists(select 1 from public.agency_workspace_messages where account_id=m.account_id and phone=m.phone);
 perform agency_private.emit_workspace_event(m.workspace_id,'message_received',m.lead_id,p_provider,jsonb_build_object('message',m.body,'direction','saida','first_contact',first_contact));
 insert into public.agency_workspace_messages(workspace_id,account_id,provider_id,phone,direction,body,lead_id,is_group,media_path) values(m.workspace_id,m.account_id,p_provider,m.phone,'saida',m.body,m.lead_id,m.phone like '%@g.us',m.media_path) on conflict(account_id,provider_id) do nothing;end if;
 update public.agency_workspace_message_outbox set status=p_status,provider_id=p_provider,error=case when p_status='failed' then 'O provedor recusou o envio.' when p_status='uncertain' then 'Envio não confirmado. Confira o WhatsApp antes de reenviar.' else null end,updated_at=now() where id=m.id;
 if m.run_id is not null then update public.agency_workspace_flow_steps set status=case when p_status='sent' then 'completed' else 'failed' end,detail=case when p_status='sent' then null else 'Envio não confirmado pelo provedor.' end where run_id=m.run_id and node_id=m.node_id;
 update public.agency_workspace_flow_runs set status=case when p_status='sent' then 'queued' else 'failed' end,next_run_at=now(),error=case when p_status='sent' then null else 'Confira o envio da mensagem no WhatsApp.' end where id=m.run_id and status='waiting';end if;
end;$$;
