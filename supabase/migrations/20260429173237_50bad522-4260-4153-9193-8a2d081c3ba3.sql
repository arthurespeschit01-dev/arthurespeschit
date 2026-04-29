ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS meta_adset_id text;
CREATE INDEX IF NOT EXISTS idx_creatives_meta_adset_id ON public.creatives(meta_adset_id);