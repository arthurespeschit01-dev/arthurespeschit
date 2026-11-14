-- Workspace-only capabilities. No legacy provider or agency job is changed.
select cron.schedule('pilot-workspace-providers','* * * * *',$job$
 select net.http_post(url:='https://dycyskikaljvokaxsxnh.supabase.co/functions/v1/workspace-operations?provider_worker='||c.worker_secret,headers:='{"Content-Type":"application/json"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=55000)
 from (select distinct on (p.workspace_id) p.workspace_id,p.worker_secret from agency_private.workspace_providers p join public.agency_client_workspaces w on w.id=p.workspace_id and w.status='active' join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled where p.enabled order by p.workspace_id,p.kind) c
 where exists(select 1 from public.agency_workspace_action_outbox o where o.workspace_id=c.workspace_id and o.status in ('queued','sending'));
$job$);
select cron.schedule('pilot-workspace-whatsapp-actions','* * * * *',$job$
 select net.http_post(url:='https://dycyskikaljvokaxsxnh.supabase.co/functions/v1/workspace-operations?worker='||c.worker_secret,headers:='{"Content-Type":"application/json"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=55000)
 from agency_private.workspace_whatsapp c join public.agency_client_workspaces w on w.id=c.workspace_id and w.status='active' join agency_private.pilot_accounts a on a.user_id=w.owner_user_id and a.enabled
 where c.enabled and exists(select 1 from public.agency_workspace_action_outbox o where o.workspace_id=c.workspace_id and o.status in ('queued','sending'));
$job$);
