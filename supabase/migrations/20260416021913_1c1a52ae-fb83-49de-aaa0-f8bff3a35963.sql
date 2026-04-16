
-- Drop the broad SELECT policy and create a scoped one
DROP POLICY "Users can view task attachments" ON storage.objects;

CREATE POLICY "Users can view own task attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
