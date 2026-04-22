ALTER TABLE public.operational_tasks
ADD COLUMN IF NOT EXISTS recurrence_days jsonb NOT NULL DEFAULT '[]'::jsonb;