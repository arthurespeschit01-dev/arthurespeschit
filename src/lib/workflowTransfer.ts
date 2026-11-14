import { workflowCatalog } from "@/components/pilot/workflowCatalog";
import type { WorkspaceFlow } from "./workspaceCommercial";
const kinds = new Set(workflowCatalog.flatMap((g) => g.items.map((i) => i[0])));
const secret =
  /^(access_token|api_key|auth_token|client_secret|secret|worker_secret|verify_token|refresh_token)$/i;
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !secret.test(k) &&
            !["__proto__", "prototype", "constructor"].includes(k),
        )
        .map(([k, v]) => [k, clean(v)]),
    );
  return value;
}
export function exportWorkflow(flow: WorkspaceFlow) {
  return JSON.stringify(
    {
      format: "central-gestor.workflow",
      version: 1,
      name: flow.name,
      definition: clean(flow.definition),
    },
    null,
    2,
  );
}
export function importWorkflow(text: string): WorkspaceFlow {
  if (new TextEncoder().encode(text).length > 100000)
    throw Error("Use um arquivo JSON de até 100 KB.");
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    throw Error("O arquivo não contém JSON válido.");
  }
  if (input?.format !== "central-gestor.workflow" || input.version !== 1)
    throw Error(
      "Formato não suportado. Importe um funil exportado pela Central do Gestor.",
    );
  const def = input.definition;
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 160 ||
    !Array.isArray(def?.nodes) ||
    !Array.isArray(def?.edges) ||
    !def.nodes.length ||
    def.nodes.length > 40 ||
    def.edges.length > 80 ||
    JSON.stringify(def).length > 60000
  )
    throw Error(
      "Revise o nome e os limites do funil (40 blocos e 80 conexões).",
    );
  const ids = new Set<string>();
  for (const n of def.nodes) {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(n?.id) ||
      ids.has(n.id) ||
      !kinds.has(n.type) ||
      !n.data ||
      typeof n.data !== "object" ||
      Array.isArray(n.data) ||
      !Number.isFinite(n.position?.x) ||
      !Number.isFinite(n.position?.y)
    )
      throw Error("O arquivo contém um bloco inválido ou repetido.");
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const e of def.edges) {
    if (
      typeof e.id !== "string" ||
      edgeIds.has(e.id) ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      (e.branch != null && typeof e.branch !== "string")
    )
      throw Error("O arquivo contém uma conexão inválida.");
    edgeIds.add(e.id);
  }
  const visited = new Set<string>(),
    stack = new Set<string>();
  function visit(id: string) {
    if (stack.has(id))
      throw Error(
        "O funil contém um ciclo. Remova as conexões que retornam a blocos anteriores.",
      );
    if (visited.has(id)) return;
    stack.add(id);
    def.edges
      .filter((e: { source: string }) => e.source === id)
      .forEach((e: { target: string }) => visit(e.target));
    stack.delete(id);
    visited.add(id);
  }
  ids.forEach(visit);
  return {
    id: "",
    name: input.name.trim().slice(0, 149) + " · importado",
    enabled: false,
    version: 1,
    definition: clean(def) as WorkspaceFlow["definition"],
  };
}
export function bindImportedWorkflow(
  flow: WorkspaceFlow,
  allowed: Record<string, string[]>,
) {
  const definition = structuredClone(flow.definition);
  for (const n of definition.nodes) {
    for (const key of ["webhook_id", "account_id", "asset_path"])
      delete n.data[key];
    for (const [key, values] of Object.entries(allowed)) {
      if (
        typeof n.data[key] === "string" &&
        n.data[key] &&
        !values.includes(String(n.data[key]))
      )
        n.data[key] = "";
    }
    if (Array.isArray(n.data.user_ids))
      n.data.user_ids = n.data.user_ids.filter((id) =>
        allowed.user_id?.includes(String(id)),
      );
    if (Array.isArray(n.data.rules))
      n.data.rules = n.data.rules.map((rule) => {
        const r = rule as { field: string; value: string };
        return r.field === "stage" && !allowed.stage_id?.includes(r.value)
          ? { ...r, value: "" }
          : r;
      });
  }
  return { ...flow, enabled: false, definition };
}
export function downloadText(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
