-- Client minutes stay in the agency model; invitation-only identities cannot enter it.
create table public.agency_client_meeting_minutes(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,client_id uuid not null references public.clients(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 180),meeting_date date not null default current_date,
 participants text not null default '' check(length(participants)<=4000),agenda text not null default '' check(length(agenda)<=20000),
 decisions text not null default '' check(length(decisions)<=20000),next_steps text not null default '' check(length(next_steps)<=20000),
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index client_minutes_lookup on public.agency_client_meeting_minutes(user_id,client_id,meeting_date desc,id);
alter table public.agency_client_meeting_minutes enable row level security;
revoke all on public.agency_client_meeting_minutes from public,anon;
grant select,insert,update,delete on public.agency_client_meeting_minutes to authenticated,service_role;
create policy minutes_owner on public.agency_client_meeting_minutes for all to authenticated using(user_id=auth.uid() and public.agency_central_access() and exists(select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid())) with check(user_id=auth.uid() and public.agency_central_access() and exists(select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()));
create function agency_private.minutes_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' then
 if (new.user_id,new.client_id) is distinct from (old.user_id,old.client_id) then raise exception 'A ata não pode ser transferida entre contas ou clientes.';end if;
 new.revision:=old.revision+1;new.created_at:=old.created_at;
 end if;new.updated_at:=now();return new;end;$$;
revoke all on function agency_private.minutes_guard() from public,anon,authenticated;
create trigger minutes_guard before insert or update on public.agency_client_meeting_minutes for each row execute function agency_private.minutes_guard();

create table agency_private.mcp_clients(id uuid primary key default gen_random_uuid(),name text not null,redirect_uris text[] not null,rate_key text not null,created_at timestamptz not null default now());
create index mcp_registration_rate on agency_private.mcp_clients(rate_key,created_at);
create table agency_private.mcp_connections(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,client_id uuid references agency_private.mcp_clients(id),name text not null,scopes text[] not null,workspace_ids uuid[] not null default '{}',include_agency boolean not null,resource text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '90 days',revoked_at timestamptz,last_used_at timestamptz);
create index mcp_connections_owner on agency_private.mcp_connections(user_id,created_at desc);
create table agency_private.mcp_codes(hash text primary key check(hash~'^[a-f0-9]{64}$'),user_id uuid not null references auth.users(id) on delete cascade,client_id uuid not null references agency_private.mcp_clients(id),redirect_uri text not null,challenge text not null,scopes text[] not null,workspace_ids uuid[] not null,include_agency boolean not null,resource text not null,expires_at timestamptz not null default now()+interval '5 minutes',used_at timestamptz);
create table agency_private.mcp_tokens(hash text primary key check(hash~'^[a-f0-9]{64}$'),connection_id uuid not null references agency_private.mcp_connections(id) on delete cascade,kind text not null check(kind in ('access','refresh')),expires_at timestamptz not null,used_at timestamptz);
create index mcp_tokens_connection on agency_private.mcp_tokens(connection_id);
do $$declare t text;begin foreach t in array array['mcp_clients','mcp_connections','mcp_codes','mcp_tokens'] loop execute format('alter table agency_private.%I enable row level security',t);execute format('revoke all on agency_private.%I from public,anon,authenticated',t);execute format('grant all on agency_private.%I to service_role',t);end loop;end;$$;
create function agency_private.mcp_owner(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from auth.users u join public.organizations o on o.owner_user_id=u.id where u.id=p_user and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) and not exists(select 1 from agency_private.workspace_only_users where user_id=p_user);$$;
create function agency_private.mcp_selection(p_user uuid,p_scopes text[],p_workspaces uuid[],p_agency boolean) returns boolean language sql stable security definer set search_path='' as $$select agency_private.mcp_owner(p_user) and cardinality(p_scopes)>0 and p_scopes<@array['clients:read','minutes:read','minutes:write','tasks:read','tasks:write','crm:read','crm:write','calendar:read']::text[] and (p_agency or cardinality(p_workspaces)>0) and not exists(select 1 from unnest(p_workspaces) x where not exists(select 1 from public.agency_client_workspaces w where w.id=x and w.owner_user_id=p_user and w.account_kind='client' and w.status='active'));$$;
revoke all on function agency_private.mcp_owner(uuid),agency_private.mcp_selection(uuid,text[],uuid[],boolean) from public,anon,authenticated;
grant execute on function agency_private.mcp_owner(uuid),agency_private.mcp_selection(uuid,text[],uuid[],boolean) to service_role;

create function public.agency_mcp_register(p_name text,p_redirects text[],p_rate_key text) returns uuid language plpgsql security invoker set search_path='' as $$declare result uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('mcp-register:'||p_rate_key,0));
 if (select count(*) from agency_private.mcp_clients where rate_key=p_rate_key and created_at>now()-interval '1 hour')>=30 then raise exception 'Limite de registros atingido.';end if;
 if length(p_name) not between 1 and 160 or cardinality(p_redirects) not between 1 and 10 then raise exception 'Cliente OAuth inválido.';end if;
 insert into agency_private.mcp_clients(name,redirect_uris,rate_key) values(p_name,p_redirects,p_rate_key) returning id into result;return result;
