ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS optimization_goal text NOT NULL DEFAULT '';
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS optimization_goal text NOT NULL DEFAULT '';