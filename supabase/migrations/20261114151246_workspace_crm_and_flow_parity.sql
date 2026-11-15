-- Additive pilot-only CRM history, pipeline defaults, folders and richer conditions.
-- Production read-only evidence: one agency_client_workspaces row, owned by the
-- one enabled private pilot; zero workspaces outside that scope. The legacy
-- clients/agency_whatsapp_connections tables are not targets of this migration.
-- validate_workspace_flow is bound only to agency_workspace_flows; its condition
-- evaluator is called only by process_workspace_flows (the pilot worker).
do $$begin
 if exists(select 1 from public.agency_client_workspaces w where not exists(select 1 from agency_private.pilot_accounts p where p.user_id=w.owner_user_id and p.enabled)) then
 raise exception 'Migration restrita ao piloto: existem subcontas fora do escopo autorizado.';end if;
end;$$;
alter table public.agency_workspace_pipelines add column is_default boolean not null default false;
alter table public.agency_workspace_pipelines add column archived boolean not null default false;
update public.agency_workspace_pipelines p set is_default=true where p.id in (select distinct on(workspace_id) id from public.agency_workspace_pipelines order by workspace_id,created_at,id) and exists(select 1 from agency_private.pilot_accounts a join public.agency_client_workspaces w on w.owner_user_id=a.user_id where w.id=p.workspace_id and a.enabled);
create unique index workspace_default_pipeline on public.agency_workspace_pipelines(workspace_id) where is_default;
alter table public.agency_workspace_pipelines add constraint workspace_default_active check(not(is_default and archived));
create function public.agency_workspace_default_pipeline(p_workspace uuid,p_pipeline uuid) returns void language plpgsql security invoker set search_path='' as $$begin
 if not agency_private.workspace_permission(p_workspace,'crm','manage') or not agency_private.workspace_access(p_workspace,true) then raise exception 'Sem permissão nesta subconta.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,912));
 if not exists(select 1 from public.agency_workspace_pipelines where id=p_pipeline and workspace_id=p_workspace and not archived) then raise exception 'Escolha uma pipeline ativa desta subconta.';end if;
 update public.agency_workspace_pipelines set is_default=false where workspace_id=p_workspace and is_default;
 update public.agency_workspace_pipelines set is_default=true where workspace_id=p_workspace and id=p_pipeline;
end;$$;
revoke all on function public.agency_workspace_default_pipeline(uuid,uuid) from public,anon;
grant execute on function public.agency_workspace_default_pipeline(uuid,uuid) to authenticated;

create table public.agency_workspace_crm_history(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,
 lead_id uuid not null, actor_id uuid, before_data jsonb not null, after_data jsonb not null,
 created_at timestamptz not null default now(),undone_at timestamptz
);
create index workspace_crm_history_scope on public.agency_workspace_crm_history(workspace_id,created_at desc);
create index workspace_crm_history_lead on public.agency_workspace_crm_history(workspace_id,lead_id);
alter table public.agency_workspace_crm_history enable row level security;
revoke all on public.agency_workspace_crm_history from public,anon,authenticated;
grant select on public.agency_workspace_crm_history to authenticated;
grant all on public.agency_workspace_crm_history to service_role;
create policy workspace_history_read on public.agency_workspace_crm_history for select to authenticated using(agency_private.workspace_permission(workspace_id,'crm','read'));
create function agency_private.workspace_lead_snapshot(p_lead public.agency_workspace_leads) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('name',p_lead.name,'phone',p_lead.phone,'email',p_lead.email,'value',p_lead.value,'notes',p_lead.notes,'pipeline_id',p_lead.pipeline_id,'stage_id',p_lead.stage_id,'tags',p_lead.tags,'assignee_user_id',p_lead.assignee_user_id,'source_type',p_lead.source_type);$$;
revoke all on function agency_private.workspace_lead_snapshot(public.agency_workspace_leads) from public,anon,authenticated;
-- Private trigger needs to write append-only audit records for both users and workers.
create function agency_private.workspace_audit_lead() returns trigger language plpgsql security definer set search_path='' as $$declare b jsonb;a jsonb;begin
 if not exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts p on p.user_id=w.owner_user_id and p.enabled where w.id=new.workspace_id and w.status='active') then return new;end if;
 b:=agency_private.workspace_lead_snapshot(old);a:=agency_private.workspace_lead_snapshot(new);
 if b is distinct from a then insert into public.agency_workspace_crm_history(workspace_id,lead_id,actor_id,before_data,after_data) values(new.workspace_id,new.id,auth.uid(),b,a);end if;return new;end;$$;
