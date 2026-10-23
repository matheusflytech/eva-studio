import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./contexto", () => ({ montarContexto: vi.fn() }));

import { exemploProposta } from "@/lib/automacoes/exemplo.test-helpers";
import { avaliarRegra } from "@/lib/automacoes/condicoes";
import type { Condicao } from "@/lib/automacoes/tipos";
import { condicoesParaCumprir, valorQueCumpre } from "./teste-real";

const passa = (c: Condicao, campo: string, valor: unknown) => {
  const [raiz, chave] = campo.split(".");
  return avaliarRegra({ grupos: [{ condicoes: [c] }] }, { [raiz]: { [chave]: valor } }, new Date("2026-10-23T12:00:00Z"));
};

describe("registro de teste", () => {
  it("pega as condições do caminho \"sim\" de cada condição", () => {
    expect(condicoesParaCumprir(exemploProposta())).toEqual([{ campo: "registro.stage_id", operador: "igual", valor: "s_prop" }]);
  });

  it.each<[Condicao]>([
    [{ campo: "registro.amount_cents", operador: "maior", valor: 100000 }],
    [{ campo: "registro.amount_cents", operador: "menor_igual", valor: 5000 }],
    [{ campo: "registro.amount_cents", operador: "entre", valor: [1000, 3000] }],
    [{ campo: "registro.name", operador: "contem", valor: "Clínica" }],
    [{ campo: "registro.name", operador: "preenchido" }],
    [{ campo: "registro.stage_id", operador: "em", valor: ["s1", "s2"] }],
  ])("o valor inventado faz %j passar", (c) => {
    const v = valorQueCumpre(c);
    expect(v).not.toBeUndefined();
    expect(passa(c, c.campo, v)).toBe(true);
  });

  it("o que não dá para inventar fica de fora (e aparece como não cumprida)", () => {
    expect(valorQueCumpre({ campo: "registro.name", operador: "diferente", valor: "x" })).toBeUndefined();
    expect(valorQueCumpre({ campo: "registro.created_at", operador: "ultimos_dias", valor: 7 })).toBeUndefined();
  });
});