end;$$;
create function public.agency_mcp_client(p_client uuid) returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_build_object('id',id,'name',name,'redirect_uris',redirect_uris) from agency_private.mcp_clients where id=p_client;$$;
create function public.agency_mcp_grant(p_hash text,p_user uuid,p_client uuid,p_redirect text,p_challenge text,p_scopes text[],p_workspaces uuid[],p_agency boolean,p_resource text) returns void language plpgsql security invoker set search_path='' as $$begin
 if not agency_private.mcp_selection(p_user,p_scopes,p_workspaces,p_agency) or not exists(select 1 from agency_private.mcp_clients where id=p_client and p_redirect=any(redirect_uris)) or p_challenge!~'^[a-zA-Z0-9_-]{43}$' then raise exception 'Autorização inválida.';end if;
 insert into agency_private.mcp_codes(hash,user_id,client_id,redirect_uri,challenge,scopes,workspace_ids,include_agency,resource) values(p_hash,p_user,p_client,p_redirect,p_challenge,p_scopes,p_workspaces,p_agency,p_resource);
end;$$;
create function public.agency_mcp_exchange(p_kind text,p_hash text,p_client uuid,p_redirect text,p_challenge text,p_resource text,p_access text,p_refresh text) returns jsonb language plpgsql security invoker set search_path='' as $$declare code agency_private.mcp_codes;t agency_private.mcp_tokens;c agency_private.mcp_connections;begin
 if p_kind='authorization_code' then
 select * into code from agency_private.mcp_codes where hash=p_hash for update;
 if code.hash is null or code.used_at is not null or code.expires_at<=now() or code.client_id<>p_client or code.redirect_uri<>p_redirect or code.challenge<>p_challenge or code.resource<>p_resource or not agency_private.mcp_selection(code.user_id,code.scopes,code.workspace_ids,code.include_agency) then return jsonb_build_object('error','invalid_grant');end if;
 update agency_private.mcp_codes set used_at=now() where hash=p_hash;
 insert into agency_private.mcp_connections(user_id,client_id,name,scopes,workspace_ids,include_agency,resource) select code.user_id,code.client_id,name,code.scopes,code.workspace_ids,code.include_agency,code.resource from agency_private.mcp_clients where id=p_client returning * into c;
 elsif p_kind='refresh_token' then
 select * into t from agency_private.mcp_tokens where hash=p_hash and kind='refresh' for update;
 if t.hash is null then return jsonb_build_object('error','invalid_grant');end if;
 select * into c from agency_private.mcp_connections where id=t.connection_id for update;
 if c.client_id is distinct from p_client or c.resource<>p_resource then return jsonb_build_object('error','invalid_grant');end if;
 if t.used_at is not null then update agency_private.mcp_connections set revoked_at=now() where id=c.id;return jsonb_build_object('error','invalid_grant');end if;
 if t.expires_at<=now() or c.expires_at<=now() or c.revoked_at is not null or not agency_private.mcp_selection(c.user_id,c.scopes,c.workspace_ids,c.include_agency) then return jsonb_build_object('error','invalid_grant');end if;
 update agency_private.mcp_tokens set used_at=now() where hash=p_hash;
 else return jsonb_build_object('error','unsupported_grant_type');end if;
 insert into agency_private.mcp_tokens(hash,connection_id,kind,expires_at) values(p_access,c.id,'access',least(c.expires_at,now()+interval '1 hour')),(p_refresh,c.id,'refresh',least(c.expires_at,now()+interval '30 days'));
 return jsonb_build_object('scope',array_to_string(c.scopes,' '));
