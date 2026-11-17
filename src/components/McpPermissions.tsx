import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { workspaceDb, type ClientWorkspace } from "@/lib/clientWorkspaces";
import { mcpScopes } from "@/lib/centralMcp";
export interface McpSelection {
  scopes: string[];
  workspace_ids: string[];
  include_agency: boolean;
}
export default function McpPermissions({
  value,
  onChange,
  available = Object.keys(mcpScopes),
  disabled = false,
}: {
  value: McpSelection;
  onChange: (v: McpSelection) => void;
  available?: string[];
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["mcp-owned-workspaces", user?.id],
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_client_workspaces")
        .select("id,name")
        .eq("owner_user_id", user!.id)
        .eq("account_kind", "client")
        .eq("status", "active")
        .order("name");
      if (r.error) throw r.error;
      return r.data as Pick<ClientWorkspace, "id" | "name">[];
    },
  });
  return (
    <div className="space-y-4">
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="font-semibold mb-2">Contas autorizadas</legend>
        <label className="flex gap-2 items-start text-sm">
          <input
            type="checkbox"
            checked={value.include_agency}
            onChange={(e) =>
              onChange({ ...value, include_agency: e.target.checked })
            }
          />
          Conta da agência
        </label>
        {q.data?.map((w) => (
          <label key={w.id} className="flex gap-2 items-start text-sm">
            <input
              type="checkbox"
              checked={value.workspace_ids.includes(w.id)}
              onChange={(e) =>
                onChange({
                  ...value,
                  workspace_ids: e.target.checked
                    ? [...value.workspace_ids, w.id]
                    : value.workspace_ids.filter((id) => id !== w.id),
                })
              }
            />
            {w.name}
          </label>
        ))}
        {q.error && (
          <p role="alert">
            Não foi possível carregar as subcontas.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void q.refetch()}
            >
              Tentar novamente
            </button>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Somente as contas selecionadas ficam disponíveis. Subcontas criadas
          depois não são liberadas automaticamente.
        </p>
      </fieldset>
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="font-semibold mb-2">Permissões da ferramenta</legend>
        {available.map((scope) => (
          <label key={scope} className="flex gap-2 items-start text-sm">
            <input
              type="checkbox"
              checked={value.scopes.includes(scope)}
              onChange={(e) =>
                onChange({
                  ...value,
                  scopes: e.target.checked
                    ? [...value.scopes, scope]
                    : value.scopes.filter((s) => s !== scope),
                })
              }
            />
            {mcpScopes[scope] || scope}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Criar ou mudar etapas no CRM pode executar as automações já
        configuradas. O MCP não expõe senhas, tokens das integrações nem
        ferramentas de envio direto de mensagens.
      </p>
    </div>
  );
}
