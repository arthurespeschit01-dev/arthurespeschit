export const MCP_SERVER_URL = "https://www.centraldogestor.site/mcp";
import { workspaceDb } from "./clientWorkspaces";
export const mcpScopes: Record<string, string> = {
  "clients:read": "Consultar clientes da agência",
  "minutes:read": "Consultar atas",
  "minutes:write": "Criar e editar atas",
  "tasks:read": "Consultar tarefas",
  "tasks:write": "Criar e editar tarefas",
  "crm:read": "Consultar CRM",
  "crm:write": "Criar leads e mudar etapas",
  "calendar:read": "Consultar agendamentos",
};
export const defaultMcpScopes = [
  "clients:read",
  "minutes:read",
  "tasks:read",
  "crm:read",
  "calendar:read",
];
export async function mcpApp<T>(body: Record<string, unknown>): Promise<T> {
  const r = await workspaceDb.functions.invoke("central-mcp?route=app", {
    body,
  });
  if (r.error) {
    let message = "Não foi possível concluir a solicitação MCP.";
    try {
      const detail = await r.error.context?.json();
      message = detail?.error_description || detail?.error || message;
    } catch {
      /* Use the fallback message when the response has no JSON body. */
    }
    throw Error(message);
  }
  return r.data as T;
}