revoke all on function agency_private.workspace_audit_lead() from public,anon,authenticated;
create trigger workspace_lead_history after update on public.agency_workspace_leads for each row execute function agency_private.workspace_audit_lead();
-- Private privileged helper: authenticated caller, live membership, CRM write, conflict check.
create function agency_private.workspace_undo_lead(p_workspace uuid,p_history uuid) returns void language plpgsql security definer set search_path='' as $$declare h public.agency_workspace_crm_history;l public.agency_workspace_leads;begin
 if auth.uid() is null or not agency_private.workspace_permission(p_workspace,'crm','write') or not agency_private.workspace_access(p_workspace,true) then raise exception 'Sem permissão nesta subconta.' using errcode='42501';end if;
 select * into h from public.agency_workspace_crm_history where id=p_history and workspace_id=p_workspace for update;
 if h.id is null or h.undone_at is not null then raise exception 'Alteração não disponível para desfazer.';end if;
 select * into l from public.agency_workspace_leads where id=h.lead_id and workspace_id=p_workspace for update;
 if l.id is null or agency_private.workspace_lead_snapshot(l) is distinct from h.after_data then raise exception 'O lead mudou depois desta alteração. Revise a ficha antes de desfazer.';end if;
 update public.agency_workspace_leads set name=h.before_data->>'name',phone=h.before_data->>'phone',email=h.before_data->>'email',value=(h.before_data->>'value')::numeric,notes=h.before_data->>'notes',pipeline_id=(h.before_data->>'pipeline_id')::uuid,stage_id=(h.before_data->>'stage_id')::uuid,tags=array(select jsonb_array_elements_text(h.before_data->'tags')),assignee_user_id=nullif(h.before_data->>'assignee_user_id','')::uuid,source_type=h.before_data->>'source_type' where id=l.id and workspace_id=p_workspace;
 update public.agency_workspace_crm_history set undone_at=now() where id=h.id;
end;$$;
revoke all on function agency_private.workspace_undo_lead(uuid,uuid) from public,anon;
grant execute on function agency_private.workspace_undo_lead(uuid,uuid) to authenticated;
create function public.agency_workspace_undo_lead(p_workspace uuid,p_history uuid) returns void language sql security invoker set search_path='' as $$select agency_private.workspace_undo_lead(p_workspace,p_history);$$;
revoke all on function public.agency_workspace_undo_lead(uuid,uuid) from public,anon;
grant execute on function public.agency_workspace_undo_lead(uuid,uuid) to authenticated;

