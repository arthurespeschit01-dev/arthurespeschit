DROP POLICY "Users can view contract attachments" ON storage.objects;

CREATE POLICY "Users can view own contract attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'contract-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);