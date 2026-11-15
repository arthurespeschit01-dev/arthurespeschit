import { useCallback, useReducer } from "react";
import type { Edge } from "@xyflow/react";
import type { FlowNode } from "@/lib/workspaceCommercial";
interface Graph {
  nodes: FlowNode[];
  edges: Edge[];
}
type Update<T> = T | ((v: T) => T);
interface State {
  graph: Graph;
  past: Graph[];
  future: Graph[];
  group?: string;
}
type Action =
  | { type: "nodes"; value: Update<FlowNode[]>; group?: string }
  | { type: "edges"; value: Update<Edge[]> }
  | { type: "graph"; value: Graph; group?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "end" };
const initial = (graph: Graph): State => ({ graph, past: [], future: [] });
export function flowGraphReducer(s: State, a: Action): State {
  if (a.type === "end") return s.group ? { ...s, group: undefined } : s;
  if (a.type === "undo") {
    if (!s.past.length) return s;
    return {
      graph: s.past[s.past.length - 1],
      past: s.past.slice(0, -1),
      future: [s.graph, ...s.future].slice(0, 50),
    };
  }
  if (a.type === "redo") {
    if (!s.future.length) return s;
    return {
      graph: s.future[0],
      past: [...s.past, s.graph].slice(-50),
      future: s.future.slice(1),
    };
  }
  const next =
    a.type === "graph"
      ? a.value
      : a.type === "nodes"
        ? {
            ...s.graph,
            nodes:
              typeof a.value === "function" ? a.value(s.graph.nodes) : a.value,
          }
        : {
            ...s.graph,
            edges:
              typeof a.value === "function" ? a.value(s.graph.edges) : a.value,
          };
  if (next.nodes === s.graph.nodes && next.edges === s.graph.edges) return s;
  const group = "group" in a ? a.group : undefined;
  return {
    graph: next,
    past: group && s.group === group ? s.past : [...s.past, s.graph].slice(-50),
    future: [],
    group,
  };
}
export default function useFlowGraph(graph: Graph) {
  const [state, dispatch] = useReducer(flowGraphReducer, graph, initial);
  const setNodes = useCallback(
    (value: Update<FlowNode[]>, group?: string) =>
      dispatch({ type: "nodes", value, group }),
    [],
  );
  const setEdges = useCallback(
    (value: Update<Edge[]>) => dispatch({ type: "edges", value }),
    [],
  );
  const setGraph = useCallback(
      (value: Graph, group?: string) =>
        dispatch({ type: "graph", value, group }),
      [],
    ),
    undo = useCallback(() => dispatch({ type: "undo" }), []),
    redo = useCallback(() => dispatch({ type: "redo" }), []),
    endGroup = useCallback(() => dispatch({ type: "end" }), []);
  return {
    raw: state.graph.nodes,
    edges: state.graph.edges,
    setRaw: setNodes,
    setEdges,
    setGraph,
    undo,
    redo,
    endGroup,
    canUndo: !!state.past.length,
    canRedo: !!state.future.length,
  };
}