create table public.agency_workspace_form_folders(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 120),unique(id,workspace_id),unique(workspace_id,name));
alter table public.agency_workspace_form_folders enable row level security;
revoke all on public.agency_workspace_form_folders from public,anon;
grant select,insert,update,delete on public.agency_workspace_form_folders to authenticated,service_role;
create policy workspace_form_folders_read on public.agency_workspace_form_folders for select to authenticated using(agency_private.workspace_permission(workspace_id,'forms','read'));
create policy workspace_form_folders_write on public.agency_workspace_form_folders for all to authenticated using(agency_private.workspace_permission(workspace_id,'forms','manage') and agency_private.workspace_access(workspace_id,true)) with check(agency_private.workspace_permission(workspace_id,'forms','manage') and agency_private.workspace_access(workspace_id,true));
alter table public.agency_workspace_forms add column folder_id uuid;
alter table public.agency_workspace_forms add constraint workspace_form_folder foreign key(folder_id,workspace_id) references public.agency_workspace_form_folders(id,workspace_id);
create index workspace_forms_folder on public.agency_workspace_forms(folder_id,workspace_id);

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
 if exists(select 1 from jsonb_array_elements(n->'data'->'rules') rule where coalesce(rule->>'field','')!~'^(name|phone|email|source|stage|message|tag|value|utm_source|utm_medium|utm_campaign|utm_content|utm_term|gclid|gbraid|wbraid|fbclid|answer:[a-zA-Z0-9_-]+)$' or coalesce(rule->>'operator','') not in ('equals','not_equals','contains','filled','not_filled','greater_than','starts_with','ends_with','less_than')) then raise exception 'Regra da condição inválida.';end if;
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

create or replace function agency_private.workflow_condition(p_rules jsonb,p_mode text,p_lead public.agency_workspace_leads,p_payload jsonb) returns boolean language plpgsql immutable set search_path='' as $$ declare rule jsonb;actual text;expected text;ok boolean;result boolean;begin
 if jsonb_typeof(p_rules) is distinct from 'array' or jsonb_array_length(p_rules)=0 or jsonb_array_length(p_rules)>20 then return false;end if;result:=coalesce(p_mode,'all')<>'any';
 for rule in select value from jsonb_array_elements(p_rules) loop
 actual:=case rule->>'field' when 'name' then p_lead.name when 'phone' then p_lead.phone when 'email' then p_lead.email when 'source' then p_lead.source_type when 'stage' then p_lead.stage_id::text when 'message' then p_payload->>'message' when 'tag' then array_to_string(p_lead.tags,',') when 'value' then p_lead.value::text else case when rule->>'field' like 'answer:%' then coalesce(p_payload->'answers'->substr(rule->>'field',8)->>'value',p_payload->'answers'->>substr(rule->>'field',8)) else p_lead.attributes->>(rule->>'field') end end;
 actual:=lower(trim(coalesce(actual,'')));expected:=lower(trim(coalesce(rule->>'value','')));
 ok:=case rule->>'operator' when 'equals' then actual=expected when 'not_equals' then actual<>expected when 'contains' then position(expected in actual)>0 when 'starts_with' then left(actual,length(expected))=expected when 'ends_with' then right(actual,length(expected))=expected when 'less_than' then case when actual~'^-?[0-9]+([.][0-9]+)?$' and expected~'^-?[0-9]+([.][0-9]+)?$' then actual::numeric<expected::numeric else false end when 'filled' then actual<>'' when 'not_filled' then actual='' when 'greater_than' then case when actual~'^-?[0-9]+([.][0-9]+)?$' and expected~'^-?[0-9]+([.][0-9]+)?$' then actual::numeric>expected::numeric else false end else false end;
 if p_mode='any' then result:=result or ok;else result:=result and ok;end if;end loop;return result;
end;$$;

create trigger workspace_folder_identity before update on public.agency_workspace_form_folders for each row execute function agency_private.commercial_scope_guard();
-- Serialization makes the first pipeline default even under concurrent creation.
create function agency_private.workspace_default_on_insert() returns trigger language plpgsql security invoker set search_path='' as $$begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.workspace_id::text,912));
 if not exists(select 1 from public.agency_workspace_pipelines where workspace_id=new.workspace_id and is_default) then new.is_default:=true;end if;return new;end;$$;
revoke all on function agency_private.workspace_default_on_insert() from public,anon,authenticated;
create trigger workspace_pipeline_default before insert on public.agency_workspace_pipelines for each row execute function agency_private.workspace_default_on_insert();

