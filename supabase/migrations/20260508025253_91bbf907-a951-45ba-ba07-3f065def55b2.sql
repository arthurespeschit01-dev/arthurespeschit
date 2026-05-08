
CREATE TABLE public.google_ads_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  selected_customer_id TEXT,
  selected_customer_name TEXT,
  login_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

ALTER TABLE public.google_ads_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own google ads connections"
ON public.google_ads_connections
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_google_ads_connections_updated_at
BEFORE UPDATE ON public.google_ads_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.google_ads_oauth_states (
  state TEXT NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.google_ads_oauth_states ENABLE ROW LEVEL SECURITY;
