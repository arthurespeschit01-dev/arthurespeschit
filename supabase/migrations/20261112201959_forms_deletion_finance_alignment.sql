-- No rows are changed by this migration. Alignments happen on the owner's monthly query.
alter table public.mensalidades add column original_amount numeric,add column fee_adjusted_at timestamptz;
create or replace function public.ensure_agency_monthly_invoices(p_month date) returns setof public.mensalidades language plpgsql security invoker set search_path='' as $$
declare month_start date:=date_trunc('month',p_month)::date;month_end date:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 if p_month is null then raise exception 'Informe o mês';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||month_start::text,0));
 -- Only open current/future invoices follow the current fee. Keep paid and past debts intact.
 if month_start>=date_trunc('month',today)::date then
  update public.mensalidades m set original_amount=coalesce(m.original_amount,m.valor),fee_adjusted_at=now(),valor=c.monthly_fee
  from public.clients c where m.cliente_id=c.id and m.user_id=auth.uid() and c.user_id=auth.uid()
   and c.status='Ativo' and c.monthly_fee>=0 and m.status<>'pago' and m.vencimento between month_start and month_end and m.valor is distinct from c.monthly_fee;
 end if;

 insert into public.mensalidades(user_id,cliente_id,valor,vencimento,status)
 select auth.uid(),c.id,c.monthly_fee,d.due_date,case when d.due_date<today then 'atrasado' else 'pendente' end
 from public.clients c cross join lateral(select case when c.first_payment_date between month_start and month_end then c.first_payment_date else month_start+least(greatest(1,least(31,coalesce(c.payment_day,5))),extract(day from month_end)::int)-1 end due_date)d
 where c.user_id=auth.uid() and c.status='Ativo' and c.monthly_fee>0
 and (coalesce(c.first_payment_date,c.entry_date) is null or d.due_date>=coalesce(c.first_payment_date,c.entry_date))
 and not exists(select 1 from public.mensalidades m where m.cliente_id=c.id and m.user_id=auth.uid() and m.vencimento between month_start and month_end)
 on conflict(cliente_id,vencimento) do nothing;
 return query select * from public.mensalidades where user_id=auth.uid() and vencimento between month_start and month_end order by vencimento,id;
end;$$;
revoke all on function public.ensure_agency_monthly_invoices(date) from public,anon;
grant execute on function public.ensure_agency_monthly_invoices(date) to authenticated;


-- Explicit, owner-scoped, atomic deletion. The UI always requests confirmation.
grant delete on public.transacoes,public.agency_forms,public.agency_form_responses,public.agency_appointments,public.agency_tickets,public.agency_ticket_messages,public.agency_whatsapp_lead_links to authenticated;
create policy response_delete_owner on public.agency_form_responses for delete to authenticated using(user_id=(select auth.uid()));
create policy ticket_message_delete_owner on public.agency_ticket_messages for delete to authenticated using(user_id=(select auth.uid()));
create function public.agency_delete_item(p_kind text,p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare child record;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 case p_kind
 when 'form' then
  perform 1 from public.agency_forms where id=p_id and user_id=auth.uid() for update;if not found then raise exception 'Formulário indisponível';end if;
  delete from public.agency_form_responses where form_id=p_id and user_id=auth.uid();
  delete from public.agency_forms where id=p_id and user_id=auth.uid();
 when 'response' then delete from public.agency_form_responses where id=p_id and user_id=auth.uid();if not found then raise exception 'Resposta indisponível';end if;
 when 'appointment' then delete from public.agency_appointments where id=p_id and user_id=auth.uid();if not found then raise exception 'Agendamento indisponível';end if;
 when 'ticket' then delete from public.agency_tickets where id=p_id and user_id=auth.uid();if not found then raise exception 'Chamado indisponível';end if;
 when 'transaction' then delete from public.transacoes where id=p_id and user_id=auth.uid();if not found then raise exception 'Lançamento indisponível';end if;
 when 'card' then
  perform 1 from public.agency_pipeline_cards where id=p_id and user_id=auth.uid() for update;if not found then raise exception 'Card indisponível';end if;
  update public.agency_client_progress set card_id=null where card_id=p_id and user_id=auth.uid();
  delete from public.agency_whatsapp_lead_links where card_id=p_id and user_id=auth.uid();
  delete from public.agency_pipeline_cards where id=p_id and user_id=auth.uid();
 when 'pipeline' then
  perform 1 from public.agency_pipelines where id=p_id and user_id=auth.uid() for update;if not found then raise exception 'Pipeline indisponível';end if;
  for child in select id from public.agency_pipeline_cards where pipeline_id=p_id and user_id=auth.uid() loop perform public.agency_delete_item('card',child.id);end loop;
  delete from public.agency_pipeline_stages where pipeline_id=p_id and user_id=auth.uid();
  delete from public.agency_pipelines where id=p_id and user_id=auth.uid();
 else raise exception 'Tipo de registro inválido';
 end case;
end;$$;
revoke all on function public.agency_delete_item(text,uuid) from public,anon;
grant execute on function public.agency_delete_item(text,uuid) to authenticated;
