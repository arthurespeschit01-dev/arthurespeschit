-- Natureza do custo de uma saída: fixo ou variável (aditivo; registros antigos ficam nulos e seguem a regra anterior)
alter table public.transacoes add column if not exists natureza text;
alter table public.transacoes drop constraint if exists transacoes_natureza_check;
alter table public.transacoes add constraint transacoes_natureza_check check (natureza is null or natureza in ('fixo','variavel'));
