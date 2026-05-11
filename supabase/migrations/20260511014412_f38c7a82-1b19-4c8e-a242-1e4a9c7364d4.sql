CREATE TABLE IF NOT EXISTS public.meta_pending_connections (
  user_id uuid PRIMARY KEY,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  meta_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_pending_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meta pending connections"
ON public.meta_pending_connections
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER meta_pending_connections_updated_at
BEFORE UPDATE ON public.meta_pending_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();