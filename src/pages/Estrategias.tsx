import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Sparkles, Send, Plus, Trash2, MessageSquare, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

type Conversation = { id: string; title: string; updated_at: string };
type Message = { id?: string; role: 'user' | 'assistant'; content: string };

const STREAM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategy-chat`;

export default function Estrategias() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user) loadConversations(); }, [user]);
  useEffect(() => { if (activeId) loadMessages(activeId); else setMessages([]); }, [activeId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  async function loadConversations() {
    const { data } = await supabase
      .from('strategy_conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false });
    setConversations(data || []);
  }

  async function loadMessages(convId: string) {
    setLoading(true);
    const { data } = await supabase
      .from('strategy_messages')
      .select('id, role, content')
      .eq('conversation_id', convId)
      .order('created_at');
    setMessages((data as Message[]) || []);
    setLoading(false);
  }

  async function newConversation() {
    setActiveId(null);
    setMessages([]);
    setInput('');
  }

  async function deleteConversation(id: string) {
    if (!confirm('Excluir esta estratégia?')) return;
    await supabase.from('strategy_conversations').delete().eq('id', id);
    if (activeId === id) { setActiveId(null); setMessages([]); }
    loadConversations();
  }

  async function ensureConversation(firstMessage: string): Promise<string | null> {
    if (activeId) return activeId;
    if (!user) return null;
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '...' : '');
    const { data, error } = await supabase
      .from('strategy_conversations')
      .insert({ user_id: user.id, title })
      .select('id')
      .single();
    if (error || !data) { toast.error('Erro ao criar conversa'); return null; }
    setActiveId(data.id);
    loadConversations();
    return data.id;
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming || !user) return;

    const convId = await ensureConversation(text);
    if (!convId) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages((p) => [...p, userMsg]);
    setInput('');
    setStreaming(true);

    await supabase.from('strategy_messages').insert({
      conversation_id: convId, user_id: user.id, role: 'user', content: text,
    });

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    let assistantSoFar = '';
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(STREAM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error('Muitas requisições. Aguarde um instante.');
        else if (resp.status === 402) toast.error('Créditos de IA esgotados.');
        else toast.error('Erro ao gerar resposta.');
        setStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        textBuffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { done = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (assistantSoFar) {
        await supabase.from('strategy_messages').insert({
          conversation_id: convId, user_id: user.id, role: 'assistant', content: assistantSoFar,
        });
        await supabase.from('strategy_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
        loadConversations();
      }
    } catch (e) {
      console.error(e);
      toast.error('Falha ao conectar com a IA.');
    } finally {
      setStreaming(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/15 text-primary"><Sparkles className="w-5 h-5" /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Geração de Estratégia</h1>
          <p className="text-sm text-muted-foreground">Consultoria estratégica de tráfego e funis com IA</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        {/* Sidebar conversas */}
        <Card className="p-3 h-fit lg:sticky lg:top-20">
          <Button onClick={newConversation} className="w-full mb-3 gap-2" size="sm">
            <Plus className="w-4 h-4" /> Nova estratégia
          </Button>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">Nenhuma conversa ainda</p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                  activeId === c.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent text-foreground'
                }`}
                onClick={() => setActiveId(c.id)}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{c.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Chat */}
        <Card className="flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
            {!loading && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary mb-4"><Sparkles className="w-7 h-7" /></div>
                <h2 className="text-lg font-medium mb-2">Comece sua consultoria</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Descreva o produto, preço, nicho, resumo do cliente e objetivo. Ou peça diretamente:
                  "Gere 3 funis para um produto de emagrecimento de R$ 297".
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5">
                      <ReactMarkdown>{m.content || '...'}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando...
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Descreva o contexto ou faça uma pergunta estratégica..."
                rows={2}
                disabled={streaming}
                className="resize-none"
              />
              <Button onClick={send} disabled={!input.trim() || streaming} size="icon" className="h-10 w-10 shrink-0">
                {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 px-1">Enter envia • Shift+Enter quebra linha</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
