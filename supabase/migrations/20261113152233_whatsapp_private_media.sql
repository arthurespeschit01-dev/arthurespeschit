insert into storage.buckets(id,name,public,file_size_limit) values('agency-whatsapp-media','agency-whatsapp-media',false,33554432) on conflict(id) do nothing;
create table public.agency_whatsapp_media(message_id uuid primary key references public.agency_whatsapp_messages(id) on delete cascade,user_id uuid not null references auth.users(id),account_id uuid not null,descriptor jsonb,storage_path text,mime text,name text,bytes bigint,state text not null default 'pending',last_error text,attempted_at timestamptz,created_at timestamptz not null default now(),foreign key(account_id,user_id) references public.agency_whatsapp_accounts(id,user_id));
alter table public.agency_whatsapp_media enable row level security;
revoke all on public.agency_whatsapp_media from public,anon,authenticated;
grant select,insert,update on public.agency_whatsapp_media to service_role;
create index whatsapp_media_pending on public.agency_whatsapp_media(user_id,account_id,attempted_at) where storage_path is null;
create function public.agency_enqueue_media(p_user uuid,p_account uuid) returns void language sql security invoker set search_path='' as $$
 insert into public.agency_whatsapp_media(message_id,user_id,account_id) select id,user_id,account_id from public.agency_whatsapp_messages where user_id=p_user and account_id=p_account and kind<>'texto' and duplicate_of is null on conflict(message_id) do nothing;
$$;
revoke all on function public.agency_enqueue_media(uuid,uuid) from public,anon,authenticated;
grant execute on function public.agency_enqueue_media(uuid,uuid) to service_role;
insert into public.agency_whatsapp_media(message_id,user_id,account_id) select id,user_id,account_id from public.agency_whatsapp_messages where account_id is not null and kind<>'texto' and duplicate_of is null on conflict(message_id) do nothing;
