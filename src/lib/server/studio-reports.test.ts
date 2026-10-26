import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/server/conversas", () => ({ CANAIS_DE_TESTE: ["playground", "builder_preview"] }));

import { montarFunil } from "./studio-reports";

describe("montarFunil", () => {
  it("junta as contagens por Bloco, na ordem do fluxo, e calcula quem parou", () => {
    const nos = [{ id: "b1", label: "Boas-vindas" }, { id: "b2", label: "Menu" }];
    const r = montarFunil(
      [
        { nodeId: "b2", action: "entered", value: null, n: 10 },
        { nodeId: "b2", action: "exited_any", value: null, n: 6 },
        { nodeId: "b2", action: "exited", value: "Vendas", n: 4 },
        { nodeId: "b2", action: "exited", value: "Suporte", n: 3 },
        { nodeId: "b2", action: "no_reply", value: null, n: 1 },
        { nodeId: "b2", action: "clicked", value: "Vendas", n: 4 },
        { nodeId: "b1", action: "entered", value: null, n: 12 },
        { nodeId: "b1", action: "exited_any", value: null, n: 12 },
        { nodeId: "x", action: "entered", value: null, n: 1 },
        { nodeId: null, action: "entered", value: null, n: 9 },
      ],
      nos
    );
    expect(r.map((l) => [l.label, l.entered, l.exited, l.noReply, l.stopped])).toEqual([
      ["Boas-vindas", 12, 12, 0, 0],
      ["Menu", 10, 6, 1, 3],
      ["Bloco apagado", 1, 0, 0, 1],
    ]);
    expect(r[1].exits).toEqual([{ label: "Vendas", count: 4 }, { label: "Suporte", count: 3 }]);
    expect(r[1].buttons).toEqual([{ label: "Vendas", count: 4 }]);
  });
});
