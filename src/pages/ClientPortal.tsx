import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  agencySelectClass,
  type Ticket,
  type TicketMessage,
} from "@/lib/agency";

export default function ClientPortal() {
  const { token } = useParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [clientName, setClientName] = useState("");
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({
    title: "",
    category: "trafego",
    description: "",
  });
  const call = useCallback(
    async (action: string, payload = {}) => {
      const { data, error } = await supabase.functions.invoke("agency-portal", {
        body: { action, token, ...payload },
      });
      if (error) {
        let message =
          "Não foi possível concluir. Verifique seu link e tente novamente.";
        try {
          message = (await error.context?.json())?.error || message;
        } catch {
          /* use fallback */
        }
        throw new Error(message);
      }
      return data;
    },
    [token],
  );
  const load = useCallback(async () => {
    try {
      const data = await call("tickets", { offset });
      setHasMore(!!data.has_more);
      setTickets(data.tickets);
      setClientName(data.client_name);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [call, offset]);
  useEffect(() => {
    void load();
  }, [load]);
  const selectedId = selected?.id;
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setReply("");
    if (selectedId)
      void call("messages", { ticket_id: selectedId })
        .then((data) => {
          if (!cancelled) setMessages(data.messages);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [selectedId, call]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call("new_ticket", form);
      setForm({ title: "", category: "trafego", description: "" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await call("reply", { ticket_id: selected.id, message: reply });
      const data = await call("messages", { ticket_id: selected.id });
      setMessages(data.messages);
      setReply("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="max-w-3xl mx-auto p-5 space-y-6 min-h-screen">
      <header>
        <p className="text-primary text-sm">
          Central do Gestor · Portal de atendimento
        </p>
        <h1 className="text-2xl font-bold mt-2">
          {clientName || "Seus chamados"}
        </h1>
      </header>
      {error && (
        <p role="alert" className="border border-destructive rounded-lg p-3">
          {error}
        </p>
      )}
      {clientName && (
        <>
          <form className="border rounded-xl p-5 space-y-3" onSubmit={submit}>
            <h2 className="font-semibold text-lg">Abrir chamado</h2>
            <Label htmlFor="ticket-title">Título</Label>
            <Input
              id="ticket-title"
              required
              maxLength={160}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Label htmlFor="ticket-category">Categoria</Label>
            <select
              id="ticket-category"
              className={agencySelectClass}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {Object.entries(TICKET_CATEGORIES).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
            <Label htmlFor="ticket-description">O que você precisa?</Label>
            <Textarea
              id="ticket-description"
              required
              maxLength={10000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
            <Button disabled={busy} type="submit">
              {busy ? "Enviando…" : "Enviar chamado"}
            </Button>
          </form>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Histórico de chamados</h2>
              <Button variant="outline" onClick={() => void load()}>
                Atualizar
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 100))}
              >
                Mais recentes
              </Button>
              <Button
                variant="outline"
                disabled={!hasMore}
                onClick={() => setOffset(offset + 100)}
              >
                Mais antigos
              </Button>
            </div>
            {!tickets.length && (
              <p className="text-muted-foreground">
                Você ainda não abriu chamados.
              </p>
            )}
            {tickets.map((t) => (
              <button
                key={t.id}
                className="w-full text-left border rounded-xl p-4"
                onClick={() => setSelected(t)}
              >
                <strong>{t.title}</strong>
                <p className="text-sm text-muted-foreground mt-1">
                  {TICKET_CATEGORIES[t.category]} · {TICKET_STATUSES[t.status]}{" "}
                  · {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </p>
              </button>
            ))}
          </section>
          {selected && (
            <section className="border rounded-xl p-5 space-y-4">
              <div className="flex justify-between">
                <h2 className="font-semibold">{selected.title}</h2>
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  Fechar
                </Button>
              </div>
              <p className="whitespace-pre-wrap">{selected.description}</p>
              {messages.map((m) => (
                <div key={m.id} className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">
                    {m.sender === "agencia" ? "Agência" : "Você"} ·{" "}
                    {new Date(m.created_at).toLocaleString("pt-BR")}
                  </p>
                  <p className="whitespace-pre-wrap mt-1">{m.body}</p>
                </div>
              ))}
              {selected.status !== "concluido" && (
                <>
                  <Textarea
                    aria-label="Mensagem para a agência"
                    maxLength={10000}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <Button
                    disabled={busy || !reply.trim()}
                    onClick={() => void send()}
                  >
                    Enviar mensagem
                  </Button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
