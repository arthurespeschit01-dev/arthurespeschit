-- Transações financeiras (entradas e saídas)
CREATE TABLE public.transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  categoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transacoes_user_data ON public.transacoes(user_id, data DESC);
CREATE INDEX idx_transacoes_cliente ON public.transacoes(cliente_id);

ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_transacoes" ON public.transacoes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_transacoes" ON public.transacoes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_transacoes" ON public.transacoes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_transacoes" ON public.transacoes
  FOR DELETE USING (auth.uid() = user_id);

-- Mensalidades por cliente
CREATE TABLE public.mensalidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  cliente_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  valor NUMERIC NOT NULL DEFAULT 0,
  vencimento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pago','pendente','atrasado')),
  data_pagamento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, vencimento)
);

CREATE INDEX idx_mensalidades_user_venc ON public.mensalidades(user_id, vencimento DESC);

ALTER TABLE public.mensalidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_mensalidades" ON public.mensalidades
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_mensalidades" ON public.mensalidades
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_mensalidades" ON public.mensalidades
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_mensalidades" ON public.mensalidades
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.fin_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_transacoes_updated BEFORE UPDATE ON public.transacoes
  FOR EACH ROW EXECUTE FUNCTION public.fin_set_updated_at();
CREATE TRIGGER trg_mensalidades_updated BEFORE UPDATE ON public.mensalidades
  FOR EACH ROW EXECUTE FUNCTION public.fin_set_updated_at();