import { describe, expect, it } from "vitest";
import { isActiveClient, matchesClientStatus } from "./clientStatus";

describe("client status separation", () => {
  it("only explicitly active clients enter operational routines", () => {
    expect(isActiveClient({ status: "Ativo" })).toBe(true);
    for (const status of [
      "Pausado",
      "Encerrado",
      "",
      null,
      undefined,
      "Desconhecido",
    ])
      expect(isActiveClient({ status })).toBe(false);
  });
  it("keeps archived clients accessible with an explicit filter", () => {
    expect(matchesClientStatus({ status: "Encerrado" }, "Todos")).toBe(true);
    expect(matchesClientStatus({ status: "Pausado" }, "Pausado")).toBe(true);
    expect(matchesClientStatus({ status: "Encerrado" }, "Ativo")).toBe(false);
  });
});
