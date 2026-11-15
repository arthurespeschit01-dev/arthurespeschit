-- Transport-specific secrets remain private; existing W-API rows retain their configuration.
alter table agency_private.workspace_whatsapp
 add column transport text not null default 'wapi' check(transport in ('wapi','cloud')),
 add column waba_id text,
 add column cloud_pin text,
 add column cloud_phone_id text unique,
 add column coexistence boolean not null default false;
create table agency_private.workspace_cloud_signup(
 nonce text primary key default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 mode text not null check(mode in ('business_app','new_number')),
 expires_at timestamptz not null default now()+interval '10 minutes'
);
alter table agency_private.workspace_cloud_signup enable row level security;
revoke all on agency_private.workspace_cloud_signup from public,anon,authenticated;
grant all on agency_private.workspace_cloud_signup to service_role;
create function public.agency_workspace_cloud_signup(p_workspace uuid,p_user uuid,p_mode text,p_nonce text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r agency_private.workspace_cloud_signup;
begin
 if not public.agency_workspace_available(p_workspace) then raise exception 'Subconta indisponível.';end if;
 if not exists(select 1 from public.agency_workspace_members where workspace_id=p_workspace and user_id=p_user and role in ('owner','admin')) then raise exception 'Administrador necessário.';end if;
 if p_nonce is null then
  delete from agency_private.workspace_cloud_signup where expires_at<now() or (workspace_id=p_workspace and user_id=p_user and mode=p_mode);
  if (select count(*) from agency_private.workspace_cloud_signup where user_id=p_user)>=5 then raise exception 'Há conexões em andamento. Aguarde alguns minutos.';end if;
  insert into agency_private.workspace_cloud_signup(workspace_id,user_id,mode) values(p_workspace,p_user,p_mode) returning * into r;
 else
  delete from agency_private.workspace_cloud_signup where nonce=p_nonce and workspace_id=p_workspace and user_id=p_user and expires_at>now() returning * into r;
  if r.nonce is null then raise exception 'Autorização expirada ou já utilizada. Inicie novamente.';end if;
 end if;
 return to_jsonb(r);
end;$$;
revoke all on function public.agency_workspace_cloud_signup(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.agency_workspace_cloud_signup(uuid,uuid,text,text) to service_role;
create function public.agency_workspace_cloud_setup(p_workspace uuid,p_values jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r agency_private.workspace_whatsapp;
begin
 if not public.agency_workspace_available(p_workspace) then raise exception 'Subconta indisponível.';end if;
 if exists(select 1 from agency_private.workspace_whatsapp where workspace_id=p_workspace and enabled) then raise exception 'Desconecte a conexão atual antes de trocar de modalidade.';end if;
 if coalesce(p_values->>'waba_id','')!~'^[0-9]{5,30}$' or coalesce(p_values->>'phone_number_id','')!~'^[0-9]{5,30}$' or length(coalesce(p_values->>'token',''))<20 then raise exception 'Autorização Meta inválida.';end if;
 insert into agency_private.workspace_whatsapp(workspace_id,instance_id,token,pipeline_id,stage_id,transport,waba_id,cloud_phone_id,coexistence,cloud_pin)
 values(p_workspace,'cloud:'||(p_values->>'phone_number_id'),p_values->>'token',(p_values->>'pipeline_id')::uuid,(p_values->>'stage_id')::uuid,'cloud',p_values->>'waba_id',p_values->>'phone_number_id',coalesce((p_values->>'coexistence')::boolean,false),p_values->>'pin')
 on conflict(workspace_id) do update set instance_id=excluded.instance_id,token=excluded.token,pipeline_id=excluded.pipeline_id,stage_id=excluded.stage_id,transport='cloud',waba_id=excluded.waba_id,cloud_phone_id=excluded.cloud_phone_id,coexistence=excluded.coexistence,cloud_pin=excluded.cloud_pin,enabled=false,active_account_id=null,webhook_secret=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')
 returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function public.agency_workspace_cloud_setup(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agency_workspace_cloud_setup(uuid,jsonb) to service_role;
create function agency_private.workspace_transport_reset() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.instance_id not like 'cloud:%' then new.transport:='wapi';new.waba_id:=null;new.cloud_pin:=null;new.cloud_phone_id:=null;new.coexistence:=false;end if;return new;
end;$$;
create trigger workspace_transport_reset before update of instance_id on agency_private.workspace_whatsapp for each row execute function agency_private.workspace_transport_reset();

create function public.agency_workspace_cloud_find(p_waba text,p_phone text) returns jsonb language sql security invoker set search_path='' as $$
 select to_jsonb(c) from agency_private.workspace_whatsapp c where c.transport='cloud' and c.waba_id=p_waba and c.cloud_phone_id=p_phone and c.enabled and public.agency_workspace_available(c.workspace_id);
$$;
revoke all on function public.agency_workspace_cloud_find(text,text) from public,anon,authenticated;
grant execute on function public.agency_workspace_cloud_find(text,text) to service_role;

create table agency_private.workspace_whatsapp_preferences(workspace_id uuid primary key references public.agency_client_workspaces(id) on delete cascade,optout_enabled boolean not null default true,phrases jsonb not null default '["parar","sair","descadastrar","remover","não quero mais receber","pare de me mandar","cancelar inscrição","vou bloquear","stop"]');
create table agency_private.workspace_whatsapp_optouts(workspace_id uuid not null references public.agency_client_workspaces(id) on delete cascade,phone text not null,created_at timestamptz not null default now(),primary key(workspace_id,phone));
alter table agency_private.workspace_whatsapp_preferences enable row level security;
alter table agency_private.workspace_whatsapp_optouts enable row level security;
revoke all on agency_private.workspace_whatsapp_preferences,agency_private.workspace_whatsapp_optouts from public,anon,authenticated;
grant all on agency_private.workspace_whatsapp_preferences,agency_private.workspace_whatsapp_optouts to service_role;
create function public.agency_workspace_whatsapp_preferences(p_workspace uuid,p_values jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r agency_private.workspace_whatsapp_preferences;begin
 if not public.agency_workspace_available(p_workspace) then raise exception 'Subconta indisponível.';end if;
 if p_values is not null then
  if jsonb_typeof(p_values->'phrases') is distinct from 'array' or jsonb_array_length(p_values->'phrases') not between 1 and 50 or exists(select 1 from jsonb_array_elements(p_values->'phrases') x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 1 and 100) then raise exception 'Informe de 1 a 50 frases, com até 100 caracteres cada.';end if;
  insert into agency_private.workspace_whatsapp_preferences(workspace_id,optout_enabled,phrases) values(p_workspace,(p_values->>'optout_enabled')::boolean,p_values->'phrases') on conflict(workspace_id) do update set optout_enabled=excluded.optout_enabled,phrases=excluded.phrases;
 end if;
 select * into r from agency_private.workspace_whatsapp_preferences where workspace_id=p_workspace;
 if r.workspace_id is null then r.optout_enabled:=true;r.phrases:='["parar","sair","descadastrar","remover","não quero mais receber","pare de me mandar","cancelar inscrição","vou bloquear","stop"]';end if;
 return jsonb_build_object('optout_enabled',r.optout_enabled,'phrases',r.phrases);
end;$$;
revoke all on function public.agency_workspace_whatsapp_preferences(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agency_workspace_whatsapp_preferences(uuid,jsonb) to service_role;
create function public.agency_workspace_whatsapp_optout(p_workspace uuid,p_phone text,p_mark boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$begin
 if not public.agency_workspace_available(p_workspace) then raise exception 'Subconta indisponível.';end if;
 if p_phone!~'^[0-9]{10,15}$' then return false;end if;
 if p_mark then insert into agency_private.workspace_whatsapp_optouts(workspace_id,phone) values(p_workspace,p_phone) on conflict do nothing;end if;
 return exists(select 1 from agency_private.workspace_whatsapp_optouts where workspace_id=p_workspace and phone=p_phone);
end;$$;
revoke all on function public.agency_workspace_whatsapp_optout(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.agency_workspace_whatsapp_optout(uuid,text,boolean) to service_role;

create table agency_private.workspace_whatsapp_pair_links(workspace_id uuid primary key references public.agency_client_workspaces(id) on delete cascade,token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),instance_id text not null,expires_at timestamptz not null default now()+interval '15 minutes',reads integer not null default 0);
alter table agency_private.workspace_whatsapp_pair_links enable row level security;
revoke all on agency_private.workspace_whatsapp_pair_links from public,anon,authenticated;
grant all on agency_private.workspace_whatsapp_pair_links to service_role;
create function public.agency_workspace_pair_link(p_workspace uuid default null,p_token text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c agency_private.workspace_whatsapp;r agency_private.workspace_whatsapp_pair_links;begin
 if p_workspace is not null then
  if not public.agency_workspace_available(p_workspace) then raise exception 'Subconta indisponível.';end if;
  select * into c from agency_private.workspace_whatsapp where workspace_id=p_workspace and transport='wapi' and enabled;
  if c.workspace_id is null then raise exception 'Configure a conexão por QR Code primeiro.';end if;
  insert into agency_private.workspace_whatsapp_pair_links(workspace_id,instance_id) values(p_workspace,c.instance_id) on conflict(workspace_id) do update set token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),instance_id=excluded.instance_id,expires_at=now()+interval '15 minutes',reads=0 returning * into r;
  return jsonb_build_object('token',r.token,'expires_at',r.expires_at);
 end if;
 update agency_private.workspace_whatsapp_pair_links p set reads=reads+1 where p.token=p_token and p.expires_at>now() and p.reads<240 and public.agency_workspace_available(p.workspace_id) and exists(select 1 from agency_private.workspace_whatsapp w where w.workspace_id=p.workspace_id and w.instance_id=p.instance_id and w.enabled and w.transport='wapi') returning * into r;
 if r.workspace_id is null then return null;end if;
 select * into c from agency_private.workspace_whatsapp where workspace_id=r.workspace_id;
 return to_jsonb(c);
end;$$;
revoke all on function public.agency_workspace_pair_link(uuid,text) from public,anon,authenticated;
grant execute on function public.agency_workspace_pair_link(uuid,text) to service_role;
revoke all on function agency_private.workspace_transport_reset() from public,anon,authenticated;
