-- Cadastro completo do cliente + cobrança automática no Asaas.
-- Tudo aditivo: colunas novas e anuláveis, nenhum valor existente é alterado.

-- 1) clients
alter table public.clients
  add column if not exists company_name text,
  add column if not exists cpf_cnpj text,
  add column if not exists email text,
  add column if not exists billing_email text,
  add column if not exists postal_code text,
  add column if not exists street text,
  add column if not exists address_number text,
  add column if not exists complement text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists contract_signed_at date,
  add column if not exists contract_months int,
  add column if not exists payment_model text default 'recorrente_mensal',
  add column if not exists media_fee_pct numeric,
  add column if not exists media_fee_min numeric,
  add column if not exists revenue_fee_pct numeric,
  add column if not exists revenue_fee_min numeric,
  add column if not exists setup_fee numeric,
  add column if not exists auto_billing boolean default false,
  add column if not exists billing_type text default 'UNDEFINED',
  add column if not exists fine_pct numeric default 2,
  add column if not exists interest_pct numeric default 1,
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists asaas_sync_status text,
  add column if not exists asaas_sync_error text;

alter table public.clients drop constraint if exists clients_payment_model_check;
alter table public.clients add constraint clients_payment_model_check
  check (payment_model is null or payment_model in ('recorrente_mensal','antecipado_contrato'));
alter table public.clients drop constraint if exists clients_billing_type_check;
alter table public.clients add constraint clients_billing_type_check
  check (billing_type is null or billing_type in ('PIX','BOLETO','CREDIT_CARD','UNDEFINED'));
alter table public.clients drop constraint if exists clients_asaas_sync_status_check;
alter table public.clients add constraint clients_asaas_sync_status_check
  check (asaas_sync_status is null or asaas_sync_status in ('ok','erro'));
alter table public.clients drop constraint if exists clients_contract_months_check;
alter table public.clients add constraint clients_contract_months_check
  check (contract_months is null or contract_months between 1 and 120);

-- Os campos do Asaas só podem ser alterados pelo servidor (funções asaas-sync/asaas-webhook)
create or replace function public.clients_asaas_guard() returns trigger
language plpgsql set search_path to '' as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') = 'service_role' or current_user in ('postgres','supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.asaas_customer_id := null; new.asaas_subscription_id := null;
    new.asaas_sync_status := null; new.asaas_sync_error := null;
  else
    new.asaas_customer_id := old.asaas_customer_id; new.asaas_subscription_id := old.asaas_subscription_id;
    new.asaas_sync_status := old.asaas_sync_status; new.asaas_sync_error := old.asaas_sync_error;
  end if;
  return new;
end $$;
drop trigger if exists clients_asaas_guard on public.clients;
create trigger clients_asaas_guard before insert or update on public.clients
  for each row execute function public.clients_asaas_guard();

-- 2) mensalidades
alter table public.mensalidades
  add column if not exists asaas_payment_id text,
  add column if not exists invoice_url text,
  add column if not exists billing_type text;
create unique index if not exists mensalidades_asaas_payment_id_key on public.mensalidades (asaas_payment_id);
-- Status novos para cobranças canceladas/estornadas no Asaas (os atuais continuam iguais)
alter table public.mensalidades drop constraint if exists mensalidades_status_check;
alter table public.mensalidades add constraint mensalidades_status_check
  check (status = any (array['pago','pendente','atrasado','cancelado','estornado']));

-- 3) transacoes: evita lançar duas vezes a mesma cobrança avulsa (setup)
alter table public.transacoes add column if not exists asaas_payment_id text;
create unique index if not exists transacoes_asaas_payment_id_key on public.transacoes (asaas_payment_id);

-- 4) Registro dos eventos recebidos do Asaas (auditoria e para não processar duas vezes)
create table if not exists public.asaas_webhook_eventos (
  id text primary key,
  evento text not null,
  payment_id text,
  cliente_id uuid,
  resultado text not null,
  detalhe text,
  recebido_em timestamptz not null default now()
);
alter table public.asaas_webhook_eventos enable row level security;
revoke all on public.asaas_webhook_eventos from anon, authenticated;

-- 5) Contrato pago antecipado não gera mensalidade mês a mês (o pagamento único vem do Asaas)
create or replace function public.ensure_agency_monthly_invoices(p_month date)
 returns setof public.mensalidades
 language plpgsql
 set search_path to ''
as $function$
declare month_start date:=date_trunc('month',p_month)::date;month_end date:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 if p_month is null then raise exception 'Informe o mês';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||month_start::text,0));
 -- Only open current/future invoices follow the current fee. Keep paid and past debts intact.
 if month_start>=date_trunc('month',today)::date then
  update public.mensalidades m set original_amount=coalesce(m.original_amount,m.valor),fee_adjusted_at=now(),valor=c.monthly_fee
  from public.clients c where m.cliente_id=c.id and m.user_id=auth.uid() and c.user_id=auth.uid()
   and c.status='Ativo' and c.monthly_fee>=0 and m.status<>'pago' and m.vencimento between month_start and month_end and m.valor is distinct from c.monthly_fee
   and m.asaas_payment_id is null and coalesce(c.payment_model,'recorrente_mensal')='recorrente_mensal';
 end if;

 insert into public.mensalidades(user_id,cliente_id,valor,vencimento,status)
 select auth.uid(),c.id,c.monthly_fee,d.due_date,case when d.due_date<today then 'atrasado' else 'pendente' end
 from public.clients c cross join lateral(select case when c.first_payment_date between month_start and month_end then c.first_payment_date else month_start+least(greatest(1,least(31,coalesce(c.payment_day,5))),extract(day from month_end)::int)-1 end due_date)d
 where c.user_id=auth.uid() and c.status='Ativo' and c.monthly_fee>0
 and coalesce(c.payment_model,'recorrente_mensal')='recorrente_mensal'
 and (coalesce(c.first_payment_date,c.entry_date) is null or d.due_date>=coalesce(c.first_payment_date,c.entry_date))
 and not exists(select 1 from public.mensalidades m where m.cliente_id=c.id and m.user_id=auth.uid() and m.vencimento between month_start and month_end)
 on conflict(cliente_id,vencimento) do nothing;
 return query select * from public.mensalidades where user_id=auth.uid() and vencimento between month_start and month_end order by vencimento,id;
end;$function$;
