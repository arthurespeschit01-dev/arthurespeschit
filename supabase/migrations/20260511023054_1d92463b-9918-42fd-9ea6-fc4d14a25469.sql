ALTER TABLE public.meta_pending_connections
  ADD COLUMN IF NOT EXISTS selected_ad_account_id text,
  ADD COLUMN IF NOT EXISTS selected_ad_account_name text;