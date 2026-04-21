CREATE TABLE public.ad_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  meta_adset_id TEXT,
  meta_campaign_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Ativo',
  daily_budget NUMERIC DEFAULT 0,
  lifetime_budget NUMERIC DEFAULT 0,
  bid_strategy TEXT DEFAULT '',
  optimization_goal TEXT DEFAULT '',
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  source TEXT NOT NULL DEFAULT 'meta',
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ad_sets_campaign_meta_unique ON public.ad_sets(campaign_id, meta_adset_id) WHERE meta_adset_id IS NOT NULL;
CREATE INDEX ad_sets_user_id_idx ON public.ad_sets(user_id);
CREATE INDEX ad_sets_campaign_id_idx ON public.ad_sets(campaign_id);

ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ad_sets" ON public.ad_sets
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_ad_sets_updated_at
BEFORE UPDATE ON public.ad_sets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();