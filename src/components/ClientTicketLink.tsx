import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ClientPortal } from "@/lib/agency";
import { toast } from "sonner";

export default function ClientTicketLink({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const [portal, setPortal] = useState<ClientPortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRotate, setConfirmRotate] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("agency_client_portals")
      .select("*")
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .maybeSingle();
    setLoading(false);
    if (error) {
      setError(
        "Não foi possível consultar o link de chamados. Tente novamente.",
      );
      return;
    }
    setError("");
    setPortal(data);
  }, [clientId, user]);
  useEffect(() => {
    setPortal(null);
    void load();
  }, [load]);
  const create = async () => {
    if (!user) return;
    setBusy(true);
    setError("");
    const token =
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase
      .from("agency_client_portals")
      .insert({ user_id: user.id, client_id: clientId, token, enabled: true });
    setBusy(false);
    if (error && error.code !== "23505") {
      setError(
        "Não foi possível criar o link. Verifique a conexão e a configuração dos chamados.",
      );
      return;
    }
    await load();
  };
  const update = async (rotate = false) => {
    if (!portal || !user) return;
    setBusy(true);
    setError("");
    const payload = rotate
      ? {
          token:
            crypto.randomUUID().replace(/-/g, "") +
            crypto.randomUUID().replace(/-/g, ""),
        }
      : { enabled: !portal.enabled };
    const { data, error } = await supabase
      .from("agency_client_portals")
      .update(payload)
      .eq("id", portal.id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setError("Não foi possível atualizar o link de chamados.");
      return;
    }
    setPortal(data);
    setConfirmRotate(false);
  };
  const url = portal ? `${window.location.origin}/portal/${portal.token}` : "";
  return (
    <section
      className="rounded-xl border bg-card p-5 space-y-4"
      aria-labelledby="client-ticket-link-title"
    >
      <div>
        <h2 id="client-ticket-link-title" className="font-semibold text-lg">
          Link de chamados do cliente
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Envie este link para o cliente abrir solicitações e acompanhar seu
          histórico.
        </p>
      </div>
      {loading && (
        <p role="status" className="text-sm">
          Consultando link…
        </p>
      )}
      {error && (
        <div role="alert" className="text-sm text-destructive">
          {error}{" "}
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!loading && !portal && (
        <Button disabled={busy} onClick={() => void create()}>
          {busy ? "Criando…" : "Criar link de chamados"}
        </Button>
      )}
      {portal && (
        <>
          <Label htmlFor="client-ticket-url">
            Link exclusivo deste cliente {portal.enabled ? "" : "(desativado)"}
          </Label>
          <Input
            id="client-ticket-url"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !portal.enabled}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link de chamados copiado!");
                } catch {
                  toast.error("Selecione o link acima para copiar.");
                }
              }}
            >
              Copiar link de chamados
            </Button>
            {portal.enabled && (
              <Button asChild variant="outline">
                <a href={url} target="_blank" rel="noreferrer">
                  Abrir portal do cliente
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void update()}
            >
              {portal.enabled ? "Desativar link" : "Ativar link"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmRotate(true)}
            >
              Substituir link
            </Button>
          </div>
        </>
      )}
      <Button variant="link" asChild className="px-0">
        <Link to={`/chamados?cliente=${encodeURIComponent(clientId)}`}>
          Ver chamados deste cliente
        </Link>
      </Button>
      <Dialog
        open={confirmRotate}
        onOpenChange={(open) => !busy && setConfirmRotate(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substituir link de chamados?</DialogTitle>
            <DialogDescription>
              O link anterior deixará de funcionar. O histórico do cliente será
              preservado.
            </DialogDescription>
          </DialogHeader>
          <Button disabled={busy} onClick={() => void update(true)}>
            Substituir link
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
