ALTER TABLE public.meta_oauth_states ALTER COLUMN client_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meta_pending_connections_user_id_key'
  ) THEN
    ALTER TABLE public.meta_pending_connections ADD CONSTRAINT meta_pending_connections_user_id_key UNIQUE (user_id);
  END IF;
END $$;