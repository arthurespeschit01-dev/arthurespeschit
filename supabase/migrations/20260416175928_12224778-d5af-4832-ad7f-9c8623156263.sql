-- Clients: add verba_mensal and niche
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS verba_mensal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS niche text DEFAULT '';

-- Campaigns: add budget and notes
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS budget numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';

-- Creatives table
CREATE TABLE IF NOT EXISTS public.creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'video',
  link text DEFAULT '',
  status text NOT NULL DEFAULT 'teste',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own creatives"
ON public.creatives FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_creatives_updated_at
BEFORE UPDATE ON public.creatives
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON public.creatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_creatives_user ON public.creatives(user_id);