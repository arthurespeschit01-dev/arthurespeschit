UPDATE public.creatives SET status = 'Ativo' WHERE source = 'meta' AND status = 'escalando';
UPDATE public.creatives SET status = 'Pausado' WHERE source = 'meta' AND status = 'teste';
UPDATE public.creatives SET status = 'Encerrada' WHERE source = 'meta' AND status = 'morto';