import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  workspaceDb,
  workspaceError,
  money,
  type WorkspaceLead,
  type WorkspaceStage,
} from "@/lib/clientWorkspaces";
import { Button } from "@/components/ui/button";
import { downloadText } from "@/lib/workflowTransfer";
import { dateLabel } from "@/lib/workspaceCommercial";
interface Change {
  id: string;
  lead_id: string;
  actor_id: string | null;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  created_at: string;
  undone_at: string | null;
}
const fields: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  email: "E-mail",
  value: "Valor",
  notes: "Notas",
  pipeline_id: "Origem",
  stage_id: "Etapa",
  tags: "Tags",
  assignee_user_id: "Responsável",
  source_type: "Canal",
};
export default function WorkspaceCrmTools({
  workspace,
  leads,
  stages,
  write,
  selectLead,
  view,
  onViewChange: setView,
}: {
  workspace: string;
  leads: WorkspaceLead[];
  stages: WorkspaceStage[];
  write: boolean;
  selectLead: (lead: WorkspaceLead) => void;
  view: string;
  onViewChange: (view: string) => void;
}) {
  const { user } = useAuth(),
    client = useQueryClient();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const history = useQuery({
    queryKey: ["workspace-crm-history", user?.id, workspace],
    enabled: view === "history",
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_workspace_crm_history")
        .select("*")
        .eq("workspace_id", workspace)
        .order("created_at", { ascending: false })
        .limit(100);
      if (r.error) throw r.error;
      return r.data as Change[];
    },
  });
  const describe = (key: string, value: unknown) =>
    key === "stage_id"
      ? stages.find((s) => s.id === value)?.name || "Etapa indisponível"
      : key === "value"
        ? money(Number(value))
        : Array.isArray(value)
          ? value.join(", ")
          : value == null
            ? "—"
            : String(value);
  return (
    <section className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={view === "kanban" ? "default" : "outline"}
          onClick={() => setView("kanban")}
        >
          Kanban
        </Button>
        <Button
          variant={view === "list" ? "default" : "outline"}
          onClick={() => setView("list")}
        >
          Lista de oportunidades
        </Button>
        <Button
          variant={view === "history" ? "default" : "outline"}
          onClick={() => setView("history")}
        >
          Histórico do CRM
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const cell = (v: unknown) =>
              '"' +
              String(v ?? "")
                .replace(/"/g, '""')
                .replace(/^[=+@-]/, "'$&") +
              '"';
            const rows = [
              [
                "Nome",
                "Telefone",
                "E-mail",
                "Etapa",
                "Valor",
                "Origem",
                "Tags",
              ],
              ...leads.map((l) => [
                l.name,
                l.phone,
                l.email,
                stages.find((s) => s.id === l.stage_id)?.name,
                l.value,
                l.source_type,
                l.tags?.join(", "),
              ]),
            ];
            downloadText(
              "oportunidades.csv",
              "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n"),
              "text/csv;charset=utf-8",
            );
          }}
        >
          Exportar CSV
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {view === "list" && (
        <div className="overflow-x-auto border rounded-xl bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Nome", "Etapa", "Valor", "Origem", "Contato"].map((x) => (
                  <th key={x} className="text-left p-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-3">
                    <button
                      className="text-primary underline"
                      onClick={() => selectLead(l)}
                    >
                      {l.name}
                    </button>
                  </td>
                  <td className="p-3">
                    {stages.find((s) => s.id === l.stage_id)?.name}
                  </td>
                  <td className="p-3">{money(l.value)}</td>
                  <td className="p-3">{l.source_type || "manual"}</td>
                  <td className="p-3">{l.phone || l.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leads.length && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma oportunidade nesta origem.
            </p>
          )}
        </div>
      )}
      {view === "history" && (
        <div className="border rounded-xl bg-card p-4 space-y-4">
          <h3 className="font-semibold">Últimas 100 alterações da empresa</h3>
          <p className="text-xs text-muted-foreground">
            O histórico começa com esta atualização. Desfazer restaura os dados
            anteriores e pode disparar as automações da etapa ou tag restaurada.
            Alterações posteriores impedem a reversão.
          </p>
          {history.isPending && <p role="status">Carregando histórico…</p>}
          {history.error && <p role="alert">{workspaceError(history.error)}</p>}
          {history.data?.map((h) => (
            <article key={h.id} className="border-t pt-3 space-y-2">
              <div className="flex justify-between gap-3">
                <p className="font-medium">
                  {String(h.after_data.name)}{" "}
                  <span className="font-normal text-xs text-muted-foreground">
                    · {dateLabel(h.created_at)} ·{" "}
                    {h.actor_id === user?.id
                      ? "Você"
                      : h.actor_id
                        ? "Membro da equipe"
                        : "Sistema"}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!write || busy || !!h.undone_at}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Restaurar os dados anteriores? A mudança será auditada e poderá iniciar as automações configuradas.",
                      )
                    )
                      return;
                    setBusy(true);
                    setError("");
                    try {
                      const r = await workspaceDb.rpc(
                        "agency_workspace_undo_lead",
                        { p_workspace: workspace, p_history: h.id },
                      );
                      if (r.error) throw r.error;
                      await Promise.all([
                        client.invalidateQueries({
                          queryKey: [
                            "workspace-crm-history",
                            user?.id,
                            workspace,
                          ],
                        }),
                        client.invalidateQueries({
                          queryKey: ["pilot-client-workspaces", user?.id],
                        }),
                      ]);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {h.undone_at ? "Desfeito" : "Desfazer"}
                </Button>
              </div>
              <dl className="text-sm space-y-1">
                {Object.keys(fields)
                  .filter(
                    (k) =>
                      JSON.stringify(h.before_data[k]) !==
                      JSON.stringify(h.after_data[k]),
                  )
                  .map((k) => (
                    <div key={k}>
                      <dt className="inline font-medium">{fields[k]}: </dt>
                      <dd className="inline break-words">
                        {describe(k, h.before_data[k])} →{" "}
                        {describe(k, h.after_data[k])}
                      </dd>
                    </div>
                  ))}
              </dl>
            </article>
          ))}
          {history.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma alteração registrada desde a atualização.
            </p>
          )}
        </div>
      )}
      {/* Keep the existing board and all its controls mounted and available. */}
    </section>
  );
}
