import type { FlowNode } from "./workspaceCommercial";
export interface EditableEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}
export function outlets(
  node: FlowNode,
): { id: string | null; label: string }[] {
  if (node.type === "split")
    return ((node.data.branches as { id: string; label: string }[]) || []).map(
      (b) => ({ id: b.id, label: b.label }),
    );
  if (["condition", "team_response", "wait_response"].includes(node.type))
    return [
      { id: "yes", label: node.type === "condition" ? "Sim" : "Respondeu" },
      {
        id: "no",
        label:
          node.type === "condition"
            ? "Não"
            : node.type === "team_response"
              ? "Sem resposta"
              : "Prazo esgotado",
      },
    ];
  return [{ id: null, label: "Próximo passo" }];
}
export function connectionIssue(
  nodes: FlowNode[],
  edges: EditableEdge[],
  source: string,
  target: string,
  handle: string | null = null,
): string | null {
  const from = nodes.find((n) => n.id === source),
    to = nodes.find((n) => n.id === target);
  if (!from || !to) return "Escolha dois blocos existentes.";
  if (source === target) return "Um bloco não pode se conectar a ele mesmo.";
  if (to.type === "trigger")
    return "O gatilho inicia o fluxo e não recebe conexões.";
  if (!outlets(from).some((o) => o.id === (handle || null)))
    return "Escolha uma saída válida do bloco.";
  if (
    edges.some(
      (e) =>
        e.source === source && (e.sourceHandle || null) === (handle || null),
    )
  )
    return "Esta saída já está conectada. Remova a conexão anterior para trocar o próximo passo.";
  const queue = [target],
    seen = new Set<string>();
  while (queue.length) {
    const id = queue.pop()!;
    if (id === source)
      return "Essa conexão criaria um ciclo. Escolha um bloco à frente.";
    if (seen.has(id)) continue;
    seen.add(id);
    edges.filter((e) => e.source === id).forEach((e) => queue.push(e.target));
  }
  return null;
}
export function nextPosition(
  nodes: FlowNode[],
  source?: FlowNode,
  branch: string | null = null,
) {
  const x = source ? source.position.x + (branch === "no" ? 360 : 0) : 160;
  let y = source ? source.position.y + 220 : 160;
  while (
    nodes.some(
      (n) =>
        Math.abs(n.position.x - x) < 300 && Math.abs(n.position.y - y) < 160,
    )
  )
    y += 200;
  return { x, y };
}
