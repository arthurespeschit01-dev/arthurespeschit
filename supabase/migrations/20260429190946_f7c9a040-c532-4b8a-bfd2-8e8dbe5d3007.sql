ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS followers bigint NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS profile_visits bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ad_sets ADD COLUMN IF NOT EXISTS followers bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ad_sets ADD COLUMN IF NOT EXISTS profile_visits bigint NOT NULL DEFAULT 0;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS followers bigint NOT NULL DEFAULT 0;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS profile_visits bigint NOT NULL DEFAULT 0;