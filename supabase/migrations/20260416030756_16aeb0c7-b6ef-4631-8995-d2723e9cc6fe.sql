
CREATE TABLE public.notification_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notification_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'read',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_id)
);

ALTER TABLE public.notification_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification states"
ON public.notification_states
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
