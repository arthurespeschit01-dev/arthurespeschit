CREATE TABLE public.signed_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Ativo',
  signed_date DATE,
  expiry_date DATE,
  notes TEXT DEFAULT '',
  file_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.signed_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own signed contracts"
ON public.signed_contracts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_signed_contracts_updated_at
BEFORE UPDATE ON public.signed_contracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();