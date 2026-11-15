import { describe, expect, it } from "vitest";
import {
  importWorkflow,
  exportWorkflow,
  bindImportedWorkflow,
} from "./workflowTransfer";
import type { WorkspaceFlow } from "./workspaceCommercial";
const flow: WorkspaceFlow = {
  id: "old",
  name: "Teste",
  enabled: true,
  version: 4,
  definition: {
    nodes: [
      {
        id: "t",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          event: "form_submitted",
          source_id: "old_form",
          access_token: "do-not-export",
        },
      },
      {
        id: "move",
        type: "move_stage",
        position: { x: 0, y: 100 },
        data: {
          stage_id: "old_stage",
          user_id: "old_user",
          account_id: "old_account",
          webhook_id: "old_webhook",
        },
      },
    ],
    edges: [{ id: "e", source: "t", target: "move" }],
  },
};
describe("workflow transfer", () => {
  it("exports only definition, strips credential fields and imports disabled", () => {
    const text = exportWorkflow(flow);
    expect(text).not.toContain("do-not-export");
    const next = importWorkflow(text);
    expect(next.enabled).toBe(false);
    expect(next.id).toBe("");
    expect(next.definition.edges).toEqual(flow.definition.edges);
  });
  it("does not carry account/webhook/foreign bindings into a destination", () => {
    const next = bindImportedWorkflow(importWorkflow(exportWorkflow(flow)), {
      source_id: ["new_form"],
      stage_id: ["new_stage"],
      user_id: [],
    });
    expect(next.definition.nodes[0].data.source_id).toBe("");
    expect(next.definition.nodes[1].data.stage_id).toBe("");
    expect(next.definition.nodes[1].data.account_id).toBeUndefined();
    expect(flow.definition.nodes[1].data.stage_id).toBe("old_stage");
  });
  it("rejects oversized, proprietary, broken and cyclic definitions", () => {
    expect(() => importWorkflow("x".repeat(100001))).toThrow("100 KB");
    expect(() => importWorkflow("{}")).toThrow("Formato");
    const next = JSON.parse(exportWorkflow(flow));
    next.definition.edges.push({ id: "back", source: "move", target: "t" });
    expect(() => importWorkflow(JSON.stringify(next))).toThrow("ciclo");
    next.definition.edges = [{ id: "bad", source: "t", target: "missing" }];
    expect(() => importWorkflow(JSON.stringify(next))).toThrow("conexão");
  });
});
