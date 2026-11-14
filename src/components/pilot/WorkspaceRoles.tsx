import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, type TeamMember } from "@/lib/workspaceCommercial";
const permissionModules = {
  crm: "CRM",
  forms: "Formulários",
  calendar: "Agendamentos",
  flows: "Funis e automações",
  conversations: "Conversas",
  tasks: "Tarefas e notificações",
  settings: "Configurações e integrações",
  team: "Pessoas (visualização)",
};
interface Role {
  id: string;
  name: string;
  color: string;
  admin_total: boolean;
  permissions: Record<string, string>;
  notifications: Record<string, boolean>;
}
interface Assignment {
  user_id: string;
  role_id: string;
}
function useWorkspaceRoles(workspace: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["workspace-roles", user?.id, workspace],
    queryFn: async () => {
      const [r, a] = await Promise.all([
        workspaceDb
          .from("agency_workspace_roles")
          .select("*")
          .eq("workspace_id", workspace)
          .order("name"),
        workspaceDb
          .from("agency_workspace_member_roles")
          .select("user_id,role_id")
          .eq("workspace_id", workspace),
      ]);
      if (r.error) throw r.error;
      if (a.error) throw a.error;
      return { roles: r.data as Role[], assignments: a.data as Assignment[] };
    },
  });
}
export function RoleAssignments({
  workspace,
  user,
  owner,
  manage,
}: {
  workspace: string;
  user: string;
  owner: boolean;
  manage: boolean;
}) {
  const q = useWorkspaceRoles(workspace),
    client = useQueryClient(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const assign = async (role: string, add: boolean) => {
    setBusy(true);
    setError("");
    const r = await workspaceDb.rpc("agency_workspace_assign_role", {
      p_workspace: workspace,
      p_user: user,
      p_role: role,
      p_assign: add,
    });
    if (r.error) setError(r.error.message);
    else {
      await client.invalidateQueries({ queryKey: ["workspace-roles"] });
      await client.invalidateQueries({ queryKey: ["pilot-client-workspaces"] });
    }
    setBusy(false);
  };
  if (owner)
    return (
      <span className="text-xs text-muted-foreground">
        Proprietário · acesso total
      </span>
    );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {q.data?.assignments
          .filter((a) => a.user_id === user)
          .map((a) => {
            const r = q.data.roles.find((r) => r.id === a.role_id);
            return (
              r && (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-white"
                  style={{ background: r.color }}
                >
                  {r.name}
                  {manage && (
                    <button
                      disabled={busy}
                      aria-label={`Remover função ${r.name}`}
                      onClick={() => void assign(r.id, false)}
                    >
                      ×
                    </button>
                  )}
                </span>
              )
            );
          })}
        {manage && (
          <select
            aria-label="Adicionar função ao membro"
            disabled={busy}
            className={selectClass}
            value=""
            onChange={(e) => void assign(e.target.value, true)}
          >
            <option value="">+ Adicionar função</option>
            {q.data?.roles
              .filter(
                (r) =>
                  !q.data.assignments.some(
                    (a) => a.user_id === user && a.role_id === r.id,
                  ),
              )
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
export default function WorkspaceRoles({
  workspace,
  members,
  manage,
}: {
  workspace: string;
  members: TeamMember[];
  manage: boolean;
}) {
  const q = useWorkspaceRoles(workspace),
    client = useQueryClient(),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<Role | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const role = draft || q.data?.roles.find((r) => r.id === selected);
  const patch = (v: Partial<Role>) => role && setDraft({ ...role, ...v });
  const save = async (remove = false) => {
    if (!role) return;
    setBusy(true);
    setError("");
    const r = await workspaceDb.rpc("agency_workspace_save_role", {
      p_workspace: workspace,
      p_id: role.id || null,
      p_values: remove ? null : role,
    });
    if (r.error) setError(r.error.message);
    else {
      setSelected(remove ? "" : r.data);
      setDraft(null);
      await client.invalidateQueries({ queryKey: ["workspace-roles"] });
      await client.invalidateQueries({ queryKey: ["pilot-client-workspaces"] });
    }
    setBusy(false);
  };
  const fresh = () => {
    setSelected("");
    setDraft({
      id: "",
      name: "Nova função",
      color: "#8b5cf6",
      admin_total: false,
      permissions: Object.fromEntries(
        Object.keys(permissionModules).map((k) => [k, "none"]),
      ),
      notifications: {},
    });
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Funções e permissões</h2>
          <p className="text-xs text-muted-foreground">
            Os cargos valem somente nesta empresa. Múltiplos cargos somam
            permissões.
          </p>
        </div>
        {manage && <Button onClick={fresh}>Nova função</Button>}
      </div>
      {q.error && <p role="alert">{q.error.message}</p>}
      <div className="grid md:grid-cols-[220px_1fr] gap-4">
        <aside className="space-y-2">
          <p className="text-xs text-muted-foreground">
            CARGOS ({q.data?.roles.length || 0})
          </p>
          <div className="border rounded-lg p-3 text-sm">
            <strong>Administrador · Sistema</strong>
            <p className="text-xs text-muted-foreground">
              Proprietário e administradores sem cargos personalizados
            </p>
          </div>
          {q.data?.roles.map((r) => (
            <button
              className={`w-full border rounded-lg p-3 text-left ${selected === r.id ? "border-primary bg-primary/10" : "bg-card"}`}
              key={r.id}
              onClick={() => {
                setSelected(r.id);
                setDraft(null);
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ background: r.color }}
              />
              {r.name}
              <p className="text-xs text-muted-foreground">
                {q.data.assignments.filter((a) => a.role_id === r.id).length}{" "}
                membros
              </p>
            </button>
          ))}
        </aside>
        {role ? (
          <section className="space-y-4">
            <fieldset disabled={!manage || busy} className="space-y-4">
              <div className="grid sm:grid-cols-[1fr_60px] gap-3">
                <label className="text-sm">
                  Nome da função
                  <Input
                    aria-label="Nome da função"
                    maxLength={80}
                    value={role.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label className="text-xs">
                  Cor
                  <Input
                    type="color"
                    aria-label="Cor da função"
                    value={role.color}
                    onChange={(e) => patch({ color: e.target.value })}
                  />
                </label>
              </div>
              <label className="border border-destructive/40 bg-destructive/5 p-4 rounded-xl flex justify-between gap-3">
                <span>
                  <strong>Administrador total</strong>
                  <p className="text-xs text-muted-foreground">
                    Acesso completo à empresa e às configurações. Sobrepõe as
                    permissões abaixo.
                  </p>
                </span>
                <input
                  type="checkbox"
                  aria-label="Administrador total"
                  checked={role.admin_total}
                  onChange={(e) => patch({ admin_total: e.target.checked })}
                />
              </label>
              <div className="border rounded-xl p-4 space-y-3">
                <h3 className="font-semibold">Acesso aos módulos</h3>
                <p className="text-xs text-muted-foreground">
                  A administração de membros e cargos exige Administrador total ou propriedade da empresa.
                </p>
                {Object.entries(permissionModules).map(([k, label]) => (
                  <label
                    key={k}
                    className="flex justify-between gap-3 items-center text-sm"
                  >
                    <span>{label}</span>
                    <select
                      aria-label={`Acesso a ${label}`}
                      className={selectClass}
                      disabled={role.admin_total}
                      value={role.permissions[k] || "none"}
                      onChange={(e) =>
                        patch({
                          permissions: {
                            ...role.permissions,
                            [k]: e.target.value,
                          },
                        })
                      }
                    >
                      {[
                        ["none", "Sem acesso"],
                        ["read", "Visualizar"],
                        ["write", "Criar e editar"],
                        ["manage", "Gerenciar e excluir"],
                      ]
                        .filter(
                          ([v]) => k !== "team" || ["none", "read"].includes(v),
                        )
                        .map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              <section className="space-y-2">
                <h3 className="font-semibold">Notificações internas</h3>
                <p className="text-xs text-muted-foreground">
                  Agendamentos: todos os membros deste cargo. Atribuição:
                  somente o responsável. Contratos e pagamentos não fazem parte
                  desta subconta e não geram notificações aqui.
                </p>
                {Object.entries({
                  lead_assigned: "Novo lead atribuído",
                  stage_changed: "Lead mudou de etapa",
                  appointment_created: "Novo agendamento recebido",
                  appointment_changed: "Agendamento cancelado ou remarcado",
                }).map(([k, l]) => (
                  <label
                    className="flex justify-between border rounded-lg p-3 text-sm"
                    key={k}
                  >
                    {l}
                    <input
                      type="checkbox"
                      aria-label={l}
                      checked={!!role.notifications[k]}
                      onChange={(e) =>
                        patch({
                          notifications: {
                            ...role.notifications,
                            [k]: e.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </section>
              <div className="flex gap-2">
                <Button
                  disabled={!role.name.trim()}
                  onClick={() => void save()}
                >
                  Salvar função
                </Button>
                {role.id && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Excluir esta função? Ela precisa estar sem membros.",
                        )
                      )
                        void save(true);
                    }}
                  >
                    Excluir função
                  </Button>
                )}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {members.length} membros nesta empresa. Atribua cargos na aba
              Membros.
            </p>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            Selecione um cargo ou crie uma função para configurar permissões.
          </p>
        )}
      </div>
    </div>
  );
}
