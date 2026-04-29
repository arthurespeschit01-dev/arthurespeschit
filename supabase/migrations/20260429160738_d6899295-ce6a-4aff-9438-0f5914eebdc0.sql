
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS engagements bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ad_sets ADD COLUMN IF NOT EXISTS engagements bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ad_sets ADD COLUMN IF NOT EXISTS frequency numeric NOT NULL DEFAULT 0;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS engagements bigint NOT NULL DEFAULT 0;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS frequency numeric NOT NULL DEFAULT 0;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS video_views bigint NOT NULL DEFAULT 0;
