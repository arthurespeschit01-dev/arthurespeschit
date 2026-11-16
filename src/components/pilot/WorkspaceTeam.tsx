import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import WorkspaceRoles, { RoleAssignments } from "./WorkspaceRoles";
import { useWorkspaceRoles } from "@/hooks/useWorkspaceRoles";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workspaceDb } from "@/lib/clientWorkspaces";
import {
  roles,
  workspaceOperation,
  selectClass,
  publicLink,
  type TeamMember,
} from "@/lib/workspaceCommercial";
import { ShareLink, Empty } from "./CommercialShared";
interface Invite {
  id: string;
  email: string;
  display_name: string;
  role: string;
  custom_role_id?: string | null;
  email_sent_at?: string | null;
  email_error?: string | null;
  token: string;
  status: string;
  expires_at: string;
}
export default function WorkspaceTeam({
  workspace,
  owner,
  members,
  invites,
  manage,
  run,
}: {
  workspace: string;
  owner: string;
  members: TeamMember[];
  invites: Invite[];
  manage: boolean;
  run: (fn: () => PromiseLike<{ error: unknown }>) => void;
}) {
  const { user } = useAuth();
  const emailSettings = useQuery({
    queryKey: ["workspace-team-email", user?.id, workspace],
    enabled: manage,
    queryFn: () =>
      workspaceOperation<{ email_configured: boolean }>("team_settings", {
        workspace_id: workspace,
      }),
  });
  const roleQuery = useWorkspaceRoles(workspace);
  const [tab, setTab] = useState("members");
  const [emailMessage, setEmailMessage] = useState("");
  const [sending, setSending] = useState(false);
  const roleOptions = (
    <>
      {" "}
      {Object.entries(roles)
        .filter(([k]) => k !== "owner")
        .map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}{" "}
      {roleQuery.data?.roles.map((r) => (
        <option key={r.id} value={`custom:${r.id}`}>
          {r.name}
        </option>
      ))}{" "}
    </>
  );
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [role, setRole] = useState("agent");
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Button
          variant={tab === "roles" ? "default" : "outline"}
          onClick={() => setTab("roles")}
        >
          Funções
        </Button>
        <Button
          variant={tab === "members" ? "default" : "outline"}
          onClick={() => setTab("members")}
        >
          Membros
        </Button>
      </div>
      {tab === "roles" ? (
        <WorkspaceRoles
          workspace={workspace}
          members={members}
          manage={manage}
        />
      ) : (
        <>
          <h2 className="text-xl font-semibold">Membros e funções</h2>
          <p className="text-sm text-muted-foreground">
            O convite concede acesso somente a esta empresa. O destinatário deve
            entrar com o mesmo e-mail, confirmado, e aceitar o convite.
          </p>
          {manage && emailSettings.data?.email_configured === false && (
            <p className="text-sm text-muted-foreground">
              O envio por e-mail ainda não está disponível. Você pode criar o
              convite e compartilhar o link.
            </p>
          )}
          {manage && (
            <form
              className="border rounded-xl p-4 grid sm:grid-cols-4 gap-3 bg-card"
              onSubmit={(e) => {
                e.preventDefault();
                if (sending) return;
                setSending(true);
                setEmailMessage("");
                run(async () => {
                  try {
                    const result = await workspaceOperation<{
                      email_sent: boolean;
                      email_error?: string;
                    }>("invite_member", {
                      workspace_id: workspace,
                      email: email.trim().toLowerCase(),
                      display_name: name.trim(),
                      role: role.startsWith("custom:") ? "viewer" : role,
                      custom_role_id: role.startsWith("custom:")
                        ? role.slice(7)
                        : null,
                    });
                    setEmailMessage(
                      result.email_sent
                        ? "Convite salvo e e-mail enviado. O destinatário deve entrar com o e-mail convidado."
                        : result.email_error ||
                            "Convite salvo. Copie o link para compartilhar.",
                    );
                    return { error: null };
                  } finally {
                    setSending(false);
                  }
                });
              }}
            >
              <Input
                aria-label="Nome do convidado"
                placeholder="Nome"
                value={name}
                maxLength={160}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                aria-label="E-mail do convidado"
                placeholder="E-mail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <select
                aria-label="Permissão do convite"
                className={selectClass}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {roleOptions}
              </select>
              <Button type="submit" disabled={sending}>
                {sending ? "Enviando…" : "Criar convite"}
              </Button>
            </form>
          )}
          {emailMessage && (
            <p role="status" className="text-sm">
              {emailMessage}
            </p>
          )}
          <section className="space-y-2">
            <h3 className="font-semibold">Membros ({members.length})</h3>
            {members.map((m) => (
              <div
                key={m.user_id}
                className="border bg-card rounded-lg p-3 flex flex-wrap gap-3 items-center justify-between"
              >
                <div>
                  <p className="font-medium">
                    {m.display_name ||
                      m.email ||
                      (m.user_id === owner ? "Proprietário" : "Membro")}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                  <RoleAssignments
                    workspace={workspace}
                    user={m.user_id}
                    owner={m.user_id === owner}
                    manage={manage}
                  />
                </div>
                <div className="flex gap-2">
                  {manage && m.user_id !== owner ? (
                    <>
                      <select
                        aria-label={`Permissão de ${m.display_name || m.email}`}
                        className={selectClass}
                        value={
                          roleQuery.data?.assignments.filter(
                            (a) => a.user_id === m.user_id,
                          ).length === 1
                            ? `custom:${roleQuery.data.assignments.find((a) => a.user_id === m.user_id)!.role_id}`
                            : m.role
                        }
                        onChange={(e) =>
                          run(() =>
                            workspaceDb
                              .rpc("agency_workspace_set_member_role", {
                                p_workspace: workspace,
                                p_user: m.user_id,
                                p_role: e.target.value.startsWith("custom:")
                                  ? "viewer"
                                  : e.target.value,
                                p_custom: e.target.value.startsWith("custom:")
                                  ? e.target.value.slice(7)
                                  : null,
                              })
                              .then(async (result) => {
                                await roleQuery.refetch();
                                return result;
                              }),
                          )
                        }
                      >
                        {roleOptions}
                      </select>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remover o acesso deste membro a esta subconta?",
                            )
                          )
                            run(() =>
                              workspaceDb.rpc(
                                "agency_workspace_manage_member",
                                {
                                  p_workspace: workspace,
                                  p_user: m.user_id,
                                  p_role: null,
                                },
                              ),
                            );
                        }}
                      >
                        Remover acesso
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm">{roles[m.role]}</span>
                  )}
                </div>
              </div>
            ))}
          </section>
          {manage && (
            <section className="space-y-2">
              <h3 className="font-semibold">Convites</h3>
              {!invites.length && <Empty>Nenhum convite criado.</Empty>}
              {invites.map((i) => (
                <div
                  key={i.id}
                  className="rounded-lg border bg-card p-3 space-y-2"
                >
                  <div className="flex justify-between flex-wrap gap-2">
                    <p>
                      {i.display_name || i.email} ·{" "}
                      {i.custom_role_id
                        ? roleQuery.data?.roles.find(
                            (r) => r.id === i.custom_role_id,
                          )?.name || "Função personalizada"
                        : roles[i.role]}
                      <span className="text-xs text-muted-foreground ml-2">
                        {i.status === "accepted"
                          ? "Aceito"
                          : i.status === "revoked"
                            ? "Revogado"
                            : new Date(i.expires_at) < new Date()
                              ? "Expirado"
                              : "Pendente"}
                      </span>
                    </p>
                    {i.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          run(() =>
                            workspaceDb
                              .from("agency_workspace_invitations")
                              .update({ status: "revoked" })
                              .eq("workspace_id", workspace)
                              .eq("id", i.id),
                          )
                        }
                      >
                        Revogar
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i.email_error ||
                      (i.email_sent_at
                        ? "E-mail enviado. Se não encontrar, verifique spam ou copie o link."
                        : "O e-mail deste convite ainda não foi enviado.")}
                  </p>
                  {i.status === "pending" &&
                    new Date(i.expires_at) > new Date() && (
                      <div className="flex flex-wrap gap-2">
                        <select
                          aria-label={`Função do convite de ${i.email}`}
                          className={selectClass}
                          value={
                            i.custom_role_id
                              ? `custom:${i.custom_role_id}`
                              : i.role
                          }
                          onChange={(e) =>
                            run(() =>
                              workspaceDb
                                .from("agency_workspace_invitations")
                                .update({
                                  role: e.target.value.startsWith("custom:")
                                    ? "viewer"
                                    : e.target.value,
                                  custom_role_id: e.target.value.startsWith(
                                    "custom:",
                                  )
                                    ? e.target.value.slice(7)
                                    : null,
                                })
                                .eq("workspace_id", workspace)
                                .eq("id", i.id),
                            )
                          }
                        >
                          {roleOptions}
                        </select>
                        <Button
                          variant="outline"
                          onClick={() =>
                            run(async () => {
                              const r = await workspaceOperation<{
                                email_sent: boolean;
                                email_error?: string;
                              }>("send_invite_email", {
                                workspace_id: workspace,
                                id: i.id,
                              });
                              setEmailMessage(
                                r.email_sent
                                  ? "E-mail do convite reenviado."
                                  : r.email_error ||
                                      "Não foi possível enviar. Use o link.",
                              );
                              return { error: null };
                            })
                          }
                        >
                          Reenviar convite por e-mail
                        </Button>
                      </div>
                    )}
                  {i.status === "pending" &&
                    new Date(i.expires_at) > new Date() && (
                      <ShareLink url={publicLink("convite-equipe", i.token)} />
                    )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
