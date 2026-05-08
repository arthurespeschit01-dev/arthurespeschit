
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  notif_email BOOLEAN NOT NULL DEFAULT false,
  notif_email_destino TEXT,
  notif_config JSONB NOT NULL DEFAULT '{
    "saldo_baixo": false,
    "saldo_baixo_limite": 500,
    "contrato_vencimento": false,
    "pagamento_vencimento": false,
    "inadimplencia": false,
    "inadimplencia_dias": 3,
    "meta_verba": false,
    "meta_alerta_pct": 20,
    "task_vencendo": false
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.notificacoes_enviadas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  referencia_id TEXT,
  enviada_em TIMESTAMPTZ DEFAULT NOW(),
  enviada_data DATE GENERATED ALWAYS AS ((enviada_em AT TIME ZONE 'UTC')::date) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS notif_unica_dia
  ON public.notificacoes_enviadas (user_id, tipo, referencia_id, enviada_data);

ALTER TABLE public.notificacoes_enviadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_notif_enviadas" ON public.notificacoes_enviadas FOR SELECT USING (auth.uid() = user_id);
