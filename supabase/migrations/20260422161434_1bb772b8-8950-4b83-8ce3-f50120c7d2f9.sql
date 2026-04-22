ALTER TABLE public.operational_tasks
ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS recurrence_interval integer NOT NULL DEFAULT 1;