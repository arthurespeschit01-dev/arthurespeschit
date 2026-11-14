-- Disable/remove rules and disconnect numbers without replaying already-queued communications later.
create function agency_private.cancel_workspace_conversion_rule() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' or not new.enabled then update public.agency_workspace_action_outbox set status='cancelled',error='Regra desativada ou removida.',updated_at=now() where rule_id=old.id and workspace_id=old.workspace_id and status='queued';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function agency_private.cancel_workspace_conversion_rule() from public,anon,authenticated;
create trigger workspace_rule_cancel before update of enabled or delete on public.agency_workspace_conversion_rules for each row execute function agency_private.cancel_workspace_conversion_rule();
create function agency_private.cancel_disconnected_workspace_actions() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not new.enabled or old.active_account_id is distinct from new.active_account_id then
 update public.agency_workspace_action_outbox set status='cancelled',error='A conexão ou o número do WhatsApp foi alterado.',updated_at=now() where workspace_id=new.workspace_id and action in ('create_group','add_participants','send_event') and status='queued';
 update public.agency_workspace_message_outbox set status='cancelled',error='A conexão ou o número do WhatsApp foi alterado.',updated_at=now() where workspace_id=new.workspace_id and status='queued';
 update public.agency_workspace_flow_runs r set status='failed',error='O envio foi cancelado porque a conexão ou o número mudou.',finished_at=now() where r.workspace_id=new.workspace_id and r.status='waiting' and (exists(select 1 from public.agency_workspace_action_outbox a where a.run_id=r.id and a.status='cancelled' and a.error='A conexão ou o número do WhatsApp foi alterado.') or exists(select 1 from public.agency_workspace_message_outbox m where m.run_id=r.id and m.status='cancelled' and m.error='A conexão ou o número do WhatsApp foi alterado.'));
 end if;return new;
end;$$;
revoke all on function agency_private.cancel_disconnected_workspace_actions() from public,anon,authenticated;
create trigger workspace_connection_cancel after update of enabled,active_account_id on agency_private.workspace_whatsapp for each row execute function agency_private.cancel_disconnected_workspace_actions();
