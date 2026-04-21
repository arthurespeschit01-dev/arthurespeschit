-- Tabela para armazenar conexões Meta Ads por cliente
CREATE TABLE public.meta_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  meta_user_id TEXT,
  selected_ad_account_id TEXT,
  selected_ad_account_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meta connections"
ON public.meta_connections FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_meta_connections_updated_at
BEFORE UPDATE ON public.meta_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela temporária para guardar o estado do OAuth (CSRF protection)
CREATE TABLE public.meta_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_oauth_states ENABLE ROW LEVEL SECURITY;

-- Sem políticas: apenas service role acessa (edge functions)

-- Adicionar colunas em campaigns para suportar fonte Meta + métricas
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT,
  ADD COLUMN IF NOT EXISTS spend NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpa NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roas NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_meta_campaign_unique
ON public.campaigns(client_id, meta_campaign_id)
WHERE meta_campaign_id IS NOT NULL;