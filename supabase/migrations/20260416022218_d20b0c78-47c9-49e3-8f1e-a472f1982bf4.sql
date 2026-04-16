
CREATE TABLE public.client_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client attachments"
ON public.client_attachments FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Reuse task-attachments bucket for client files too, or create a dedicated one
INSERT INTO storage.buckets (id, name, public) VALUES ('client-attachments', 'client-attachments', false);

CREATE POLICY "Users can upload client attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'client-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own client attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own client attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'client-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
