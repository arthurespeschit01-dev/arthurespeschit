import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { dateLabel } from "@/lib/workspaceCommercial";
import { Button } from "@/components/ui/button";
export default function FlowExecutions({
  workspace,
  flow,
  onClose,
}: {
  workspace: string;
  flow: string;
  onClose: () => void;
}) {
  const { user } = useAuth(),
    [selected, setSelected] = useState("");
  const runs = useQuery({
    queryKey: ["flow-editor-runs", user?.id, workspace, flow],
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_workspace_flow_runs")
        .select("id,status,error,created_at,version,next_run_at")
        .eq("workspace_id", workspace)
        .eq("flow_id", flow)
        .order("created_at", { ascending: false })
        .limit(50);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!flow,
    refetchInterval: 5000,
  });
  const steps = useQuery({
    queryKey: ["flow-editor-steps", user?.id, workspace, selected],
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_workspace_flow_steps")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("run_id", selected)
        .order("created_at");
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!selected,
    refetchInterval: 5000,
  });
  return (
    <aside
      aria-label="Execuções do funil"
      className="absolute z-40 right-0 inset-y-0 w-full max-w-xl border-l bg-card shadow-xl overflow-y-auto p-5 space-y-4"
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold">Execuções</h2>
        <Button variant="outline" size="sm" onClick={onClose}>
          Fechar histórico
        </Button>
      </div>
      {!flow ? (
        <p className="text-sm text-muted-foreground">
          Salve o funil antes de acompanhar execuções.
        </p>
      ) : runs.error ? (
        <p role="alert">Não foi possível carregar as execuções.</p>
      ) : !runs.data?.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma execução. O funil deve estar ativo e receber um evento
          compatível com o gatilho.
        </p>
      ) : (
        runs.data.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id)}
            className={`w-full text-left rounded-lg border p-3 text-sm ${selected === r.id ? "border-primary" : ""}`}
          >
            <span className="font-medium">
              {dateLabel(r.created_at)} · versão {r.version}
            </span>
            <span className="block text-xs mt-1">
              {
                (
                  {
                    queued: "Na fila",
                    running: "Executando",
                    waiting: "Aguardando",
                    completed: "Concluído",
                    failed: "Falhou",
                    cancelled: "Cancelado",
                  } as Record<string, string>
                )[r.status]
              }
            </span>
            {r.error && (
              <span className="block mt-2 text-xs text-destructive">
                {r.error}
              </span>
            )}
          </button>
        ))
      )}
      {selected && (
        <section className="space-y-2 border-t pt-3">
          <h3 className="font-semibold text-sm">Passos da execução</h3>
          {steps.error ? (
            <p role="alert" className="text-sm">
              Não foi possível carregar os passos.
            </p>
          ) : (
            steps.data?.map((s) => (
              <article
                key={s.node_id}
                className="border rounded-lg p-3 text-xs"
              >
                <p className="font-semibold">
                  {s.action} · {s.status}
                </p>
                <p>{s.detail}</p>
                <p className="text-muted-foreground mt-1">
                  {dateLabel(s.created_at)}
                </p>
              </article>
            ))
          )}
        </section>
      )}
    </aside>
  );
}