end;$$;
create function public.agency_mcp_manual(p_user uuid,p_name text,p_scopes text[],p_workspaces uuid[],p_agency boolean,p_hash text,p_resource text) returns uuid language plpgsql security invoker set search_path='' as $$declare cid uuid;begin
 if not agency_private.mcp_selection(p_user,p_scopes,p_workspaces,p_agency) or length(trim(p_name)) not between 1 and 160 then raise exception 'Permissões ou nome inválidos.';end if;
 insert into agency_private.mcp_connections(user_id,name,scopes,workspace_ids,include_agency,resource,expires_at) values(p_user,p_name,p_scopes,p_workspaces,p_agency,p_resource,now()+interval '30 days') returning id into cid;
 insert into agency_private.mcp_tokens(hash,connection_id,kind,expires_at) values(p_hash,cid,'access',now()+interval '30 days');return cid;
end;$$;
create function public.agency_mcp_principal(p_hash text,p_resource text) returns jsonb language plpgsql security invoker set search_path='' as $$declare c agency_private.mcp_connections;begin
 select con.* into c from agency_private.mcp_connections con join agency_private.mcp_tokens t on t.connection_id=con.id where t.hash=p_hash and t.kind='access' and t.expires_at>now() and con.expires_at>now() and con.revoked_at is null and con.resource=p_resource for update of con;
 if c.id is null or not agency_private.mcp_owner(c.user_id) then return null;end if;
 update agency_private.mcp_connections set last_used_at=now() where id=c.id;
 return jsonb_build_object('id',c.id,'user_id',c.user_id,'scopes',c.scopes,'workspace_ids',c.workspace_ids,'include_agency',c.include_agency,'client_id',c.client_id);
end;$$;
-- Browser management has no token/hash access.
create function agency_private.mcp_manage(p_revoke uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not agency_private.mcp_owner(auth.uid()) then raise exception 'Somente a conta da agência pode conectar ferramentas MCP.' using errcode='42501';end if;
 if p_revoke is not null then update agency_private.mcp_connections set revoked_at=now() where id=p_revoke and user_id=auth.uid();end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'scopes',scopes,'workspace_ids',workspace_ids,'include_agency',include_agency,'created_at',created_at,'expires_at',expires_at,'last_used_at',last_used_at,'revoked_at',revoked_at) order by created_at desc) from agency_private.mcp_connections where user_id=auth.uid()),'[]');
