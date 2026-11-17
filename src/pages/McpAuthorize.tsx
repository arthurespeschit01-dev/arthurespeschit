import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { mcpApp } from "@/lib/centralMcp";
import McpPermissions, { type McpSelection } from "@/components/McpPermissions";
import AuthPage from "./AuthPage";
import { Button } from "@/components/ui/button";
export default function McpAuthorize() {
  const { user, loading, signOut } = useAuth(),
    location = useLocation();
  const params = useMemo(
    () => Object.fromEntries(new URLSearchParams(location.search)),
    [location.search],
  );
  const description = useQuery({
    queryKey: ["mcp-authorization", location.search],
    queryFn: () =>
      mcpApp<{
        name: string;
        redirect_host: string;
        scopes: string[];
        denied_url: string;
      }>({ action: "describe", params }),
    retry: false,
  });
  const access = useQuery({
    queryKey: ["mcp-owner-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const r = await workspaceDb.rpc("agency_central_access");
      if (r.error) throw r.error;
      return r.data === true;
    },
  });
  const [selection, setSelection] = useState<McpSelection>({
      scopes: [],
      workspace_ids: [],
      include_agency: true,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (description.data)
      setSelection({
        scopes: description.data.scopes.filter((s) => s.endsWith(":read")),
        workspace_ids: [],
        include_agency: true,
      });
  }, [description.data]);
  if (loading || description.isPending)
    return (
      <p role="status" className="p-8">
        Preparando autorização MCP…
      </p>
    );
  if (description.error)
    return (
      <p role="alert" className="p-8">
        Esta solicitação MCP é inválida ou não está mais disponível. Volte à
        ferramenta e tente conectar novamente.
      </p>
    );
  if (!user)
    return (
      <div>
        <div className="text-center p-5">
          <h1 className="text-xl font-semibold">
            Conectar {description.data?.name} à Central do Gestor
          </h1>
          <p className="text-sm">
            Entre com a conta da agência para escolher as contas e permissões.
          </p>
        </div>
        <AuthPage allowSignUp={false} />
      </div>
    );
  if (access.isPending)
    return (
      <p role="status" className="p-8">
        Verificando a conta da agência…
      </p>
    );
  if (access.error || !access.data)
    return (
      <div className="p-8 space-y-3">
        <p role="alert">
          Somente a conta da agência pode autorizar conexões MCP. Membros
          convidados de subcontas não podem criar conexões.
        </p>
        <Button onClick={() => void signOut()}>Entrar com outra conta</Button>
      </div>
    );
  return (
    <main className="max-w-xl mx-auto my-10 rounded-xl border bg-card p-6 space-y-4">
      <h1 className="text-2xl font-bold">Autorizar {description.data?.name}</h1>
      <p className="text-sm">
        Conectando como {user.email}. O retorno será para{" "}
        <strong>{description.data?.redirect_host}</strong>.
      </p>
      <p className="text-sm text-muted-foreground">
        Revise o acesso que deseja conceder. Você pode revogá-lo depois em
        Configurações → Conexões MCP.
      </p>
      <McpPermissions
        value={selection}
        onChange={setSelection}
        available={description.data?.scopes}
        disabled={busy}
      />
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3">
        <Button
          disabled={
            busy ||
            !selection.scopes.length ||
            (!selection.include_agency && !selection.workspace_ids.length)
          }
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const r = await mcpApp<{ redirect_url: string }>({
                action: "consent",
                params,
                ...selection,
              });
              window.location.assign(r.redirect_url);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Não foi possível autorizar.",
              );
              setBusy(false);
            }
          }}
        >
          {busy ? "Autorizando…" : "Autorizar conexão"}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => window.location.assign(description.data!.denied_url)}
        >
          Cancelar
        </Button>
      </div>
    </main>
  );
}
