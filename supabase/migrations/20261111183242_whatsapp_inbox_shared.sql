-- Additive inbox metadata; existing credentials and message records remain intact.
alter table public.agency_whatsapp_connections add column bridge_url text, add column last_webhook_at timestamptz;
alter table public.agency_whatsapp_messages add column contact_name text;
create index agency_whatsapp_inbox_lookup on public.agency_whatsapp_messages(user_id,created_at desc,id desc);
alter table public.agency_whatsapp_messages add column duplicate_of uuid references public.agency_whatsapp_messages(id) on delete restrict;
create function public.agency_whatsapp_inbox(p_search text default '',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 with latest as (
  select distinct on(m.phone_key) m.* from public.agency_whatsapp_messages m
  where m.user_id=(select auth.uid()) and m.duplicate_of is null order by m.phone_key,m.created_at desc,m.id desc
 ), contacts as (
  select m.phone_key,m.phone,m.body,m.direction,m.status,m.created_at,
  coalesce(nullif(m.contact_name,''),(select nullif(c.title,'') from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=(select auth.uid()) and p.area='comercial' and c.whatsapp_phone_key=m.phone_key order by c.updated_at desc limit 1),m.phone) as name,
  (select c.id from public.agency_pipeline_cards c join public.agency_pipelines p on p.id=c.pipeline_id where c.user_id=(select auth.uid()) and p.area='comercial' and c.whatsapp_phone_key=m.phone_key order by c.updated_at desc limit 1) as card_id
  from latest m
 ), page as (
  select * from contacts where name ilike '%'||left(coalesce(p_search,''),100)||'%' or phone like '%'||left(coalesce(p_search,''),100)||'%'
  order by created_at desc,phone_key limit 51 offset greatest(0,least(coalesce(p_offset,0),100000))
 ) select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,phone_key),'[]') from page;
$$;
revoke all on function public.agency_whatsapp_inbox(text,integer) from public,anon;
grant execute on function public.agency_whatsapp_inbox(text,integer) to authenticated;
create index agency_whatsapp_duplicate on public.agency_whatsapp_messages(duplicate_of);
create function public.agency_confirm_whatsapp_send(p_user_id uuid,p_id uuid,p_provider_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare echo uuid;
begin
 begin
  update public.agency_whatsapp_messages set status='enviado',provider_message_id=p_provider_id where id=p_id and user_id=p_user_id;
 exception when unique_violation then
  select id into echo from public.agency_whatsapp_messages where user_id=p_user_id and provider_message_id=p_provider_id;
  if echo is null then raise; end if;
  update public.agency_whatsapp_messages set status='enviado',duplicate_of=echo where id=p_id and user_id=p_user_id;
 end;
end; $$;
revoke all on function public.agency_confirm_whatsapp_send(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.agency_confirm_whatsapp_send(uuid,uuid,text) to service_role;
-- Imported older messages must not overwrite the latest conversation's response state.
create or replace function public.agency_whatsapp_update_card() returns trigger
language plpgsql security invoker set search_path='' as $$
declare latest_direction text;
begin
 if new.status in ('recebido','enviado') then
  select direction into latest_direction from public.agency_whatsapp_messages where user_id=new.user_id and phone_key=new.phone_key and status in ('recebido','enviado') and duplicate_of is null order by created_at desc,id desc limit 1;
  update public.agency_pipeline_cards set contact_status=case when latest_direction='entrada' then 'aguardando_agencia' else 'aguardando_cliente' end where user_id=new.user_id and whatsapp_phone_key=new.phone_key and pipeline_id in(select id from public.agency_pipelines where user_id=new.user_id and area='comercial');
 end if;
 return new;
end; $$;
