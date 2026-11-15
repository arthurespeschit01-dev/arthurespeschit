import { describe, it, expect } from "vitest";
import { connectionIssue, nextPosition, outlets } from "./flowEditing";
import { flowGraphReducer } from "@/hooks/useFlowGraph";
import type { FlowNode } from "./workspaceCommercial";
const n = (id: string, type = "stage", x = 0, y = 0): FlowNode => ({
  id,
  type,
  position: { x, y },
  data: {},
});
describe("fast workflow editing", () => {
  it("rejects cycles, occupied outlets and connections into triggers", () => {
    const nodes = [n("t", "trigger"), n("a"), n("b")],
      edges = [
        { id: "one", source: "t", target: "a" },
        { id: "two", source: "a", target: "b" },
      ];
    expect(connectionIssue(nodes, edges, "b", "t")).toContain("gatilho");
    expect(connectionIssue(nodes, edges, "b", "a")).toContain("ciclo");
    expect(connectionIssue(nodes, edges, "a", "b")).toContain(
      "já está conectada",
    );
    expect(connectionIssue(nodes, edges, "b", "b")).toContain("mesmo");
    expect(connectionIssue(nodes, edges, "b", "a", "yes")).toContain(
      "saída válida",
    );
  });
  it("keeps conditional branches independent and avoids new-node overlaps", () => {
    const nodes = [n("c", "condition"), n("a", "stage", 0, 220)];
    expect(outlets(nodes[0]).map((o) => o.id)).toEqual(["yes", "no"]);
    expect(
      connectionIssue(
        nodes,
        [{ id: "yes", source: "c", target: "a", sourceHandle: "yes" }],
        "c",
        "a",
        "no",
      ),
    ).toBeNull();
    expect(nextPosition(nodes, nodes[0]).y).toBeGreaterThan(220);
  });
  it("undoes additions with edges atomically and groups a drag into one step", () => {
    const graph = { nodes: [n("t", "trigger")], edges: [] };
    let s = flowGraphReducer(
      { graph, past: [], future: [] },
      {
        type: "graph",
        value: {
          nodes: [...graph.nodes, n("a")],
          edges: [{ id: "e", source: "t", target: "a" }],
        },
      },
    );
    s = flowGraphReducer(s, { type: "undo" });
    expect(s.graph).toEqual(graph);
    s = flowGraphReducer(s, { type: "redo" });
    expect(s.graph.nodes).toHaveLength(2);
    s = flowGraphReducer(s, {
      type: "nodes",
      value: (v) =>
        v.map((x) => (x.id === "a" ? { ...x, position: { x: 40, y: 40 } } : x)),
      group: "drag",
    });
    s = flowGraphReducer(s, {
      type: "nodes",
      value: (v) =>
        v.map((x) => (x.id === "a" ? { ...x, position: { x: 80, y: 80 } } : x)),
      group: "drag",
    });
    s = flowGraphReducer(s, { type: "undo" });
    expect(s.graph.nodes[1].position).toEqual({ x: 0, y: 0 });
  });
});
