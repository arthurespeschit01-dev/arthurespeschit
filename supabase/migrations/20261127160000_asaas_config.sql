-- Configuração do Asaas guardada no banco (só o servidor lê): organização dona da conta,
-- ambiente e token do webhook gerado aqui mesmo. A chave de API continua no segredo ASAAS_API_KEY.
create table if not exists public.asaas_config (
  id int primary key check (id = 1),
  organization_id uuid,
  ambiente text not null default 'sandbox' check (ambiente in ('sandbox','production')),
  webhook_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  webhook_id text,
  webhook_ambiente text
);
alter table public.asaas_config enable row level security;
revoke all on public.asaas_config from anon, authenticated;
