alter table public.agency_whatsapp_connections add column directory_warning text;
create or replace function public.agency_whatsapp_inbox_v2(p_search text default '',p_offset integer default 0,p_filter text default 'all')
returns jsonb language sql stable security invoker set search_path='' as $$
 with latest as(select distinct on(m.phone_key) m.* from public.agency_whatsapp_messages m where m.user_id=(select auth.uid()) and m.duplicate_of is null order by m.phone_key,m.created_at desc,m.id desc),
 contacts as(select m.phone_key,m.phone,m.body,m.direction,m.status,m.created_at,
 coalesce(nullif(ch.name,''),(select nullif(n.contact_name,'') from public.agency_whatsapp_messages n where n.user_id=m.user_id and n.phone_key=m.phone_key and n.contact_name is not null order by n.created_at desc limit 1),(select c.title from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=(select auth.uid()) and p.area='comercial' and c.whatsapp_phone_key=m.phone_key order by c.updated_at desc limit 1),m.phone) name,
 (m.phone like '%@g.us') is_group,
 case when m.phone not like '%@g.us' then (select c.id from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=(select auth.uid()) and p.area='comercial' and c.whatsapp_phone_key=m.phone_key order by c.updated_at desc limit 1) else null end card_id,
 (select count(*)::int from public.agency_whatsapp_messages n where n.user_id=m.user_id and n.phone_key=m.phone_key and n.direction='entrada' and n.duplicate_of is null and n.created_at>coalesce(ch.read_at,'-infinity'::timestamptz)) unread_count
 from latest m left join public.agency_whatsapp_chats ch on ch.user_id=m.user_id and ch.chat_key=m.phone_key),
 all_contacts as(select * from contacts union all select ch.chat_key,ch.address,''::text,''::text,''::text,null::timestamptz,coalesce(ch.name,'Grupo do WhatsApp'),true,null::uuid,0::integer from public.agency_whatsapp_chats ch where ch.user_id=(select auth.uid()) and ch.is_group and not exists(select 1 from latest m where m.phone_key=ch.chat_key)),
 filtered as(select * from all_contacts where p_filter='all' or p_filter='groups' and is_group or p_filter='unread' and unread_count>0 or p_filter='crm' and card_id is not null or p_filter='outside' and card_id is null),
 page as(select * from filtered where name ilike '%'||left(coalesce(p_search,''),100)||'%' or phone like '%'||left(coalesce(p_search,''),100)||'%' or body ilike '%'||left(coalesce(p_search,''),100)||'%' order by created_at desc nulls last,phone_key limit 51 offset greatest(0,least(coalesce(p_offset,0),100000)))
 select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc nulls last,phone_key),'[]') from page;
$$;
revoke all on function public.agency_whatsapp_inbox_v2(text,integer,text) from public,anon;
grant execute on function public.agency_whatsapp_inbox_v2(text,integer,text) to authenticated;