create index if not exists workspace_message_cohort on public.agency_workspace_messages(workspace_id,account_id,phone,created_at);
create function public.agency_workspace_conversation_metrics(p_workspace uuid,p_from timestamptz,p_until timestamptz) returns jsonb language plpgsql stable security invoker set search_path='' as $$declare result jsonb;begin
 if not agency_private.workspace_permission(p_workspace,'conversations','read') or not agency_private.workspace_permission(p_workspace,'crm','read') then raise exception 'Sem acesso aos indicadores de conversas.' using errcode='42501';end if;
 if p_from is null or p_until is null or p_from>=p_until or p_until-p_from>interval '366 days' then raise exception 'Escolha um período de até 366 dias.';end if;
 with firsts as (
 select distinct on(account_id,phone) account_id,phone,lead_id,created_at from public.agency_workspace_messages where workspace_id=p_workspace and not is_group and direction='entrada' and created_at<p_until order by account_id,phone,created_at,id
 ), cohort as (
 select f.*,l.id matched_lead,l.value,l.stage_id,l.attributes,
 (select min(m.created_at) from public.agency_workspace_messages m where m.workspace_id=p_workspace and m.account_id=f.account_id and m.phone=f.phone and m.direction='saida' and m.created_at>=f.created_at and m.created_at<p_until) answered_at,
 (select m.direction from public.agency_workspace_messages m where m.workspace_id=p_workspace and m.account_id=f.account_id and m.phone=f.phone and m.created_at<p_until order by m.created_at desc,m.id desc limit 1) latest_direction
 from firsts f left join lateral (select a.* from public.agency_workspace_leads a where a.workspace_id=p_workspace and (a.id=f.lead_id or agency_private.contact_key(a.phone,a.email)=agency_private.contact_key(f.phone,'')) order by (a.id=f.lead_id) desc nulls last,a.created_at limit 1) l on true where f.created_at>=p_from
 ), classified as (
 select *,case when coalesce(attributes->>'ctwa_clid','')<>'' or coalesce(attributes->>'meta_lead_id','')<>'' then 'meta' when coalesce(nullif(attributes->>'gclid',''),nullif(attributes->>'gbraid',''),nullif(attributes->>'wbraid',''),'')<>'' then 'google' when lower(coalesce(attributes->>'utm_source','')) in ('meta','facebook','instagram','fb','ig') and coalesce(attributes->>'fbclid','')<>'' then 'meta' else 'other' end channel from cohort
 ), sales as (
 select distinct c.matched_lead,c.value from classified c join public.agency_workspace_stages s on s.id=c.stage_id and s.workspace_id=p_workspace where s.kind='won'
 ) select jsonb_build_object('conversations',count(*),'meta',count(*) filter(where channel='meta'),'google',count(*) filter(where channel='google'),'other',count(*) filter(where channel='other'),'waiting',count(*) filter(where latest_direction='entrada'),'never_answered',count(*) filter(where answered_at is null),'answered',count(*) filter(where answered_at is not null),'avg_seconds',avg(extract(epoch from answered_at-created_at)),'median_seconds',percentile_cont(0.5) within group(order by extract(epoch from answered_at-created_at)),'opportunities',(select count(distinct matched_lead) from classified),'won',(select count(*) from sales),'won_value',(select coalesce(sum(value),0) from sales),'daily',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (select (created_at at time zone 'America/Sao_Paulo')::date as "day",count(*) filter(where channel='meta') meta,count(*) filter(where channel='google') google,count(*) filter(where channel='other') other from classified group by 1 order by 1) d)) into result from classified;
 return result;end;$$;
