import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
import {
  mcpApp,
  mcpScopes,
  defaultMcpScopes,
  MCP_SERVER_URL,
} from "@/lib/centralMcp";
import McpPermissions, { type McpSelection } from "@/components/McpPermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
interface Connection {
  id: string;
  name: string;
  scopes: string[];
  include_agency: boolean;
  workspace_ids: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  revoked_at: string | null;
}
export default function McpSettings() {
  const { user } = useAuth(),
    cache = useQueryClient();
  const key = ["mcp-connections", user?.id];
  const url = MCP_SERVER_URL;
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await workspaceDb.rpc("agency_mcp_connections");
      if (r.error) throw r.error;
      return r.data as Connection[];
    },
  });
  const [selection, setSelection] = useState<McpSelection>({
      scopes: defaultMcpScopes,
      workspace_ids: [],
      include_agency: true,
    }),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(""),
    [message, setMessage] = useState("");
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copiado.");
    } catch {
      setMessage(
        "Não foi possível copiar. Selecione e copie o conteúdo manualmente.",
      );
    }
  };
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Conexões MCP</h1>
        <Button variant="outline" asChild>
          <Link to="/configuracoes">Voltar às configurações</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Conecte ferramentas compatíveis com MCP remoto, como Claude e ChatGPT.
        Só a agência pode autorizar conexões e selecionar as subcontas
        acessíveis.
      </p>
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <h2 className="font-semibold">Conectar por URL e login</h2>
        <Label htmlFor="mcp-server-url">URL do servidor MCP</Label>
        <Input id="mcp-server-url" readOnly value={url} />
        <Button variant="outline" onClick={() => void copy(url)}>
          Copiar URL MCP
        </Button>
        <ol className="list-decimal pl-5 space-y-2 text-sm">
          <li>
            Na ferramenta, abra as configurações de conectores ou servidores MCP
            remotos e adicione esta URL.
          </li>
          <li>
            Selecione OAuth/login, quando solicitado, e entre com a conta da
            agência.
          </li>
          <li>Revise as contas e permissões antes de autorizar.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          A disponibilidade de conectores personalizados depende da ferramenta e
          do plano contratado. O servidor usa MCP por HTTP e OAuth com PKCE.
        </p>
      </section>
      <details className="rounded-xl border bg-card p-5">
        <summary className="cursor-pointer font-semibold">
          Conectar com token de acesso
        </summary>
        <p className="text-sm text-muted-foreground mt-3">
          Para clientes MCP que aceitam um cabeçalho Authorization. O token dura
          30 dias, aparece uma única vez e pode ser revogado abaixo.
        </p>
        <form
          className="space-y-4 mt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setMessage("");
            setToken("");
            try {
              const r = await mcpApp<{ access_token: string }>({
                action: "create_token",
                name: name.trim(),
                ...selection,
              });
              setToken(r.access_token);
              await cache.invalidateQueries({ queryKey: key });
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : "Não foi possível criar o token.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Label htmlFor="mcp-token-name">Nome da conexão</Label>
          <Input
            id="mcp-token-name"
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Claude da agência"
          />
          <McpPermissions
            value={selection}
            onChange={setSelection}
            disabled={busy}
          />
          <Button
            disabled={
              busy ||
              !selection.scopes.length ||
              (!selection.include_agency && !selection.workspace_ids.length)
            }
          >
            {busy ? "Gerando…" : "Gerar token MCP"}
          </Button>
        </form>
        {token && (
          <div className="mt-4 space-y-3 border rounded-lg p-4">
            <Label htmlFor="mcp-secret-token">
              Token privado — copie agora
            </Label>
            <Input
              id="mcp-secret-token"
              type="password"
              readOnly
              autoComplete="off"
              value={token}
            />
            <p className="text-xs text-muted-foreground">
              Use no cabeçalho Authorization: Bearer SEU_TOKEN. Guarde somente
              nas configurações da ferramenta autorizada.
            </p>
            <Button variant="outline" onClick={() => void copy(token)}>
              Copiar token
            </Button>
            <Button variant="ghost" onClick={() => setToken("")}>
              Ocultar token
            </Button>
          </div>
        )}
      </details>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ferramentas autorizadas</h2>
        {q.isPending && <p role="status">Carregando conexões…</p>}
        {q.error && (
          <p role="alert">
            Não foi possível carregar as conexões.{" "}
            <Button onClick={() => void q.refetch()} variant="outline">
              Tentar novamente
            </Button>
          </p>
        )}
        {q.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma ferramenta conectada.
          </p>
        )}
        {q.data?.map((c) => (
          <article
            className="rounded-xl border bg-card p-4 space-y-2"
            key={c.id}
          >
            <h3 className="font-semibold">
              {c.name} ·{" "}
              {c.revoked_at
                ? "Revogada"
                : new Date(c.expires_at) < new Date()
                  ? "Expirada"
                  : "Ativa"}
            </h3>
            <p className="text-sm">
              {c.include_agency ? "Agência" : "Sem acesso à agência"} ·{" "}
              {c.workspace_ids.length} subconta(s)
            </p>
            <p className="text-xs text-muted-foreground">
              {c.scopes.map((s) => mcpScopes[s] || s).join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Último uso:{" "}
              {c.last_used_at
                ? new Date(c.last_used_at).toLocaleString("pt-BR")
                : "Ainda não utilizada"}
            </p>
            {!c.revoked_at && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await workspaceDb.rpc("agency_mcp_connections", {
                      p_revoke: c.id,
                    });
                    if (r.error) throw r.error;
                    cache.setQueryData(key, r.data);
                    setMessage(
                      "Conexão revogada. A ferramenta não poderá mais acessar os dados.",
                    );
                  } catch (e) {
                    setMessage(
                      e instanceof Error
                        ? e.message
                        : "Não foi possível revogar.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Revogar acesso de {c.name}
              </Button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
