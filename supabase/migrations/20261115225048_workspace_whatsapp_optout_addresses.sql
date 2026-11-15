-- Preserve opaque WhatsApp LID addresses when enforcing campaign opt-outs.
create or replace function public.agency_workspace_whatsapp_optout(p_workspace uuid,p_phone text,p_mark boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$begin
 if not public.agency_workspace_available(p_workspace) then raise exception 'Subconta indisponível.';end if;
 if p_phone!~'^(?:[0-9]{10,15}|[0-9]{5,40}@lid)$' then return false;end if;
 if p_mark then insert into agency_private.workspace_whatsapp_optouts(workspace_id,phone) values(p_workspace,p_phone) on conflict do nothing;end if;
 return exists(select 1 from agency_private.workspace_whatsapp_optouts where workspace_id=p_workspace and phone=p_phone);
end;$$;
