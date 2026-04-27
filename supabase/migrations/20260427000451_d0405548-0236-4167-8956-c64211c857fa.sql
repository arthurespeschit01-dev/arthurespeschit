CREATE TABLE public.traffic_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  year INTEGER NOT NULL,
  funnel_config JSONB NOT NULL DEFAULT '{"pageView":true,"addToCart":true,"lead":true,"checkout":true}'::jsonb,
  monthly_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  objectives JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id, year)
);

ALTER TABLE public.traffic_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own traffic_records"
ON public.traffic_records FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_traffic_records_updated_at
BEFORE UPDATE ON public.traffic_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();