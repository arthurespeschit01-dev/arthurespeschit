-- Preserve existing rows; group addresses retain their WhatsApp identity.
alter table public.agency_whatsapp_messages drop constraint agency_whatsapp_messages_phone_check;
alter table public.agency_whatsapp_messages add constraint agency_whatsapp_messages_phone_check check(phone ~ '^[0-9]{10,15}$' or phone ~ '^[0-9-]{5,40}@g[.]us$');
create or replace function public.agency_whatsapp_phone_key(value text) returns text
language sql immutable security invoker set search_path='' as $$
 select case when value ~ '^[0-9-]{5,40}@g[.]us$' then value else
 (with digits as(select regexp_replace(coalesce(value,''),'[^0-9]','','g') n),complete as(select case when length(n) in(10,11) then '55'||n else n end n from digits)
 select case when n ~ '^55[0-9]{10,11}$' then substring(n from 3 for 2)||right(n,8) else n end from complete) end;
$$;
alter table public.agency_whatsapp_messages add column sender_name text;
alter table public.agency_whatsapp_connections add column reconciled_at timestamptz,add column directory_synced_at timestamptz,add column sync_error text,add column sync_lease_until timestamptz;
create table public.agency_whatsapp_chats(
 user_id uuid not null references auth.users(id) on delete cascade,
 chat_key text not null, address text not null,
 name text, name_source text not null default 'push' check(name_source in('push','contact','group')),
 is_group boolean not null default false, read_at timestamptz,
 updated_at timestamptz not null default now(), primary key(user_id,chat_key)
);
alter table public.agency_whatsapp_chats enable row level security;
create policy agency_whatsapp_chat_owner on public.agency_whatsapp_chats for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
revoke all on public.agency_whatsapp_chats from public,anon,authenticated;
grant select on public.agency_whatsapp_chats to authenticated;
grant insert(user_id,chat_key,address,read_at),update(read_at) on public.agency_whatsapp_chats to authenticated;
grant select,insert,update on public.agency_whatsapp_chats to service_role;
create function public.agency_whatsapp_chat_metadata(p_user_id uuid,p_address text,p_name text,p_source text,p_group boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.agency_whatsapp_chats(user_id,chat_key,address,name,name_source,is_group)
 values(p_user_id,public.agency_whatsapp_phone_key(p_address),p_address,nullif(left(trim(p_name),200),''),p_source,p_group)
 on conflict(user_id,chat_key) do update set address=excluded.address,is_group=excluded.is_group,
 name=case when excluded.name is not null and (excluded.name_source in('contact','group') or public.agency_whatsapp_chats.name_source='push') then excluded.name else public.agency_whatsapp_chats.name end,
 name_source=case when excluded.name is not null and (excluded.name_source in('contact','group') or public.agency_whatsapp_chats.name_source='push') then excluded.name_source else public.agency_whatsapp_chats.name_source end,updated_at=now();
end; $$;
revoke all on function public.agency_whatsapp_chat_metadata(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.agency_whatsapp_chat_metadata(uuid,text,text,text,boolean) to service_role;
create function public.agency_whatsapp_mark_read(p_address text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 insert into public.agency_whatsapp_chats(user_id,chat_key,address,read_at) values(auth.uid(),public.agency_whatsapp_phone_key(p_address),p_address,now())
 on conflict(user_id,chat_key) do update set read_at=now();
end; $$;
revoke all on function public.agency_whatsapp_mark_read(text) from public,anon;
grant execute on function public.agency_whatsapp_mark_read(text) to authenticated;
create or replace function public.agency_whatsapp_inbox(p_search text default '',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 with latest as(select distinct on(m.phone_key) m.* from public.agency_whatsapp_messages m where m.user_id=(select auth.uid()) and m.duplicate_of is null order by m.phone_key,m.created_at desc,m.id desc),
 contacts as(select m.phone_key,m.phone,m.body,m.direction,m.status,m.created_at,
 coalesce(nullif(ch.name,''),(select nullif(n.contact_name,'') from public.agency_whatsapp_messages n where n.user_id=m.user_id and n.phone_key=m.phone_key and n.contact_name is not null order by n.created_at desc limit 1),(select c.title from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=(select auth.uid()) and p.area='comercial' and c.whatsapp_phone_key=m.phone_key order by c.updated_at desc limit 1),m.phone) name,
 (m.phone like '%@g.us') is_group,
 case when m.phone not like '%@g.us' then (select c.id from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=(select auth.uid()) and p.area='comercial' and c.whatsapp_phone_key=m.phone_key order by c.updated_at desc limit 1) else null end card_id,
 (select count(*)::int from public.agency_whatsapp_messages n where n.user_id=m.user_id and n.phone_key=m.phone_key and n.direction='entrada' and n.duplicate_of is null and n.created_at>coalesce(ch.read_at,'-infinity'::timestamptz)) unread_count
 from latest m left join public.agency_whatsapp_chats ch on ch.user_id=m.user_id and ch.chat_key=m.phone_key),
 page as(select * from contacts where name ilike '%'||left(coalesce(p_search,''),100)||'%' or phone like '%'||left(coalesce(p_search,''),100)||'%' or body ilike '%'||left(coalesce(p_search,''),100)||'%' order by created_at desc,phone_key limit 51 offset greatest(0,least(coalesce(p_offset,0),100000)))
 select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,phone_key),'[]') from page;
$$;
-- Subscription delivery still applies each table's owner policy.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='agency_whatsapp_messages') then alter publication supabase_realtime add table public.agency_whatsapp_messages;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='agency_whatsapp_chats') then alter publication supabase_realtime add table public.agency_whatsapp_chats;end if;
 end if;
end;$$;
