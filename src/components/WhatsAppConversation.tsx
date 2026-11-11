import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { whatsappRequest } from "@/lib/whatsapp";

interface Message {
  id: string;
  direction: "entrada" | "saida";
  body: string;
  status: string;
  created_at: string;
  kind: string;
}
export default function WhatsAppConversation({
  cardId,
  phone,
  onChanged,
}: {
  cardId: string;
  phone: string;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const requestId = useRef<string | null>(null);
  const lastId = useRef<string | null>(null);
  const initialized = useRef(false);
  const load = useCallback(async () => {
    try {
      const data = await whatsappRequest<{ messages: Message[] }>("messages", {
        card_id: cardId,
      });
      setMessages(data.messages);
      setError("");
      const latest = data.messages[data.messages.length - 1]?.id || null;
      if (initialized.current && lastId.current !== latest) onChanged();
      initialized.current = true;
      lastId.current = latest;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [cardId, onChanged]);
  useEffect(() => {
    if (!phone.trim()) return;
    void load();
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [load, phone]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      await whatsappRequest("send", {
        card_id: cardId,
        text: text.trim(),
        request_id: requestId.current,
      });
      setText("");
      requestId.current = null;
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  if (!phone.trim())
    return (
      <p className="text-sm text-muted-foreground">
        Cadastre e salve um telefone neste card para abrir a conversa no
        WhatsApp.
      </p>
    );
  return (
    <section
      className="space-y-3 border-t pt-4"
      aria-label="Conversa WhatsApp do card"
    >
      <h3 className="font-semibold">WhatsApp · {phone}</h3>
      <p className="text-xs text-muted-foreground">
        Últimas 100 mensagens recebidas após a conexão e enviadas por esta
        Central.
      </p>
      <div className="max-h-72 overflow-y-auto space-y-2 rounded-lg bg-muted/20 p-3">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-lg p-3 text-sm ${message.direction === "saida" ? "bg-primary/15 ml-6" : "bg-muted mr-6"}`}
          >
            <p className="text-xs text-muted-foreground">
              {message.direction === "saida" ? "Agência" : "Contato"} ·{" "}
              {new Date(message.created_at).toLocaleString("pt-BR")} ·{" "}
              {message.status === "erro"
                ? "Envio não confirmado"
                : message.status === "enviando"
                  ? "Enviando"
                  : message.direction === "saida"
                    ? "Enviada"
                    : "Recebida"}
            </p>
            <p className="whitespace-pre-wrap mt-1">{message.body}</p>
          </article>
        ))}
        {!messages.length && (
          <p className="text-sm text-muted-foreground">
            Nenhuma mensagem registrada para este contato.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <form onSubmit={send} className="space-y-2">
        <Textarea
          aria-label="Mensagem WhatsApp"
          maxLength={10000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            requestId.current = null;
          }}
          disabled={sending}
          placeholder="Escreva sua mensagem"
        />
        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => void load()}>
            Atualizar conversa
          </Button>
          <Button type="submit" disabled={sending || !text.trim()}>
            {sending ? "Enviando…" : "Enviar pelo WhatsApp"}
          </Button>
        </div>
      </form>
    </section>
  );
}
