import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type WorkspaceStage } from "@/lib/clientWorkspaces";
import { workspaceOperation, selectClass } from "@/lib/workspaceCommercial";
export default function WorkspaceIntegrations({
  workspace,
  stages,
  manage,
  kind = "whatsapp",
}: {
  workspace: string;
  stages: WorkspaceStage[];
  manage: boolean;
  kind?: "whatsapp" | "google" | "webhook";
}) {
  const { user } = useAuth();
  const [instance, setInstance] = useState(""),
    [token, setToken] = useState(""),
    [stage, setStage] = useState(stages[0]?.id || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [qr, setQr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["workspace-integrations", user?.id, workspace, kind],
    queryFn: () =>
      workspaceOperation<{
        google: {
          configured: boolean;
          connected: boolean;
          redirect_uri: string;
        };
        whatsapp: { instance_id: string; enabled: boolean } | null;
        webhook: { url: string; enabled: boolean } | null;
      }>("integration_settings", { workspace_id: workspace }),
    enabled: manage,
    refetchOnMount: "always",
  });
  const act = async (action: string, values: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const s = stages.find((s) => s.id === stage);
      const r = await workspaceOperation<{
        url?: string;
        qrcode?: string;
        connected?: boolean;
      }>(action, {
        workspace_id: workspace,
        pipeline_id: s?.pipeline_id,
        stage_id: s?.id,
        ...values,
      });
      if (action === "google_connect" && r.url) {
        window.location.assign(r.url);
        return;
      }
      setQr(r.qrcode || null);
      setToken("");
      setMessage(
        action === "connect_whatsapp"
          ? r.connected
            ? "WhatsApp conectado."
            : "Leia o QR Code para concluir a conexão."
          : "Configuração salva.",
      );
      await q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!manage)
    return (
      <p className="text-sm text-muted-foreground">
        Somente administradores podem configurar integrações desta empresa.
      </p>
    );
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">
        {kind === "whatsapp"
          ? "WhatsApp"
          : kind === "google"
            ? "Google Agenda"
            : "Webhooks externos"}
      </h2>
      <p className="text-sm text-muted-foreground">
        As credenciais desta subconta ficam separadas das conexões da sua
        agência. Uma instância já usada em outra integração não será
        reconfigurada.
      </p>
      {q.error && <p role="alert">{q.error.message}</p>}
      {kind !== "google" && (
        <label className="block text-sm">
          Etapa de entrada dos novos contatos
          <select
            className={selectClass + " block mt-2"}
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "whatsapp" && (
        <section className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="font-semibold">WhatsApp · W-API</h3>
          <p className="text-sm">
            {q.data?.whatsapp
              ? `Instância: ${q.data.whatsapp.instance_id} · ${q.data.whatsapp.enabled ? "Recebimento ativado" : "Não conectada"}`
              : "Nenhuma instância configurada."}
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act("save_whatsapp", {
                instance_id: instance.trim(),
                token,
              });
            }}
          >
            <Input
              aria-label="ID da instância WhatsApp"
              autoComplete="off"
              placeholder="ID de uma instância exclusiva desta empresa"
              required
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
            />
            <Input
              aria-label="Token da instância WhatsApp"
              type="password"
              autoComplete="new-password"
              placeholder="Token (não será exibido depois de salvar)"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button disabled={busy || !stage}>Salvar instância</Button>
          </form>
          {q.data?.whatsapp && (
            <div className="flex gap-2 flex-wrap">
              <Button
                disabled={busy}
                onClick={() => void act("connect_whatsapp")}
              >
                Conectar / mostrar QR Code
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void act("disconnect_whatsapp")}
              >
                Desconectar da subconta
              </Button>
            </div>
          )}
          {qr && (
            <img
              src={qr}
              alt="QR Code para conectar o WhatsApp da subconta"
              className="max-w-64 w-full bg-white p-3 rounded-lg"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Os eventos recebidos e os enviados pelo telefone entram nas
            conversas pelo webhook de mensagens e de envio. O histórico anterior
            à ativação não é importado por este módulo.
          </p>
        </section>
      )}
      {kind === "google" && (
        <section className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="font-semibold">Google Agenda</h3>
          <p className="text-sm">
            {q.data?.google?.connected
              ? "Conectada à agenda principal desta empresa."
              : "Nenhuma conta Google conectada nesta empresa."}
          </p>
          <p className="text-xs text-muted-foreground">
            Agendamentos são enviados à agenda principal conectada. Os horários
            ocupados no Google são bloqueados no link público. A atualização do
            Google ocorre em até um minuto.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              disabled={busy || !q.data?.google?.configured}
              onClick={() => void act("google_connect")}
            >
              Conectar Google Agenda
            </Button>
            {q.data?.google?.connected && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void act("google_disconnect")}
              >
                Desconectar Google
              </Button>
            )}
          </div>
          {!q.data?.google?.configured && (
            <p className="text-sm text-muted-foreground">
              As credenciais OAuth do Google precisam ser configuradas no
              servidor antes de conectar.
            </p>
          )}
          <details className="text-xs text-muted-foreground">
            <summary>URI de retorno para configurar no Google Cloud</summary>
            <p className="break-all mt-2">{q.data?.google?.redirect_uri}</p>
          </details>
        </section>
      )}
      {kind === "webhook" && (
        <section className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="font-semibold">Webhook externo</h3>
          <p className="text-sm text-muted-foreground">
            Receba contatos de outras fontes e dispare o gatilho “Webhook
            externo”. Mantenha o endereço em segredo.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              disabled={busy || !stage}
              onClick={() => void act("save_webhook", { enabled: true })}
            >
              Ativar nesta etapa
            </Button>
            {q.data?.webhook && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void act("save_webhook", { enabled: false })}
              >
                Desativar
              </Button>
            )}
          </div>
          {q.data?.webhook && (
            <>
              <Input
                aria-label="Endereço do webhook externo"
                readOnly
                value={q.data.webhook.url}
              />
              <p className="text-xs">
                {q.data.webhook.enabled ? "Ativo" : "Desativado"} · POST JSON
                com request_id único por envio:
              </p>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">
                {
                  '{\n  "request_id": "UUID-do-envio",\n  "contact": {"name": "Nome", "phone": "5511999999999", "email": ""}\n}'
                }
              </pre>
            </>
          )}
        </section>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
