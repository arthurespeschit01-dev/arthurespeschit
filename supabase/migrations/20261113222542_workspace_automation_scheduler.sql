-- Durable timers and external delivery continue with all browsers closed.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('pilot-workspace-automations','* * * * *',$job$
 select agency_private.process_workspace_flows(null,30);
$job$);
select cron.schedule('pilot-workspace-outbox','* * * * *',$job$
 select net.http_post(
  url:='https://dycyskikaljvokaxsxnh.supabase.co/functions/v1/workspace-operations?worker='||c.worker_secret,
  headers:='{"Content-Type":"application/json"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=55000
 ) from agency_private.workspace_whatsapp c join public.agency_client_workspaces w on w.id=c.workspace_id and w.status='active' join agency_private.pilot_accounts p on p.user_id=w.owner_user_id and p.enabled
 where c.enabled and (exists(select 1 from public.agency_workspace_message_outbox o where o.workspace_id=c.workspace_id and o.status in ('queued','sending')));
$job$);
select cron.schedule('pilot-workspace-google','* * * * *',$job$
 select net.http_post(
  url:='https://dycyskikaljvokaxsxnh.supabase.co/functions/v1/workspace-operations?google_worker='||c.worker_secret,
  headers:='{"Content-Type":"application/json"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=55000
 ) from agency_private.workspace_google c join public.agency_client_workspaces w on w.id=c.workspace_id and w.status='active' join agency_private.pilot_accounts p on p.user_id=w.owner_user_id and p.enabled
 where exists(select 1 from public.agency_workspace_appointments a where a.workspace_id=c.workspace_id and (a.google_synced_at is null or a.google_synced_at<a.updated_at));
$job$);
