-- Preserve existing rows; group addresses retain their WhatsApp identity.
alter table public.agency_whatsapp_messages drop constraint agency_whatsapp_messages_phone_check;
alter table public.agency_whatsapp_messages add constraint agency_whatsapp_messages_phone_check check(phone ~ '^[0-9]{10,15}$' or phone ~ '^[0-9-]{5,40}@g[.]us$' or phone ~ '^[0-9]{5,40}@lid$');
create or replace function public.agency_whatsapp_phone_key(value text) returns text
language sql immutable security invoker set search_path='' as $$
 select case when value ~ '^[0-9-]{5,40}@g[.]us$' or value ~ '^[0-9]{5,40}@lid$' then value else
 (with digits as(select regexp_replace(coalesce(value,''),'[^0-9]','','g') n),complete as(select case when length(n) in(10,11) then '55'||n else n end n from digits)
 select case when n ~ '^55[0-9]{10,11}$' then substring(n from 3 for 2)||right(n,8) else n end from complete) end;
$$;
