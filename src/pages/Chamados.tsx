import { readAllRows } from "@/lib/readAllRows";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  agencySelectClass,
  type ClientPortal,
  type Ticket,
  type TicketMessage,
} from "@/lib/agency";
import { toast } from "sonner";

export default function Chamados() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [portals, setPortals] = useState<ClientPortal[]>([]);
  const [clients, setClients] = useState<
    { id: string; name: string; status: string | null }[]
  >([]);
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("todos");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRotate, setConfirmRotate] = useState<ClientPortal | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    const [t, p, c] = await Promise.all([
      readAllRows<Ticket>((from, to) =>
        supabase
          .from("agency_tickets")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      readAllRows<ClientPortal>((from, to) =>
        supabase
          .from("agency_client_portals")
          .select("*")
          .eq("user_id", user.id)
          .order("id")
          .range(from, to),
      ),
      readAllRows<{ id: string; name: string; status: string | null }>(
        (from, to) =>
          supabase
            .from("clients")
            .select("id,name,status")
            .eq("user_id", user.id)
            .order("name")
            .order("id")
            .range(from, to),
      ),
    ]);
    if (t.error || p.error || c.error) {
      setError(
        "Não foi possível carregar os chamados. Verifique a conexão e a atualização do banco.",
      );
      return;
    }
    setError("");
    setTickets(t.data);
    setPortals(p.data);
    setClients(c.data);
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  const selectedId = selected?.id;
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setReply("");
    if (selectedId)
      void supabase
        .from("agency_ticket_messages")
        .select("*")
        .eq("ticket_id", selectedId)
        .order("created_at")
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) toast.error("Falha ao carregar mensagens.");
          else setMessages(data);
        });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  const createPortal = async () => {
    if (!user || !clientId) return;
    setBusy(true);
    const { error } = await supabase.from("agency_client_portals").insert({
      user_id: user.id,
      client_id: clientId,
      token:
        crypto.randomUUID().replace(/-/g, "") +
        crypto.randomUUID().replace(/-/g, ""),
      enabled: true,
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível criar o portal.");
      return;
    }
    await load();
    toast.success("Portal criado. Copie o link para enviar ao cliente.");
  };
  const updatePortal = async (portal: ClientPortal, rotate = false) => {
    setBusy(true);
    const { error } = await supabase
      .from("agency_client_portals")
      .update(
        rotate
          ? {
              token:
                crypto.randomUUID().replace(/-/g, "") +
                crypto.randomUUID().replace(/-/g, ""),
            }
          : { enabled: !portal.enabled },
      )
      .eq("id", portal.id)
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error("Falha ao atualizar portal.");
      return;
    }
    setConfirmRotate(null);
    await load();
  };
  const changeStatus = async (value: Ticket["status"]) => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase
      .from("agency_tickets")
      .update({ status: value })
      .eq("id", selected.id)
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error("Falha ao atualizar status.");
      return;
    }
    setSelected({ ...selected, status: value });
    await load();
  };
  const sendReply = async () => {
    if (!user || !selected || !reply.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("agency_ticket_messages")
      .insert({
        user_id: user.id,
        ticket_id: selected.id,
        sender: "agencia",
        body: reply.trim(),
      })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      toast.error("Não foi possível enviar a resposta.");
      return;
    }
    setMessages([...messages, data]);
    setReply("");
  };
  const portal = portals.find((p) => p.client_id === clientId);
  const filtered = tickets.filter(
    (t) =>
      (!clientId || t.client_id === clientId) &&
      (status === "todos" || t.status === status),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chamados</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Receba solicitações e responda aos clientes em um só lugar.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Portal do cliente</h2>
        <p className="text-sm text-muted-foreground">
          Quem possui o link pode acessar os chamados deste cliente. Você pode
          desativar ou substituir o link.
        </p>
        <select
          className={agencySelectClass}
          aria-label="Cliente do portal"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.status})
            </option>
          ))}
        </select>
        {clientId && (
          <div className="flex flex-wrap gap-2">
            {portal ? (
              <>
                <Button
                  disabled={busy || !portal.enabled}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${location.origin}/portal/${portal.token}`,
                      );
                      toast.success("Link copiado!");
                    } catch {
                      toast.error("Não foi possível copiar o link.");
                    }
                  }}
                >
                  Copiar link
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void updatePortal(portal)}
                >
                  {portal.enabled ? "Desativar link" : "Ativar link"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmRotate(portal)}
                >
                  Substituir link
                </Button>
              </>
            ) : (
              <Button disabled={busy} onClick={() => void createPortal()}>
                Criar portal
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <select
          className={agencySelectClass}
          aria-label="Filtrar status dos chamados"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="todos">Todos os status</option>
          {Object.entries(TICKET_STATUSES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => void load()}>
          Atualizar
        </Button>
      </div>
      <div className="space-y-3">
        {filtered.map((ticket) => (
          <button
            key={ticket.id}
            className="border rounded-xl p-4 w-full text-left hover:border-primary"
            onClick={() => setSelected(ticket)}
          >
            <div className="flex justify-between gap-3">
              <strong>{ticket.title}</strong>
              <span className="text-sm">{TICKET_STATUSES[ticket.status]}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {clients.find((c) => c.id === ticket.client_id)?.name} ·{" "}
              {TICKET_CATEGORIES[ticket.category]} ·{" "}
              {new Date(ticket.created_at).toLocaleString("pt-BR")}
            </p>
          </button>
        ))}
        {!error && !filtered.length && (
          <p className="text-muted-foreground">Nenhum chamado neste filtro.</p>
        )}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected && TICKET_CATEGORIES[selected.category]}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <p className="whitespace-pre-wrap">{selected.description}</p>
              <select
                className={agencySelectClass}
                aria-label="Status do chamado"
                disabled={busy}
                value={selected.status}
                onChange={(e) =>
                  void changeStatus(e.target.value as Ticket["status"])
                }
              >
                {Object.entries(TICKET_STATUSES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {messages.map((m) => (
                <div key={m.id} className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">
                    {m.sender === "agencia" ? "Agência" : "Cliente"} ·{" "}
                    {new Date(m.created_at).toLocaleString("pt-BR")}
                  </p>
                  <p className="whitespace-pre-wrap mt-1">{m.body}</p>
                </div>
              ))}
              <Textarea
                aria-label="Resposta ao cliente"
                maxLength={10000}
                placeholder="Escreva uma resposta"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <Button
                disabled={busy || !reply.trim()}
                onClick={() => void sendReply()}
              >
                Enviar resposta
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmRotate}
        onOpenChange={(open) => !open && setConfirmRotate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substituir link?</DialogTitle>
            <DialogDescription>
              O link anterior deixará de funcionar. Os chamados e o histórico
              serão preservados.
            </DialogDescription>
          </DialogHeader>
          <Button
            disabled={busy}
            onClick={() =>
              confirmRotate && void updatePortal(confirmRotate, true)
            }
          >
            Substituir link
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
