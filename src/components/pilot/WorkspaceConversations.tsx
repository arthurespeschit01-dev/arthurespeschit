import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { workspaceOperation, dateLabel } from "@/lib/workspaceCommercial";
interface Message {
  id: string;
  phone: string;
  contact_name: string | null;
  is_group: boolean;
  sender_name: string | null;
  direction: string;
  body: string;
  created_at: string;
  kind: string;
}
export default function WorkspaceConversations({
  workspace,
  write,
}: {
  workspace: string;
  write: boolean;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [phone, setPhone] = useState(""),
    [search, setSearch] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [request, setRequest] = useState(() => crypto.randomUUID());
  const status = useQuery({
    queryKey: ["workspace-whatsapp-status", user?.id, workspace],
    queryFn: () =>
      workspaceOperation<{
        connected: boolean;
        account_id: string | null;
        phone: string | null;
      }>("whatsapp_status", { workspace_id: workspace }),
    refetchInterval: 30000,
    refetchOnMount: "always",
    retry: false,
  });
  const account = status.data?.connected ? status.data.account_id : null;
  const q = useQuery({
    queryKey: ["workspace-conversations", user?.id, workspace, account],
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_workspace_messages")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("account_id", account!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (r.error) throw r.error;
      return r.data as Message[];
    },
    enabled: !!account,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const all = q.data || [],
    groups = new Map<string, Message>();
  all.forEach((m) => {
    if (!groups.has(m.phone)) groups.set(m.phone, m);
  });
  const messages = all
    .filter((m) => m.phone === phone)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const title =
    all.find((m) => m.phone === phone && m.contact_name)?.contact_name || phone;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl font-semibold">Conversas</h2>
        <p className="text-sm text-muted-foreground">
          {status.data?.connected
            ? `Conectado · ${status.data.phone}`
            : "WhatsApp desconectado"}
        </p>
      </div>
      {status.error && <p role="alert">{status.error.message}</p>}
      {!account ? (
        <p className="border rounded-xl p-5 text-sm text-muted-foreground">
          Conecte a instância própria desta empresa em Configurações →
          Integrações para receber e enviar mensagens.
        </p>
      ) : (
        <div className="border rounded-xl overflow-hidden grid md:grid-cols-[300px_minmax(0,1fr)] min-h-[560px] bg-card">
          <aside
            className={`border-r min-w-0 ${phone ? "hidden md:block" : ""}`}
          >
            <div className="p-3 space-y-2 border-b">
              <Input
                placeholder="Buscar conversa"
                aria-label="Buscar conversa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {write && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const p = window.prompt("WhatsApp com DDI e DDD:");
                    if (p) {
                      setPhone(p.replace(/\D/g, ""));
                      setText("");
                      setRequest(crypto.randomUUID());
                    }
                  }}
                >
                  Nova conversa
                </Button>
              )}
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {[...groups.values()]
                .filter((m) =>
                  (m.contact_name || m.phone || "")
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((m) => (
                  <button
                    key={m.phone}
                    onClick={() => {
                      setPhone(m.phone);
                      setText("");
                      setError("");
                      setRequest(crypto.randomUUID());
                    }}
                    className={`w-full text-left px-4 py-3 border-b hover:bg-muted ${phone === m.phone ? "bg-primary/10" : ""}`}
                  >
                    <p className="font-semibold text-sm truncate">
                      {all.find((x) => x.phone === m.phone && x.contact_name)
                        ?.contact_name || m.phone}
                      {m.is_group ? " · Grupo" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {m.direction === "saida" ? "Você: " : ""}
                      {m.body}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {dateLabel(m.created_at)}
                    </p>
                  </button>
                ))}
              {!groups.size && (
                <p className="p-4 text-sm text-muted-foreground">
                  As novas mensagens aparecerão automaticamente após a ativação.
                </p>
              )}
            </div>
          </aside>
          <section
            className={`flex flex-col min-w-0 ${!phone ? "hidden md:flex" : ""}`}
          >
            <header className="p-3 border-b flex gap-3 items-center">
              <Button
                className="md:hidden"
                size="sm"
                variant="outline"
                onClick={() => setPhone("")}
              >
                Voltar
              </Button>
              <h3 className="text-sm font-semibold break-all">
                {title || "Selecione uma conversa"}
              </h3>
            </header>
            <div className="flex-1 max-h-[490px] min-h-80 overflow-y-auto bg-muted/20 p-4 space-y-3">
              {messages.map((m) => (
                <article
                  key={m.id}
                  className={`max-w-[85%] w-fit rounded-xl p-3 text-sm ${m.direction === "saida" ? "ml-auto bg-primary text-primary-foreground" : "bg-card border"}`}
                >
                  {m.is_group && m.sender_name && (
                    <p className="font-semibold text-xs mb-1">
                      {m.sender_name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="text-[10px] opacity-80 mt-1">
                    {dateLabel(m.created_at)}
                  </p>
                </article>
              ))}
            </div>
            {phone && (
              <form
                className="border-t p-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  void workspaceOperation<{ status: string; error?: string }>(
                    "send",
                    {
                      workspace_id: workspace,
                      account_id: account,
                      phone,
                      text,
                      request_id: request,
                    },
                  )
                    .then((r) => {
                      if (r.status === "failed" || r.status === "uncertain")
                        throw Error(r.error || "Envio não confirmado.");
                      setText("");
                      setRequest(crypto.randomUUID());
                      void client.invalidateQueries({
                        queryKey: [
                          "workspace-conversations",
                          user?.id,
                          workspace,
                        ],
                      });
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                <div className="flex gap-2">
                  <Input
                    aria-label="Escrever mensagem"
                    placeholder="Escreva uma mensagem"
                    disabled={!write || busy}
                    maxLength={4000}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setRequest(crypto.randomUUID());
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={!write || busy || !text.trim()}
                  >
                    {busy ? "Enviando…" : "Enviar"}
                  </Button>
                </div>
                {error && (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
              </form>
            )}
          </section>
        </div>
      )}
      {q.error && <p role="alert">Não foi possível carregar as conversas.</p>}
    </div>
  );
}
