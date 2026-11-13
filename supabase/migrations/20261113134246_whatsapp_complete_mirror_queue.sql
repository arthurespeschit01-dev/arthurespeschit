-- A transactional outbox covers all content, including provider-log recovery.
-- This trigger has no network access and never sends a WhatsApp message.
create function public.agency_whatsapp_enqueue_mirror() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and auth.uid()<>new.user_id then raise exception 'Invalid message owner';end if;
 insert into public.agency_whatsapp_mirror_events(message_id,user_id,account_id,payload)
 select new.id,new.user_id,a.id,jsonb_build_object('central_id',new.id,'provider_id',coalesce(new.provider_message_id,'central:'||new.id),'source_number',a.phone,'phone',new.phone,'body',new.body,'kind',new.kind,'direction',new.direction,'contact_name',new.contact_name,'created_at',new.created_at)
 from public.agency_whatsapp_accounts a join public.agency_whatsapp_connections c on c.user_id=a.user_id
 where a.id=new.account_id and a.user_id=new.user_id and c.bridge_url='https://vertice-gmn.vercel.app/api/central-whatsapp' and new.status in ('enviado','recebido')
 on conflict(message_id) do nothing;
 return null;
end;$$;
revoke all on function public.agency_whatsapp_enqueue_mirror() from public,anon,authenticated;
grant execute on function public.agency_whatsapp_enqueue_mirror() to service_role;
create trigger agency_whatsapp_enqueue_mirror after insert or update of account_id,status on public.agency_whatsapp_messages for each row execute function public.agency_whatsapp_enqueue_mirror();
-- Replay only history with a verified owner and sender account. Existing rows,
-- previous receipts and unknown-sender history remain untouched.
insert into public.agency_whatsapp_mirror_events(message_id,user_id,account_id,payload)
select m.id,m.user_id,a.id,jsonb_build_object('central_id',m.id,'provider_id',coalesce(m.provider_message_id,'central:'||m.id),'source_number',a.phone,'phone',m.phone,'body',m.body,'kind',m.kind,'direction',m.direction,'contact_name',m.contact_name,'created_at',m.created_at)
from public.agency_whatsapp_messages m join public.agency_whatsapp_accounts a on a.id=m.account_id and a.user_id=m.user_id join public.agency_whatsapp_connections c on c.user_id=m.user_id
where c.bridge_url='https://vertice-gmn.vercel.app/api/central-whatsapp' and m.status in ('enviado','recebido')
on conflict(message_id) do nothing;
