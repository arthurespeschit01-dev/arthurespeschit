-- Sender-number mailboxes. Legacy messages are retained with no guessed account.
create table public.agency_whatsapp_accounts(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,phone text not null check(phone ~ '^[0-9]{10,15}$'),created_at timestamptz not null default now(),unique(user_id,phone),unique(id,user_id));
alter table public.agency_whatsapp_accounts enable row level security;
create policy whatsapp_accounts_owner on public.agency_whatsapp_accounts for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.agency_whatsapp_accounts from public,anon,authenticated;
grant select on public.agency_whatsapp_accounts to authenticated;
grant select,insert,update on public.agency_whatsapp_accounts to service_role;
create table public.agency_whatsapp_account_state(user_id uuid primary key references auth.users(id) on delete cascade,account_id uuid,connected boolean not null default false,checked_at timestamptz not null default now(),foreign key(account_id,user_id) references public.agency_whatsapp_accounts(id,user_id));
alter table public.agency_whatsapp_account_state enable row level security;
create policy whatsapp_state_owner on public.agency_whatsapp_account_state for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.agency_whatsapp_account_state from public,anon,authenticated;
grant select on public.agency_whatsapp_account_state to authenticated;
grant select,insert,update on public.agency_whatsapp_account_state to service_role;
create function public.agency_active_whatsapp_account() returns uuid language sql stable security invoker set search_path='' as $$select account_id from public.agency_whatsapp_account_state where user_id=(select auth.uid()) and connected and checked_at>now()-interval '90 seconds'$$;
revoke all on function public.agency_active_whatsapp_account() from public,anon;
grant execute on function public.agency_active_whatsapp_account() to authenticated;
alter table public.agency_whatsapp_messages add column account_id uuid;
alter table public.agency_whatsapp_messages add constraint whatsapp_message_account_owner foreign key(account_id,user_id) references public.agency_whatsapp_accounts(id,user_id);
alter table public.agency_whatsapp_messages drop constraint agency_whatsapp_messages_user_id_provider_message_id_key;
alter table public.agency_whatsapp_messages add constraint whatsapp_message_account_provider unique(user_id,account_id,provider_message_id);
create index whatsapp_message_account_history on public.agency_whatsapp_messages(user_id,account_id,phone_key,created_at desc);
alter table public.agency_whatsapp_chats add column account_id uuid;
alter table public.agency_whatsapp_chats add constraint whatsapp_chat_account_owner foreign key(account_id,user_id) references public.agency_whatsapp_accounts(id,user_id);
-- A surrogate key retains every legacy directory entry without attaching it to a number.
alter table public.agency_whatsapp_chats add column id uuid not null default gen_random_uuid();
alter table public.agency_whatsapp_chats drop constraint agency_whatsapp_chats_pkey;
alter table public.agency_whatsapp_chats add primary key(id);
alter table public.agency_whatsapp_chats add constraint whatsapp_chat_account_key unique(user_id,account_id,chat_key);
drop policy whatsapp_messages_owner on public.agency_whatsapp_messages;
create policy whatsapp_messages_active_account on public.agency_whatsapp_messages for select to authenticated using(user_id=(select auth.uid()) and account_id=(select public.agency_active_whatsapp_account()));
drop policy agency_whatsapp_chat_owner on public.agency_whatsapp_chats;
create policy whatsapp_chats_active_account on public.agency_whatsapp_chats for all to authenticated using(user_id=(select auth.uid()) and account_id=(select public.agency_active_whatsapp_account())) with check(user_id=(select auth.uid()) and account_id=(select public.agency_active_whatsapp_account()));
grant insert(account_id) on public.agency_whatsapp_chats to authenticated;
alter table public.agency_pipeline_cards add column whatsapp_account_id uuid;
alter table public.agency_pipeline_cards add constraint whatsapp_card_account_owner foreign key(whatsapp_account_id,user_id) references public.agency_whatsapp_accounts(id,user_id);
create table public.agency_whatsapp_lead_links(user_id uuid not null,account_id uuid not null,phone_key text not null,card_id uuid not null references public.agency_pipeline_cards(id) on delete restrict,primary key(user_id,account_id,phone_key),foreign key(account_id,user_id) references public.agency_whatsapp_accounts(id,user_id));
alter table public.agency_whatsapp_lead_links enable row level security;
create policy whatsapp_lead_links_owner on public.agency_whatsapp_lead_links for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.agency_whatsapp_accounts a where a.id=account_id and a.user_id=(select auth.uid())) and exists(select 1 from public.agency_pipeline_cards c where c.id=card_id and c.user_id=(select auth.uid()) and c.whatsapp_account_id=account_id));
revoke all on public.agency_whatsapp_lead_links from public,anon;
grant select,insert on public.agency_whatsapp_lead_links to authenticated;
grant select,insert,update on public.agency_whatsapp_lead_links to service_role;
create function public.agency_whatsapp_ensure_lead(p_user_id uuid,p_account_id uuid,p_phone text,p_name text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_key text:=public.agency_whatsapp_phone_key(p_phone);v_card uuid;v_pipeline uuid;v_stage uuid;v_name text;v_pos integer:=0;
begin
 if p_phone like '%@g.us' or p_account_id is null then return null;end if;
 if not exists(select 1 from public.agency_whatsapp_accounts where id=p_account_id and user_id=p_user_id) then raise exception 'Conta WhatsApp inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_account_id::text||v_key,0));
 select card_id into v_card from public.agency_whatsapp_lead_links where user_id=p_user_id and account_id=p_account_id and phone_key=v_key;
 if v_card is not null then return v_card;end if;
 select c.id into v_card from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=p_user_id and p.area='comercial' and c.whatsapp_phone_key=v_key and (c.whatsapp_account_id=p_account_id or c.whatsapp_account_id is null) order by c.whatsapp_account_id nulls last,c.updated_at desc limit 1;
 if v_card is null then
  select id into v_pipeline from public.agency_pipelines where user_id=p_user_id and area='comercial' order by created_at,id limit 1;
  if v_pipeline is null then
   insert into public.agency_pipelines(user_id,area,name) values(p_user_id,'comercial','Comercial') returning id into v_pipeline;
   foreach v_name in array array['Novo contato','Em conversa','Reunião','Proposta','Ganho','Perdido'] loop
    insert into public.agency_pipeline_stages(user_id,pipeline_id,name,position,color,outcome) values(p_user_id,v_pipeline,v_name,v_pos,'#8b5cf6',case when v_name='Ganho' then 'won' when v_name='Perdido' then 'lost' else 'in_progress' end);v_pos:=v_pos+1;
   end loop;
  end if;
  select id into v_stage from public.agency_pipeline_stages where pipeline_id=v_pipeline order by position,id limit 1;
  if v_stage is null then return null;end if;
  insert into public.agency_pipeline_cards(user_id,pipeline_id,stage_id,title,phone,whatsapp_account_id) values(p_user_id,v_pipeline,v_stage,coalesce(nullif(trim(p_name),''),p_phone),p_phone,p_account_id) returning id into v_card;
 else update public.agency_pipeline_cards set whatsapp_account_id=p_account_id where id=v_card and whatsapp_account_id is null;
 end if;
 insert into public.agency_whatsapp_lead_links(user_id,account_id,phone_key,card_id) values(p_user_id,p_account_id,v_key,v_card) on conflict do nothing;
 return v_card;
end;$$;
revoke all on function public.agency_whatsapp_ensure_lead(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.agency_whatsapp_ensure_lead(uuid,uuid,text,text) to service_role;
create or replace function public.agency_whatsapp_update_card() returns trigger language plpgsql security invoker set search_path='' as $$
declare latest_direction text;v_card uuid;
begin
 if new.account_id is not null and new.phone not like '%@g.us' and new.status in('recebido','enviado') and new.duplicate_of is null then
  v_card:=public.agency_whatsapp_ensure_lead(new.user_id,new.account_id,new.phone,new.contact_name);
  select direction into latest_direction from public.agency_whatsapp_messages where user_id=new.user_id and account_id=new.account_id and phone_key=new.phone_key and status in('recebido','enviado') and duplicate_of is null order by created_at desc,id desc limit 1;
  update public.agency_pipeline_cards set contact_status=case when latest_direction='entrada' then 'aguardando_agencia' else 'aguardando_cliente' end where id=v_card and whatsapp_account_id=new.account_id;
 end if;return new;
end;$$;
create function public.agency_card_whatsapp_account() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.whatsapp_account_id is null and exists(select 1 from public.agency_pipelines where id=new.pipeline_id and area='comercial') then
  select account_id into new.whatsapp_account_id from public.agency_whatsapp_account_state where user_id=new.user_id and connected and checked_at>now()-interval '90 seconds';
 end if;return new;end;$$;
revoke all on function public.agency_card_whatsapp_account() from public,anon,authenticated;
create trigger agency_card_whatsapp_account before insert on public.agency_pipeline_cards for each row execute function public.agency_card_whatsapp_account();
create or replace function public.agency_whatsapp_mark_read(p_address text) returns void language plpgsql security invoker set search_path='' as $$declare v_account uuid:=public.agency_active_whatsapp_account();begin
 if auth.uid() is null or v_account is null then return;end if;
 insert into public.agency_whatsapp_chats(user_id,account_id,chat_key,address,read_at) values(auth.uid(),v_account,public.agency_whatsapp_phone_key(p_address),p_address,now()) on conflict(user_id,account_id,chat_key) do update set read_at=now();
end;$$;
create function public.agency_whatsapp_account_metadata(p_user_id uuid,p_account_id uuid,p_address text,p_name text,p_source text,p_group boolean) returns void language plpgsql security invoker set search_path='' as $$begin
 insert into public.agency_whatsapp_chats(user_id,account_id,chat_key,address,name,name_source,is_group) values(p_user_id,p_account_id,public.agency_whatsapp_phone_key(p_address),p_address,nullif(left(trim(p_name),200),''),p_source,p_group)
 on conflict(user_id,account_id,chat_key) do update set address=excluded.address,is_group=excluded.is_group,name=case when excluded.name is not null and (excluded.name_source in('contact','group') or public.agency_whatsapp_chats.name_source='push') then excluded.name else public.agency_whatsapp_chats.name end,name_source=case when excluded.name is not null and (excluded.name_source in('contact','group') or public.agency_whatsapp_chats.name_source='push') then excluded.name_source else public.agency_whatsapp_chats.name_source end,updated_at=now();
end;$$;
revoke all on function public.agency_whatsapp_account_metadata(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.agency_whatsapp_account_metadata(uuid,uuid,text,text,text,boolean) to service_role;
-- Old metadata RPC is retained for legacy imports, never used by active-account ingestion.
create or replace function public.agency_whatsapp_chat_metadata(p_user_id uuid,p_address text,p_name text,p_source text,p_group boolean) returns void language plpgsql security invoker set search_path='' as $$begin
 update public.agency_whatsapp_chats set name=coalesce(nullif(p_name,''),name) where user_id=p_user_id and account_id is null and chat_key=public.agency_whatsapp_phone_key(p_address);
 if not found then insert into public.agency_whatsapp_chats(user_id,chat_key,address,name,name_source,is_group) values(p_user_id,public.agency_whatsapp_phone_key(p_address),p_address,p_name,p_source,p_group);end if;
end;$$;
create table public.agency_whatsapp_mirror_events(message_id uuid primary key references public.agency_whatsapp_messages(id) on delete restrict,user_id uuid not null references auth.users(id),account_id uuid not null references public.agency_whatsapp_accounts(id),payload jsonb not null,delivered_at timestamptz,created_at timestamptz not null default now());
alter table public.agency_whatsapp_mirror_events enable row level security;
revoke all on public.agency_whatsapp_mirror_events from public,anon,authenticated;
grant select,insert,update on public.agency_whatsapp_mirror_events to service_role;
create table public.agency_whatsapp_unattributed_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),payload jsonb not null,created_at timestamptz not null default now());
alter table public.agency_whatsapp_unattributed_events enable row level security;
revoke all on public.agency_whatsapp_unattributed_events from public,anon,authenticated;
grant select,insert on public.agency_whatsapp_unattributed_events to service_role;
create index whatsapp_mirror_pending on public.agency_whatsapp_mirror_events(user_id) where delivered_at is null;
create index whatsapp_lead_link_card on public.agency_whatsapp_lead_links(card_id);
create index whatsapp_unattributed_owner on public.agency_whatsapp_unattributed_events(user_id);
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.agency_whatsapp_account_state;alter publication supabase_realtime add table public.agency_pipeline_cards;end if;end;$$;

create or replace function public.agency_confirm_whatsapp_send(p_user_id uuid,p_id uuid,p_provider_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare echo uuid;v_account uuid;
begin
 select account_id into v_account from public.agency_whatsapp_messages where id=p_id and user_id=p_user_id;
 begin
  update public.agency_whatsapp_messages set status='enviado',provider_message_id=p_provider_id where id=p_id and user_id=p_user_id;
 exception when unique_violation then
  select id into echo from public.agency_whatsapp_messages where user_id=p_user_id and account_id=v_account and provider_message_id=p_provider_id;
  if echo is null then raise; end if;
  update public.agency_whatsapp_messages set status='enviado',duplicate_of=echo where id=p_id and user_id=p_user_id;
 end;
end; $$;
revoke all on function public.agency_confirm_whatsapp_send(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.agency_confirm_whatsapp_send(uuid,uuid,text) to service_role;
grant select,insert,update on public.agency_pipelines,public.agency_pipeline_stages,public.agency_pipeline_cards to service_role;
alter table public.agency_whatsapp_connections add column active_account_id uuid references public.agency_whatsapp_accounts(id);
drop trigger agency_whatsapp_update_card on public.agency_whatsapp_messages;
create trigger agency_whatsapp_update_card after insert or update of status,account_id on public.agency_whatsapp_messages for each row execute function public.agency_whatsapp_update_card();

create or replace function public.agency_whatsapp_inbox_v2(p_search text default '',p_offset integer default 0,p_filter text default 'all')
returns jsonb language sql stable security invoker set search_path='' as $$
 with latest as(select distinct on(m.phone_key) m.* from public.agency_whatsapp_messages m where m.user_id=(select auth.uid()) and m.account_id=(select public.agency_active_whatsapp_account()) and m.duplicate_of is null order by m.phone_key,m.created_at desc,m.id desc),
 contacts as(select m.phone_key,m.phone,m.body,m.direction,m.status,m.created_at,
 coalesce(nullif(ch.name,''),(select nullif(n.contact_name,'') from public.agency_whatsapp_messages n where n.user_id=m.user_id and n.account_id=m.account_id and n.phone_key=m.phone_key and n.contact_name is not null order by n.created_at desc limit 1),(select c.title from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=(select auth.uid()) and p.area='comercial' and c.whatsapp_phone_key=m.phone_key and (c.whatsapp_account_id=m.account_id or c.whatsapp_account_id is null) order by c.updated_at desc limit 1),m.phone) name,
 (m.phone like '%@g.us') is_group,
 case when m.phone not like '%@g.us' then (select c.id from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=(select auth.uid()) and p.area='comercial' and c.whatsapp_phone_key=m.phone_key and (c.whatsapp_account_id=m.account_id or c.whatsapp_account_id is null) order by c.updated_at desc limit 1) else null end card_id,
 (select count(*)::int from public.agency_whatsapp_messages n where n.user_id=m.user_id and n.account_id=m.account_id and n.phone_key=m.phone_key and n.direction='entrada' and n.duplicate_of is null and n.created_at>coalesce(ch.read_at,'-infinity'::timestamptz)) unread_count
 from latest m left join public.agency_whatsapp_chats ch on ch.user_id=m.user_id and ch.account_id=m.account_id and ch.chat_key=m.phone_key),
 all_contacts as(select * from contacts union all select ch.chat_key,ch.address,''::text,''::text,''::text,null::timestamptz,coalesce(ch.name,'Grupo do WhatsApp'),true,null::uuid,0::integer from public.agency_whatsapp_chats ch where ch.user_id=(select auth.uid()) and ch.account_id=(select public.agency_active_whatsapp_account()) and ch.is_group and not exists(select 1 from latest m where m.phone_key=ch.chat_key)),
 filtered as(select * from all_contacts where p_filter='all' or p_filter='groups' and is_group or p_filter='unread' and unread_count>0 or p_filter='crm' and card_id is not null or p_filter='outside' and card_id is null),
 page as(select * from filtered where name ilike '%'||left(coalesce(p_search,''),100)||'%' or phone like '%'||left(coalesce(p_search,''),100)||'%' or body ilike '%'||left(coalesce(p_search,''),100)||'%' order by created_at desc nulls last,phone_key limit 51 offset greatest(0,least(coalesce(p_offset,0),100000)))
 select coalesce(jsonb_agg((to_jsonb(page)||jsonb_build_object('account_id',public.agency_active_whatsapp_account())) order by created_at desc nulls last,phone_key),'[]') from page;
$$;