revoke all on function public.agency_workspace_conversation_metrics(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.agency_workspace_conversation_metrics(uuid,timestamptz,timestamptz) to authenticated;

alter table public.agency_workspace_stages add column probability integer not null default 0 check(probability between 0 and 100),add column show_on_dashboard boolean not null default true,add column create_meeting_task boolean not null default false,add column meeting_due_minutes integer not null default 1440 check(meeting_due_minutes between 0 and 43200);

create or replace function public.agency_workspace_save_pipeline(p_workspace uuid,p_name text,p_stages jsonb,p_id uuid default null) returns uuid language plpgsql security invoker set search_path='' as $$
 declare p uuid;item jsonb;s uuid;ids uuid[]:=array[]::uuid[];pos integer:=0;begin
 if not agency_private.workspace_permission(p_workspace,'crm','manage') or not agency_private.workspace_access(p_workspace,true) then raise exception 'Sem permissão nesta subconta.' using errcode='42501';end if;
 if p_stages is null or jsonb_typeof(p_stages)<>'array' or jsonb_array_length(p_stages)<1 or jsonb_array_length(p_stages)>30 then raise exception 'Informe entre 1 e 30 etapas.';end if;
 if p_id is null then insert into public.agency_workspace_pipelines(workspace_id,name) values(p_workspace,trim(p_name)) returning id into p;
 else select id into p from public.agency_workspace_pipelines where id=p_id and workspace_id=p_workspace for update;if p is null then raise exception 'Pipeline não encontrada.';end if;update public.agency_workspace_pipelines set name=trim(p_name) where id=p;end if;
 for item in select value from jsonb_array_elements(p_stages) loop
  s:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());if s=any(ids) then raise exception 'Etapa repetida.';end if;
  if exists(select 1 from public.agency_workspace_stages where id=s) then
   update public.agency_workspace_stages set name=trim(item->>'name'),color=item->>'color',kind=item->>'kind',position=pos,probability=coalesce((item->>'probability')::int,probability),show_on_dashboard=coalesce((item->>'show_on_dashboard')::boolean,show_on_dashboard),create_meeting_task=coalesce((item->>'create_meeting_task')::boolean,create_meeting_task),meeting_due_minutes=coalesce((item->>'meeting_due_minutes')::int,meeting_due_minutes) where id=s and pipeline_id=p and workspace_id=p_workspace;if not found then raise exception 'Etapa não pertence a esta pipeline.';end if;
  else insert into public.agency_workspace_stages(id,workspace_id,pipeline_id,name,color,kind,position,probability,show_on_dashboard,create_meeting_task,meeting_due_minutes) values(s,p_workspace,p,trim(item->>'name'),item->>'color',item->>'kind',pos,coalesce((item->>'probability')::int,0),coalesce((item->>'show_on_dashboard')::boolean,true),coalesce((item->>'create_meeting_task')::boolean,false),coalesce((item->>'meeting_due_minutes')::int,1440));end if;
  ids:=array_append(ids,s);pos:=pos+1;
 end loop;
 delete from public.agency_workspace_stages where pipeline_id=p and workspace_id=p_workspace and not(id=any(ids));return p;
 end;$$;

create function agency_private.workspace_stage_meeting_task() returns trigger language plpgsql security definer set search_path='' as $$declare s public.agency_workspace_stages;begin
 if new.stage_id is not distinct from old.stage_id then return new;end if;
 select * into s from public.agency_workspace_stages where id=new.stage_id and workspace_id=new.workspace_id;
 if s.create_meeting_task and exists(select 1 from public.agency_client_workspaces w join agency_private.pilot_accounts p on p.user_id=w.owner_user_id and p.enabled where w.id=new.workspace_id and w.status='active') then
 insert into public.agency_workspace_tasks(workspace_id,lead_id,title,due_at,assignee_user_id) values(new.workspace_id,new.id,left('Reunião: '||new.name,200),now()+make_interval(mins=>s.meeting_due_minutes),new.assignee_user_id);end if;return new;end;$$;
revoke all on function agency_private.workspace_stage_meeting_task() from public,anon,authenticated;
create trigger workspace_stage_meeting_task after update on public.agency_workspace_leads for each row execute function agency_private.workspace_stage_meeting_task();
