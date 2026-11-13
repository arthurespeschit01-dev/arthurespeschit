import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  workspaceDb,
  workspaceError,
  type WorkspaceStage,
} from "@/lib/clientWorkspaces";
import {
  commercialData,
  type CaptureForm,
  type Submission,
  type WorkspaceCalendar,
  type Appointment,
  type WorkspaceFlow,
  type FlowRun,
  type TeamMember,
  dateLabel,
} from "@/lib/workspaceCommercial";
import WorkspaceForms from "./WorkspaceForms";
import WorkspaceFlows from "./WorkspaceFlows";
import WorkspaceScheduling from "./WorkspaceScheduling";
import WorkspaceTeam from "./WorkspaceTeam";
import WorkspaceIntegrations from "./WorkspaceIntegrations";
import WorkspaceConversations from "./WorkspaceConversations";
import { useState } from "react";
interface Task {
  id: string;
  title: string;
  completed: boolean;
  due_at: string | null;
}
interface Notice {
  id: string;
  title: string;
  created_at: string;
}
export default function WorkspaceCommercial({
  workspace,
  owner,
  section,
  stages,
  manage,
  write,
}: {
  workspace: string;
  owner: string;
  section: string;
  stages: WorkspaceStage[];
  manage: boolean;
  write: boolean;
}) {
  const { user } = useAuth(),
    client = useQueryClient(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["workspace-commercial", user?.id, workspace, manage],
    queryFn: () => commercialData(workspace, manage),
    refetchOnMount: "always",
    refetchInterval: 10000,
    enabled: !["conversas", "integracoes"].includes(section),
  });
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: ["workspace-commercial", user?.id, workspace],
    });
    void client.invalidateQueries({
      queryKey: ["pilot-client-workspaces", user?.id, workspace],
    });
  };
  const run = (fn: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    void Promise.resolve()
      .then(fn)
      .then((r) => {
        if (r.error) throw r.error;
        refresh();
      })
      .catch((e) => setError(workspaceError(e)))
      .finally(() => setBusy(false));
  };
  if (section === "conversas")
    return (
      <WorkspaceConversations
        key={workspace}
        workspace={workspace}
        write={write}
      />
    );
  if (section === "integracoes")
    return (
      <WorkspaceIntegrations
        key={workspace}
        workspace={workspace}
        stages={stages}
        manage={manage}
      />
    );
  if (q.isPending) return <p role="status">Carregando módulos…</p>;
  if (q.error)
    return (
      <div role="alert">
        <p>{workspaceError(q.error)}</p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  const data = q.data!,
    forms = data.forms as CaptureForm[],
    responses = data.form_submissions as Submission[],
    calendars = data.calendars as WorkspaceCalendar[],
    appointments = data.appointments as Appointment[],
    flows = data.flows as WorkspaceFlow[],
    runs = data.flow_runs as FlowRun[],
    members = data.members as TeamMember[];
  return (
    <div className="space-y-4" aria-busy={busy}>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {section === "formularios" ? (
        <WorkspaceForms
          workspace={workspace}
          forms={forms}
          responses={responses}
          stages={stages}
          manage={manage}
          write={write}
          run={run}
        />
      ) : section === "agendamentos" ? (
        <WorkspaceScheduling
          workspace={workspace}
          calendars={calendars}
          appointments={appointments}
          stages={stages}
          manage={manage}
          write={write}
          run={run}
        />
      ) : section === "funis" ? (
        <WorkspaceFlows
          workspace={workspace}
          flows={flows}
          runs={runs}
          forms={forms}
          calendars={calendars}
          stages={stages}
          members={members}
          manage={manage}
          run={run}
        />
      ) : section === "equipe" ? (
        <WorkspaceTeam
          workspace={workspace}
          owner={owner}
          members={members}
          invites={data.invitations || []}
          manage={manage}
          run={run}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              ["Formulários recebidos", responses.length],
              [
                "Não analisados",
                responses.filter((r) => !r.analyzed_at).length,
              ],
              [
                "Agendamentos confirmados",
                appointments.filter((a) => a.status === "confirmed").length,
              ],
              ["Funis ativos", flows.filter((f) => f.enabled).length],
              ["Visualizações dos formulários", data.form_views.length],
              [
                "Respostas → agendamento",
                appointments.filter(
                  (a) =>
                    a.lead_id && responses.some((r) => r.lead_id === a.lead_id),
                ).length,
              ],
              [
                "Execuções concluídas",
                runs.filter((r) => r.status === "completed").length,
              ],
              [
                "Execuções com falha",
                runs.filter((r) => r.status === "failed").length,
              ],
            ].map(([label, n]) => (
              <div key={label} className="border rounded-xl p-4 bg-card">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold mt-2">{n}</p>
              </div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <section className="border rounded-xl bg-card p-4 space-y-3">
              <h3 className="font-semibold">Tarefas de atendimento</h3>
              {(data.tasks as Task[])
                .filter((t) => !t.completed)
                .map((t) => (
                  <label
                    key={t.id}
                    className="flex gap-3 items-start text-sm border-b pb-2"
                  >
                    <input
                      className="mt-1"
                      type="checkbox"
                      disabled={!write}
                      checked={t.completed}
                      onChange={(e) =>
                        run(() =>
                          workspaceDb
                            .from("agency_workspace_tasks")
                            .update({ completed: e.target.checked })
                            .eq("workspace_id", workspace)
                            .eq("id", t.id),
                        )
                      }
                    />
                    <span>
                      {t.title}
                      {t.due_at && (
                        <span className="block text-xs text-muted-foreground">
                          Prazo: {dateLabel(t.due_at)}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              {!(data.tasks as Task[]).some((t) => !t.completed) && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma tarefa em aberto. Seus funis podem criar tarefas
                  automaticamente.
                </p>
              )}
            </section>
            <section className="border rounded-xl bg-card p-4 space-y-3">
              <h3 className="font-semibold">Atividade recente</h3>
              {(data.notifications as Notice[])
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 10)
                .map((n) => (
                  <div key={n.id} className="border-b pb-2">
                    <p className="text-sm">{n.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateLabel(n.created_at)}
                    </p>
                  </div>
                ))}
              {!data.notifications.length && (
                <p className="text-sm text-muted-foreground">
                  As notificações dos funis aparecerão aqui.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
