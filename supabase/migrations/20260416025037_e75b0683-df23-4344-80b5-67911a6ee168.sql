-- Storage bucket for contract attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('contract-attachments', 'contract-attachments', true);

CREATE POLICY "Users can upload contract attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'contract-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view contract attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'contract-attachments');

CREATE POLICY "Users can delete contract attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'contract-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Table for contract attachment metadata
CREATE TABLE public.contract_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.signed_contracts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contract attachments"
ON public.contract_attachments
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);