-- Resumo diário de notificações: segredo do agendamento (tabela sem acesso pelo app) e agendamento às 8h (horário de Brasília).
-- Não altera nenhum dado existente.
create table if not exists public.notificacoes_agendamento (
  id int primary key check (id = 1),
  segredo text not null
);
alter table public.notificacoes_agendamento enable row level security;
revoke all on public.notificacoes_agendamento from anon, authenticated;
insert into public.notificacoes_agendamento (id, segredo)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'notificacoes-resumo-diario';
select cron.schedule(
  'notificacoes-resumo-diario',
  '7 11 * * *',
  $$ select net.http_post(
       url := 'https://dycyskikaljvokaxsxnh.supabase.co/functions/v1/verificar-notificacoes?cron=' || segredo,
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     ) from public.notificacoes_agendamento where id = 1 $$
);
