
-- Add new fields to clients
ALTER TABLE public.clients ADD COLUMN payment_day INTEGER DEFAULT NULL;
ALTER TABLE public.clients ADD COLUMN account_ids JSONB DEFAULT '{}';

-- Add category to client_attachments
ALTER TABLE public.client_attachments ADD COLUMN category TEXT NOT NULL DEFAULT 'outros';
