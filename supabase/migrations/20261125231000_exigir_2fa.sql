-- 2FA obrigatório no banco: usuário logado só lê/escreve se a sessão passou pela verificação em duas etapas (aal2).
-- Só cria políticas restritivas; nenhum dado é alterado. Visitantes anônimos (formulários e portais públicos)
-- e funções com chave de serviço não são afetados.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity
  loop
    execute format('drop policy if exists exigir_2fa on public.%I', r.relname);
    execute format(
      'create policy exigir_2fa on public.%I as restrictive for all to authenticated
         using (coalesce((select auth.jwt()->>''aal''), ''aal1'') = ''aal2'')
         with check (coalesce((select auth.jwt()->>''aal''), ''aal1'') = ''aal2'')', r.relname);
  end loop;
end $$;

drop policy if exists exigir_2fa on storage.objects;
create policy exigir_2fa on storage.objects as restrictive for all to authenticated
  using (coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2')
  with check (coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2');
