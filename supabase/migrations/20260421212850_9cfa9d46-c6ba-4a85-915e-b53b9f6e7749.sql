-- Add metric columns to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS reach bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frequency numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctr numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpc numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpm numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchases integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_views bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_preset text DEFAULT 'maximum';

-- Add metric columns to ad_sets
ALTER TABLE public.ad_sets
  ADD COLUMN IF NOT EXISTS spend numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctr numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpc numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpm numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchases integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpa numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roas numeric DEFAULT 0;

-- Add metric columns to creatives
ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS spend numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctr numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpc numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpm numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchases integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpa numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roas numeric DEFAULT 0;