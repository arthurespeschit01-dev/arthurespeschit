import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workspaceDb } from "@/lib/clientWorkspaces";
import {
  roles,
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
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [role, setRole] = useState("agent");
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Pessoas e permissões</h2>
      <p className="text-sm text-muted-foreground">
        O convite concede acesso somente a esta empresa. O destinatário deve
        entrar com o mesmo e-mail, confirmado, e aceitar o convite.
      </p>
      {manage && (
        <form
          className="border rounded-xl p-4 grid sm:grid-cols-4 gap-3 bg-card"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              workspaceDb
                .from("agency_workspace_invitations")
                .insert({
                  workspace_id: workspace,
                  email: email.trim().toLowerCase(),
                  display_name: name.trim(),
                  role,
                }),
            );
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
            {Object.entries(roles)
              .filter(([k]) => k !== "owner")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
          <Button type="submit">Criar convite</Button>
        </form>
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
            </div>
            <div className="flex gap-2">
              {manage && m.user_id !== owner ? (
                <>
                  <select
                    aria-label={`Permissão de ${m.display_name || m.email}`}
                    className={selectClass}
                    value={m.role}
                    onChange={(e) =>
                      run(() =>
                        workspaceDb.rpc("agency_workspace_manage_member", {
                          p_workspace: workspace,
                          p_user: m.user_id,
                          p_role: e.target.value,
                        }),
                      )
                    }
                  >
                    {Object.entries(roles)
                      .filter(([k]) => k !== "owner")
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
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
                          workspaceDb.rpc("agency_workspace_manage_member", {
                            p_workspace: workspace,
                            p_user: m.user_id,
                            p_role: null,
                          }),
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
            <div key={i.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex justify-between flex-wrap gap-2">
                <p>
                  {i.display_name || i.email} · {roles[i.role]}
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
              {i.status === "pending" &&
                new Date(i.expires_at) > new Date() && (
                  <ShareLink url={publicLink("convite-equipe", i.token)} />
                )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
