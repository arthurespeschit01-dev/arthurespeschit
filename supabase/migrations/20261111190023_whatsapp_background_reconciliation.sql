create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('agency-whatsapp-reconcile','* * * * *', $job$
 select net.http_post(
  url:='https://dycyskikaljvokaxsxnh.supabase.co/functions/v1/agency-whatsapp?reconcile='||webhook_secret,
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:='{}'::jsonb,timeout_milliseconds:=110000
 ) from public.agency_whatsapp_connections where bridge_url is not null and receiving_enabled=true;
$job$);
