CREATE TABLE public.strategy_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nova estratégia',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own strategy conversations"
ON public.strategy_conversations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_strategy_conversations_updated_at
BEFORE UPDATE ON public.strategy_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.strategy_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.strategy_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own strategy messages"
ON public.strategy_messages
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_strategy_messages_conv ON public.strategy_messages(conversation_id, created_at);
CREATE INDEX idx_strategy_conversations_user ON public.strategy_conversations(user_id, updated_at DESC);