ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS destination_type text DEFAULT '';
ALTER TABLE public.ad_sets ADD COLUMN IF NOT EXISTS destination_type text DEFAULT '';