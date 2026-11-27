-- Cada agência conecta o próprio Asaas. A chave de API fica criptografada no Vault;
-- só o servidor (service_role) consegue gravar e ler. Nada existente é alterado.
create table if not exists public.asaas_contas (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  ambiente text not null default 'sandbox' check (ambiente in ('sandbox','production')),
  chave_id uuid,
  conta_nome text,
  webhook_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  webhook_id text,
  webhook_ambiente text,
  conectado_em timestamptz,
  conectado_por uuid
);
alter table public.asaas_contas enable row level security;
revoke all on public.asaas_contas from anon, authenticated;

create or replace function public.asaas_guardar_chave(p_org uuid, p_chave text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if coalesce(trim(p_chave), '') = '' then raise exception 'Chave vazia'; end if;
  insert into public.asaas_contas (organization_id) values (p_org) on conflict (organization_id) do nothing;
  select chave_id into v_id from public.asaas_contas where organization_id = p_org;
  if v_id is not null and exists (select 1 from vault.secrets where id = v_id) then
    perform vault.update_secret(v_id, p_chave);
  else
    v_id := vault.create_secret(p_chave, 'asaas_api_key_' || p_org::text || '_' || extract(epoch from clock_timestamp())::bigint);
  end if;
  update public.asaas_contas set chave_id = v_id where organization_id = p_org;
  return v_id;
end $$;

create or replace function public.asaas_ler_chave(p_org uuid)
returns text language sql security definer set search_path to '' stable as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  join public.asaas_contas c on c.chave_id = s.id where c.organization_id = p_org;
$$;

create or replace function public.asaas_apagar_chave(p_org uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  select chave_id into v_id from public.asaas_contas where organization_id = p_org;
  update public.asaas_contas set chave_id = null, webhook_id = null, webhook_ambiente = null, conta_nome = null, conectado_em = null
  where organization_id = p_org;
  if v_id is not null then delete from vault.secrets where id = v_id; end if;
end $$;

revoke all on function public.asaas_guardar_chave(uuid, text) from public, anon, authenticated;
revoke all on function public.asaas_ler_chave(uuid) from public, anon, authenticated;
revoke all on function public.asaas_apagar_chave(uuid) from public, anon, authenticated;
grant execute on function public.asaas_guardar_chave(uuid, text) to service_role;
grant execute on function public.asaas_ler_chave(uuid) to service_role;
grant execute on function public.asaas_apagar_chave(uuid) to service_role;
