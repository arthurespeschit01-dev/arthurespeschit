import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { workspaceOperation, dateLabel } from "@/lib/workspaceCommercial";
import { ShareLink } from "./CommercialShared";
interface Feed {
  enabled: boolean;
  url: string | null;
  available: number;
  without_click: number;
  fetched_7d: number;
  last_fetched_at: string | null;
}
export default function WorkspaceGoogleFeed({
  workspace,
  apiEnabled = false,
}: {
  workspace: string;
  apiEnabled?: boolean;
}) {
  const { user } = useAuth(),
    client = useQueryClient(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = ["workspace-google-feed", user?.id, workspace];
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      workspaceOperation<Feed>("google_feed_settings", {
        workspace_id: workspace,
      }),
    refetchInterval: 10000,
  });
  const save = async (enabled: boolean, rotate = false) => {
    setBusy(true);
    setError("");
    try {
      if (enabled && apiEnabled) {
        await workspaceOperation("save_provider", {
          workspace_id: workspace,
          kind: "google_ads",
          enabled: false,
          credentials: {},
        });
      }
      await workspaceOperation("save_google_feed", {
        workspace_id: workspace,
        values: { enabled, rotate },
      });
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await client.invalidateQueries({
        queryKey: ["workspace-providers", user?.id, workspace],
      });
      setBusy(false);
    }
  };
  return (
    <section className="border rounded-xl p-4 space-y-3 bg-card">
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">Envio automático para o Google Ads</h3>
        <label className="text-sm flex gap-2">
          <input
            type="checkbox"
            aria-label="Ativar importação CSV Google"
            disabled={busy || q.isPending || (apiEnabled && !q.data?.enabled)}
            checked={!!q.data?.enabled}
            onChange={(e) => void save(e.target.checked)}
          />
          {q.data?.enabled ? "Ativo" : "Desativado"}
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        O Google busca as conversões desta empresa pela URL abaixo, no horário
        configurado na importação. Copie o endereço uma vez para o Google Ads e
        configure uma busca diária.
      </p>
      {apiEnabled && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Há uma modalidade de envio anterior ativa. Ao usar a importação por
            URL, o envio anterior será desativado para evitar conversões
            duplicadas. Os dados salvos serão preservados.
          </p>
          <Button
            disabled={busy || q.isPending}
            onClick={() => void save(true)}
          >
            Usar importação por URL
          </Button>
        </div>
      )}
      {!q.data?.url && (
        <p className="text-sm text-muted-foreground">
          Ative o envio automático para gerar a URL de importação.
        </p>
      )}
      {q.data?.url && (
        <>
          <ShareLink url={q.data.url} />
          <p className="text-xs text-muted-foreground">
            Trate esta URL como uma senha: ela dá acesso às conversões desta
            empresa. Cole-a somente na importação do Google Ads.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href={q.data.url} download>
                Baixar CSV
              </a>
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Gerar nova URL? A URL anterior deixará de funcionar no Google.",
                  )
                )
                  void save(!!q.data?.enabled, true);
              }}
            >
              Nova URL
            </Button>
          </div>
        </>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          ["Disponíveis para importação", q.data?.available || 0],
          ["Incluídas em consultas (7 dias)", q.data?.fetched_7d || 0],
          [
            "Última consulta da URL",
            q.data?.last_fetched_at
              ? dateLabel(q.data.last_fetched_at)
              : "Nenhuma",
          ],
        ].map(([l, v]) => (
          <div key={l} className="border rounded-lg p-3 text-sm">
            <p className="text-xs text-muted-foreground">{l}</p>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {q.data?.without_click || 0} conversões sem gclid não entram neste CSV.
        Uma consulta ou download não comprova aceitação pelo Google; confira o
        diagnóstico da importação no Google Ads.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer">
          Como configurar no Google Ads (uma vez)
        </summary>
        <ol className="list-decimal pl-5 space-y-2 mt-3">
          <li>
            Crie uma ação de conversão de importação de cliques e use o mesmo
            nome nas regras abaixo.
          </li>
          <li>
            Em Metas → Conversões → Uploads/Importações programadas, configure
            uma fonte HTTPS e cole a URL.
          </li>
          <li>
            Agende a busca, faça a primeira importação e confira as mensagens de
            erro no Google Ads.
          </li>
          <li>
            Ative a marcação automática dos anúncios e instale o código dos
            links rastreáveis no seu site.
          </li>
        </ol>
      </details>
      {(q.error || error) && (
        <p role="alert" className="text-destructive">
          {error || q.error?.message}
        </p>
      )}
    </section>
  );
}