end;$$;
revoke all on function agency_private.mcp_manage(uuid) from public,anon;
grant execute on function agency_private.mcp_manage(uuid) to authenticated;
create function public.agency_mcp_connections(p_revoke uuid default null) returns jsonb language sql security invoker set search_path='' as $$select agency_private.mcp_manage(p_revoke);$$;
revoke all on function public.agency_mcp_connections(uuid) from public,anon;
grant execute on function public.agency_mcp_connections(uuid) to authenticated;
create table agency_private.mcp_writes(connection_id uuid not null references agency_private.mcp_connections(id) on delete cascade,request_id uuid not null,signature text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(connection_id,request_id));
alter table agency_private.mcp_writes enable row level security;
revoke all on agency_private.mcp_writes from public,anon,authenticated;grant all on agency_private.mcp_writes to service_role;
create function public.agency_mcp_tool(p_hash text,p_resource text,p_tool text,p_args jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare principal jsonb;c agency_private.mcp_connections;scope text;w uuid;entity uuid;parent uuid;stage uuid;pipeline uuid;result jsonb;lim int;off int;q text;request uuid;prior agency_private.mcp_writes;begin
 principal:=public.agency_mcp_principal(p_hash,p_resource);if principal is null then raise exception 'Conexão expirada ou revogada.' using errcode='42501';end if;
 select * into c from agency_private.mcp_connections where id=(principal->>'id')::uuid;
 scope:=case p_tool when 'list_clients' then 'clients:read' when 'get_client' then 'clients:read' when 'list_meeting_minutes' then 'minutes:read' when 'get_meeting_minutes' then 'minutes:read' when 'create_meeting_minutes' then 'minutes:write' when 'update_meeting_minutes' then 'minutes:write' when 'list_tasks' then 'tasks:read' when 'create_task' then 'tasks:write' when 'update_task' then 'tasks:write' when 'list_leads' then 'crm:read' when 'list_pipelines' then 'crm:read' when 'create_lead' then 'crm:write' when 'move_lead' then 'crm:write' when 'list_appointments' then 'calendar:read' when 'list_contexts' then null else 'invalid' end;
 if scope='invalid' or (scope is not null and not scope=any(c.scopes)) then raise exception 'Ferramenta ou permissão não autorizada.' using errcode='42501';end if;
 if p_tool='list_contexts' then return jsonb_build_object('agency',c.include_agency,'subaccounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.agency_client_workspaces where id=any(c.workspace_ids) and owner_user_id=c.user_id and status='active' and account_kind='client'),'[]'));end if;
 w:=nullif(p_args->>'workspace_id','')::uuid;
 if w is null then if not c.include_agency then raise exception 'Informe uma subconta autorizada em workspace_id.' using errcode='42501';end if;
 elsif not w=any(c.workspace_ids) or not exists(select 1 from public.agency_client_workspaces where id=w and owner_user_id=c.user_id and status='active' and account_kind='client') then raise exception 'Subconta não autorizada.' using errcode='42501';end if;
 if w is not null and p_tool in ('list_clients','get_client','list_meeting_minutes','get_meeting_minutes','create_meeting_minutes','update_meeting_minutes') then raise exception 'Clientes e atas de clientes pertencem à conta da agência.';end if;
 lim:=least(100,greatest(1,coalesce((p_args->>'limit')::int,50)));off:=least(100000,greatest(0,coalesce((p_args->>'offset')::int,0)));q:=left(coalesce(p_args->>'search',''),200);
 if scope like '%:write' then
 request:=(p_args->>'request_id')::uuid;if request is null then raise exception 'request_id UUID é obrigatório para alterações.';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.id::text||request::text,0));
 select * into prior from agency_private.mcp_writes where connection_id=c.id and request_id=request;
 if prior.request_id is not null then if prior.signature<>md5(p_tool||p_args::text) then raise exception 'request_id já utilizado com outros dados.';end if;return prior.result;end if;
 end if;
 case p_tool
 when 'list_clients' then select coalesce(jsonb_agg(x),'[]') into result from (select id,name,status,phone,niche,services from public.clients where user_id=c.user_id and name ilike '%'||q||'%' order by name,id limit lim offset off) x;
 when 'get_client' then select jsonb_build_object('id',id,'name',name,'status',status,'phone',phone,'niche',niche,'services',services) into result from public.clients where id=(p_args->>'id')::uuid and user_id=c.user_id;
 when 'list_meeting_minutes' then select coalesce(jsonb_agg(x),'[]') into result from (select id,client_id,title,meeting_date,participants,revision,updated_at from public.agency_client_meeting_minutes where user_id=c.user_id and exists(select 1 from public.clients parent_client where parent_client.id=agency_client_meeting_minutes.client_id and parent_client.user_id=c.user_id) and (nullif(p_args->>'client_id','') is null or client_id=(p_args->>'client_id')::uuid) and title ilike '%'||q||'%' order by meeting_date desc,id limit lim offset off) x;
 when 'get_meeting_minutes' then select to_jsonb(x)-'user_id' into result from public.agency_client_meeting_minutes x where id=(p_args->>'id')::uuid and user_id=c.user_id and exists(select 1 from public.clients parent_client where parent_client.id=x.client_id and parent_client.user_id=c.user_id);
 when 'create_meeting_minutes' then
 parent:=(p_args->>'client_id')::uuid;if not exists(select 1 from public.clients where id=parent and user_id=c.user_id) then raise exception 'Cliente não autorizado.' using errcode='42501';end if;
 insert into public.agency_client_meeting_minutes(user_id,client_id,title,meeting_date,participants,agenda,decisions,next_steps) values(c.user_id,parent,p_args->>'title',(p_args->>'meeting_date')::date,coalesce(p_args->>'participants',''),coalesce(p_args->>'agenda',''),coalesce(p_args->>'decisions',''),coalesce(p_args->>'next_steps','')) returning jsonb_build_object('id',id,'client_id',client_id,'title',title,'meeting_date',meeting_date,'revision',revision) into result;
 when 'update_meeting_minutes' then
 update public.agency_client_meeting_minutes set title=coalesce(p_args->>'title',title),meeting_date=coalesce((p_args->>'meeting_date')::date,meeting_date),participants=coalesce(p_args->>'participants',participants),agenda=coalesce(p_args->>'agenda',agenda),decisions=coalesce(p_args->>'decisions',decisions),next_steps=coalesce(p_args->>'next_steps',next_steps) where id=(p_args->>'id')::uuid and user_id=c.user_id and exists(select 1 from public.clients parent_client where parent_client.id=agency_client_meeting_minutes.client_id and parent_client.user_id=c.user_id) and revision=(p_args->>'revision')::int returning jsonb_build_object('id',id,'client_id',client_id,'title',title,'meeting_date',meeting_date,'revision',revision) into result;
 when 'list_tasks' then
 if w is null then select coalesce(jsonb_agg(x),'[]') into result from (select id,title,description,status,priority,start_date,end_date,client_id,area,assignee_name,assignee_user_id from public.operational_tasks where user_id=c.user_id and title ilike '%'||q||'%' order by created_at desc,id limit lim offset off) x;
 else select coalesce(jsonb_agg(x),'[]') into result from (select id,title,due_at,completed,lead_id,assignee_user_id from public.agency_workspace_tasks where workspace_id=w and title ilike '%'||q||'%' order by created_at desc,id limit lim offset off) x;end if;
 when 'create_task' then
 if w is null then
 parent:=nullif(p_args->>'client_id','')::uuid;if parent is not null and not exists(select 1 from public.clients where id=parent and user_id=c.user_id) then raise exception 'Cliente não autorizado.' using errcode='42501';end if;
 insert into public.operational_tasks(user_id,organization_id,client_id,title,description,end_date) values(c.user_id,(select id from public.organizations where owner_user_id=c.user_id order by created_at,id limit 1),parent,p_args->>'title',coalesce(p_args->>'description',''),(p_args->>'due_date')::date) returning jsonb_build_object('id',id,'title',title,'status',status) into result;
 else
 parent:=nullif(p_args->>'lead_id','')::uuid;if parent is not null and not exists(select 1 from public.agency_workspace_leads where id=parent and workspace_id=w) then raise exception 'Lead não autorizado.' using errcode='42501';end if;
 insert into public.agency_workspace_tasks(workspace_id,lead_id,title,due_at) values(w,parent,p_args->>'title',(p_args->>'due_at')::timestamptz) returning jsonb_build_object('id',id,'title',title,'completed',completed) into result;end if;
 when 'update_task' then
 if w is null then update public.operational_tasks set title=coalesce(p_args->>'title',title),description=coalesce(p_args->>'description',description),status=coalesce(p_args->>'status',status),end_date=coalesce((p_args->>'due_date')::date,end_date) where id=(p_args->>'id')::uuid and user_id=c.user_id returning jsonb_build_object('id',id,'title',title,'status',status) into result;
 else update public.agency_workspace_tasks set title=coalesce(p_args->>'title',title),completed=coalesce((p_args->>'completed')::boolean,completed),due_at=coalesce((p_args->>'due_at')::timestamptz,due_at) where id=(p_args->>'id')::uuid and workspace_id=w returning jsonb_build_object('id',id,'title',title,'completed',completed) into result;end if;
 when 'list_pipelines' then
 if w is null then select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'stages',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'position',s.position) order by s.position),'[]') from public.agency_pipeline_stages s where s.pipeline_id=p.id and s.user_id=c.user_id))),'[]') into result from public.agency_pipelines p where p.user_id=c.user_id and p.area='comercial';
 else select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'stages',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'position',s.position) order by s.position),'[]') from public.agency_workspace_stages s where s.pipeline_id=p.id and s.workspace_id=w))),'[]') into result from public.agency_workspace_pipelines p where p.workspace_id=w;end if;
 when 'list_leads' then
 if w is null then select coalesce(jsonb_agg(x),'[]') into result from (select l.id,l.title as name,l.phone,l.notes,l.value,l.pipeline_id,l.stage_id from public.agency_pipeline_cards l join public.agency_pipelines p on p.id=l.pipeline_id where l.user_id=c.user_id and p.user_id=c.user_id and p.area='comercial' and l.title ilike '%'||q||'%' order by l.created_at desc,l.id limit lim offset off) x;
 else select coalesce(jsonb_agg(x),'[]') into result from (select id,name,phone,email,notes,value,pipeline_id,stage_id,assignee_user_id from public.agency_workspace_leads where workspace_id=w and name ilike '%'||q||'%' order by created_at desc,id limit lim offset off) x;end if;
 when 'create_lead','move_lead' then
 stage:=(p_args->>'stage_id')::uuid;
 if w is null then
 select s.pipeline_id into pipeline from public.agency_pipeline_stages s join public.agency_pipelines p on p.id=s.pipeline_id and p.user_id=s.user_id where s.id=stage and s.user_id=c.user_id and p.area='comercial';
 if pipeline is null then raise exception 'Etapa não autorizada.' using errcode='42501';end if;
 if p_tool='create_lead' then insert into public.agency_pipeline_cards(user_id,pipeline_id,stage_id,title,phone,notes,value) values(c.user_id,pipeline,stage,p_args->>'name',coalesce(p_args->>'phone',''),coalesce(p_args->>'notes',''),coalesce((p_args->>'value')::numeric,0)) returning jsonb_build_object('id',id,'name',title,'stage_id',stage_id) into result;
 else update public.agency_pipeline_cards l set pipeline_id=pipeline,stage_id=stage where l.id=(p_args->>'id')::uuid and l.user_id=c.user_id and exists(select 1 from public.agency_pipelines p where p.id=l.pipeline_id and p.user_id=c.user_id and p.area='comercial') returning jsonb_build_object('id',id,'name',title,'stage_id',stage_id) into result;end if;
 else
 select pipeline_id into pipeline from public.agency_workspace_stages where id=stage and workspace_id=w;
 if pipeline is null then raise exception 'Etapa não autorizada.' using errcode='42501';end if;
 if p_tool='create_lead' then insert into public.agency_workspace_leads(workspace_id,pipeline_id,stage_id,name,phone,email,notes,value,source_type) values(w,pipeline,stage,p_args->>'name',coalesce(p_args->>'phone',''),coalesce(p_args->>'email',''),coalesce(p_args->>'notes',''),coalesce((p_args->>'value')::numeric,0),'manual') returning jsonb_build_object('id',id,'name',name,'stage_id',stage_id) into result;
 else update public.agency_workspace_leads set pipeline_id=pipeline,stage_id=stage where id=(p_args->>'id')::uuid and workspace_id=w returning jsonb_build_object('id',id,'name',name,'stage_id',stage_id) into result;end if;end if;
 when 'list_appointments' then
 if w is null then select coalesce(jsonb_agg(x),'[]') into result from (select * from (select id,title,client_id,starts_at,ends_at,status,notes,'agency'::text as source from public.agency_appointments where user_id=c.user_id union all select a.id,a.name,null::uuid,a.starts_at,a.ends_at,case a.status when 'cancelled' then 'cancelado' when 'completed' then 'concluido' else 'agendado' end,a.notes,'primary_booking'::text from public.agency_workspace_appointments a join agency_private.agency_account_workspaces main on main.workspace_id=a.workspace_id where main.owner_user_id=c.user_id) combined where title ilike '%'||q||'%' order by starts_at desc,id limit lim offset off) x;
 else select coalesce(jsonb_agg(x),'[]') into result from (select id,name,lead_id,starts_at,ends_at,status,notes from public.agency_workspace_appointments where workspace_id=w order by starts_at desc,id limit lim offset off) x;end if;
 else raise exception 'Ferramenta inválida.';
 end case;
 if result is null then raise exception 'Registro não encontrado, não autorizado ou alterado por outra pessoa. Recarregue antes de editar.';end if;
 if request is not null then insert into agency_private.mcp_writes(connection_id,request_id,signature,result) values(c.id,request,md5(p_tool||p_args::text),result);end if;
 return result;
end;$$;
-- Only the Edge Function can resolve opaque credentials and perform delegated operations.
do $$declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('agency_mcp_register','agency_mcp_client','agency_mcp_grant','agency_mcp_exchange','agency_mcp_manual','agency_mcp_principal','agency_mcp_tool') loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);execute format('grant execute on function %s to service_role',r.signature);end loop;end;$$;

revoke insert,update on public.agency_client_meeting_minutes from authenticated;
grant insert(user_id,client_id,title,meeting_date,participants,agenda,decisions,next_steps),update(title,meeting_date,participants,agenda,decisions,next_steps) on public.agency_client_meeting_minutes to authenticated;
