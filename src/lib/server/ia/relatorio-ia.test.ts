import { describe, it, expect } from "vitest";
import { montarPromptDeRelatorio, validarRelatorioDaIa } from "./relatorio-ia";
import type { CatalogoDoCrm } from "./consulta-ia";

const catalogo: CatalogoDoCrm = {
  funis: [{ id: "p1", name: "Vendas", stages: [{ id: "s1", name: "Proposta", type: "open" }] }],
  membros: [{ id: "u1", name: "Ana" }],
  etiquetas: [],
  empresas: [],
  canais: ["whatsapp"],
  motivosDePerda: ["Preço"],
  campos: [{ key: "origem", label: "Origem", type: "select", options: [] }],
};

describe("montarPromptDeRelatorio", () => {
  it("lista as bases, os personalizados só onde cabem e os nomes da org", () => {
    const p = montarPromptDeRelatorio(catalogo, { hoje: "2026-10-27" });
    expect(p).toMatch(/- deals \(.*cf:origem:text/);
    expect(p).not.toMatch(/- tasks \(.*cf:origem/);
    expect(p).toContain("Etapas de Vendas: Proposta");
    expect(p).toContain("Responsáveis: Ana");
  });
});

describe("validarRelatorioDaIa", () => {
  it("saneia a consulta e troca visual que não cabe", () => {
    const r = validarRelatorioDaIa({
      query: { dataset: "deals", metrics: [{ op: "sum", field: "amount" }], groupBy: [{ field: "owner" }], filters: { logic: "and", conditions: [{ field: "x; drop", op: "eq" }] } },
      viz: "number",
      titulo: "Receita por responsável",
    })!;
    expect(r.query.filters.conditions).toEqual([]);
    expect(r.viz).not.toBe("number");
    expect(r.titulo).toBe("Receita por responsável");
  });

  it("base inventada não vira cartão", () => {
    expect(validarRelatorioDaIa({ query: { dataset: "senhas" }, viz: "table" })).toBeNull();
    expect(validarRelatorioDaIa({ viz: "table" })).toBeNull();
  });
});
