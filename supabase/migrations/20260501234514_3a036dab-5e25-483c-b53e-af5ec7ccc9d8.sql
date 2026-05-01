-- Create storage bucket for creative uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('creative-uploads', 'creative-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies: users manage files in their own folder (folder name = user id)
CREATE POLICY "Users can view own creative uploads"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'creative-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload own creative uploads"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'creative-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own creative uploads"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'creative-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own creative uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'creative-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);