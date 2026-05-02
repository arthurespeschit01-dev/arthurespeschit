-- Remove duplicate templates per user, keeping the oldest
DELETE FROM public.report_templates a
USING public.report_templates b
WHERE a.user_id = b.user_id
  AND a.name = b.name
  AND a.created_at > b.created_at;

-- Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_user_name_unique
  ON public.report_templates (user_id, name);