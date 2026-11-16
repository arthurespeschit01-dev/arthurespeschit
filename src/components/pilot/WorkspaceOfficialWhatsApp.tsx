import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { workspaceOperation } from "@/lib/workspaceCommercial";
import {
  loadMetaSdk,
  currentMetaSdk,
  launchMetaSignup,
} from "@/lib/metaWhatsAppSignup";
interface Settings {
  configured: boolean;
  app_id: string | null;
  config_id: string | null;
  version: string;
  connected: boolean;
  coexistence: boolean;
  phone_number_id: string | null;
  webhook_url: string;
}
interface Session {
  nonce: string;
  app_id: string;
  config_id: string;
  version: string;
}
export default function WorkspaceOfficialWhatsApp({
  workspace,
  stage,
  pipeline,
  blocked,
  onConnected,
  connectionVerified,
  statusError,
}: {
  workspace: string;
  stage: string;
  pipeline: string;
  blocked: boolean;
  onConnected: () => Promise<unknown>;
  connectionVerified?: boolean;
  statusError?: string;
}) {
  const { user } = useAuth(),
    client = useQueryClient();
  const [phase, setPhase] = useState<"authorizing" | "finishing" | null>(null);
  const busy = phase !== null;
  const [activeMode, setActiveMode] = useState<
    "business_app" | "new_number" | null
  >(null);
  const [error, setError] = useState(""),
    [sdkReady, setSdkReady] = useState(false);
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const attempt = useRef<AbortController | null>(null);
  useEffect(() => () => attempt.current?.abort(), []);
  const key = ["workspace-official-whatsapp", user?.id, workspace];
  const settings = useQuery({
    queryKey: key,
    queryFn: () =>
      workspaceOperation<Settings>("cloud_settings", {
        workspace_id: workspace,
      }),
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });
  useEffect(() => {
    setSdkReady(false);
    if (!settings.data?.configured || !settings.data.app_id) return;
    let active = true;
    setError("");
    loadMetaSdk(settings.data.app_id, settings.data.version)
      .then(() => {
        if (active) setSdkReady(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [
    settings.data?.configured,
    settings.data?.app_id,
    settings.data?.version,
    sdkAttempt,
  ]);
  const enabled =
    !!settings.data?.configured && !blocked && !settings.data.connected;
  const business = useQuery({
    queryKey: [...key, "session", "business_app"],
    queryFn: () =>
      workspaceOperation<Session>("cloud_begin", {
        workspace_id: workspace,
        mode: "business_app",
      }),
    enabled,
    staleTime: 180000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const fresh = useQuery({
    queryKey: [...key, "session", "new_number"],
    queryFn: () =>
      workspaceOperation<Session>("cloud_begin", {
        workspace_id: workspace,
        mode: "new_number",
      }),
    enabled,
    staleTime: 180000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const start = async (mode: "business_app" | "new_number") => {
    const session = mode === "business_app" ? business : fresh;
    if (!session.data || !sdkReady) return;
    if (Date.now() - session.dataUpdatedAt > 480000) {
      await session.refetch();
      setError(
        "A autorização foi renovada. Clique em conectar para continuar.",
      );
      return;
    }
    setActiveMode(mode);
    setPhase("authorizing");
    setError("");
    try {
      const sdk = currentMetaSdk(session.data.app_id, session.data.version);
      if (!sdk)
        throw Error(
          "O login da Meta ainda não está pronto. Recarregue a página e tente novamente.",
        );
      const controller = new AbortController();
      attempt.current = controller;
      // Invoke FB.login synchronously in the click handler, without awaiting a loader or network request.
      const authorization = launchMetaSignup(
        sdk,
        session.data.config_id,
        mode,
        controller.signal,
      );
      const result = await authorization;
      if (controller.signal.aborted) return;
      setPhase("finishing");
      await workspaceOperation("cloud_complete", {
        workspace_id: workspace,
        ...result,
        nonce: session.data.nonce,
        stage_id: stage,
        pipeline_id: pipeline,
      });
      await onConnected();
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      attempt.current = null;
      setPhase(null);
      await client.invalidateQueries({ queryKey: [...key, "session"] });
    }
  };
  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h3 className="font-semibold">WhatsApp API Oficial</h3>
          <p className="text-xs text-muted-foreground">
            Conexão oficial da Meta
          </p>
        </div>
        <span className="text-xs">
          {settings.data?.connected
            ? connectionVerified
              ? "Conectado"
              : statusError
                ? "Conexão não confirmada"
                : "Verificando conexão…"
            : "Desconectado"}
        </span>
      </div>
      <p className="text-sm font-medium">
        Este número já está no app WhatsApp Business do celular?
      </p>
      <div className="grid lg:grid-cols-2 gap-4">
        {(
          [
            [
              "business_app",
              "Sim, já uso no WhatsApp Business",
              "Continua no aplicativo do celular quando a Meta habilitar a coexistência para o seu número.",
              "Conectar meu número do WhatsApp Business",
            ],
            [
              "new_number",
              "Não, é um número novo",
              "A Meta verifica o número por SMS ou ligação e conclui o cadastro na plataforma.",
              "Conectar número novo",
            ],
          ] as const
        ).map(([mode, title, description, label]) => {
          const session = mode === "business_app" ? business : fresh;
          return (
            <article
              key={mode}
              className="rounded-lg border p-4 flex flex-col gap-3"
            >
              <h4 className="text-sm font-semibold">{title}</h4>
              <p className="text-sm text-muted-foreground">{description}</p>
              <div className="text-xs text-muted-foreground space-y-2 flex-1">
                {mode === "business_app" ? (
                  <>
                    <p>
                      As mensagens novas podem aparecer na Central e no celular,
                      conforme os recursos autorizados pela Meta.
                    </p>
                    <p>
                      A importação de conversas antigas não está disponível
                      nesta versão.
                    </p>
                  </>
                ) : (
                  <p>
                    Não apague sua conta do WhatsApp para tentar conectar. Se o
                    número já estiver em uso, confira a modalidade correta na
                    Meta.
                  </p>
                )}
              </div>
              <Button
                variant={mode === "business_app" ? "default" : "outline"}
                disabled={
                  busy ||
                  !stage ||
                  !enabled ||
                  !sdkReady ||
                  session.isPending ||
                  !session.data
                }
                onClick={() => void start(mode)}
              >
                {busy && activeMode === mode ? "Conectando…" : label}
              </Button>
            </article>
          );
        })}
      </div>
      {busy && (
        <div role="status" className="border rounded-lg p-3 space-y-2 text-sm">
          <p>
            {phase === "authorizing"
              ? "Conclua a autorização na janela da Meta. Se ela não apareceu, confira o indicador de pop-up bloqueado na barra do navegador."
              : "Validando a autorização e conectando o número. Aguarde a confirmação."}
          </p>
          {phase === "authorizing" && (
            <Button variant="outline" onClick={() => attempt.current?.abort()}>
              Cancelar conexão
            </Button>
          )}
        </div>
      )}
      {!settings.isPending && !settings.data?.configured && !settings.error && (
        <div className="border rounded-lg p-3 space-y-2 text-sm">
          <p>
            Ativação pendente: o aplicativo Meta da Central ainda precisa ser
            configurado. A conexão abre uma janela oficial do Facebook quando
            essa configuração estiver concluída.
          </p>
          <p className="text-xs text-muted-foreground">
            Necessário: App ID, App Secret, configuração do Facebook Login for
            Business v4, token de verificação do webhook e permissões WhatsApp
            aprovadas. Os segredos são configurados no servidor.
          </p>
          <details className="text-xs">
            <summary>Endereço do webhook para configurar no aplicativo</summary>
            <p className="break-all mt-2">{settings.data?.webhook_url}</p>
          </details>
        </div>
      )}
      {settings.data?.configured && !sdkReady && error && (
        <Button
          variant="outline"
          onClick={() => setSdkAttempt((value) => value + 1)}
        >
          Tentar carregar o login da Meta novamente
        </Button>
      )}
      {blocked && (
        <p className="text-sm">
          Desconecte a modalidade atual antes de trocar para a API oficial. O
          histórico será preservado.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Mensagens livres pela API oficial exigem uma mensagem recebida nas
        últimas 24 horas. O envio por modelos aprovados fora dessa janela ainda
        não está disponível.
      </p>
      {(error ||
        statusError ||
        settings.error ||
        business.error ||
        fresh.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error ||
            statusError ||
            settings.error?.message ||
            business.error?.message ||
            fresh.error?.message}
        </p>
      )}
    </section>
  );
}
