import { describe, it, expect } from "vitest";
import { avaliarCondicao, avaliarRegra, lerCaminho } from "./condicoes";
import type { Operador } from "./tipos";

const ctx = {
  registro: {
    name: "Plano Anual",
    amount_cents: 150000,
    stage_id: "s2",
    tags: [{ id: "t1", name: "VIP" }],
    created_at: "2026-10-20T10:00:00Z",
    custom_fields: { cpf: "" },
  },
  contato: { name: "Ana Souza", opt_in: true },
  sistema: { dia_util: true },
};
const agora = new Date("2026-10-21T12:00:00Z");
const ok = (campo: string, operador: Operador, valor?: unknown) => avaliarCondicao({ campo, operador, valor }, ctx, agora);

describe("condições", () => {
  it("lê caminho aninhado e lista", () => {
    expect(lerCaminho(ctx, "registro.tags.0.name")).toBe("VIP");
    expect(lerCaminho(ctx, "registro.nao.existe")).toBeUndefined();
  });

  it("texto sem acento nem maiúscula", () => {
    expect(ok("registro.name", "contem", "ANUAL")).toBe(true);
    expect(ok("contato.name", "comeca_com", "ána")).toBe(true);
    expect(ok("registro.name", "igual", "plano anual")).toBe(true);
    expect(ok("registro.name", "contem", "")).toBe(false);
  });

  it("número, data e entre", () => {
    expect(ok("registro.amount_cents", "maior", "100000")).toBe(true);
    expect(ok("registro.amount_cents", "entre", [100000, 200000])).toBe(true);
    expect(ok("registro.created_at", "ultimos_dias", 2)).toBe(true);
    expect(ok("registro.created_at", "antes", "2026-10-01")).toBe(false);
    expect(ok("registro.name", "maior", 3)).toBe(false);
  });

  it("lista de etiquetas casa por id ou nome", () => {
    expect(ok("registro.tags", "contem", "vip")).toBe(true);
    expect(ok("registro.tags", "contem", "t1")).toBe(true);
    expect(ok("registro.tags", "nao_contem", "t9")).toBe(true);
  });

  it("vazio, booleano e em", () => {
    expect(ok("registro.custom_fields.cpf", "vazio")).toBe(true);
    expect(ok("contato.opt_in", "verdadeiro")).toBe(true);
    expect(ok("registro.inexistente", "falso")).toBe(true);
    expect(ok("registro.stage_id", "em", ["s1", "s2"])).toBe(true);
    expect(ok("registro.stage_id", "nao_em", "s1,s3")).toBe(true);
  });

  it("regra: OU de grupos E; vazia é verdadeira", () => {
    expect(avaliarRegra({ grupos: [] }, ctx)).toBe(true);
    expect(avaliarRegra(null, ctx)).toBe(true);
    expect(
      avaliarRegra(
        {
          grupos: [
            { condicoes: [{ campo: "registro.stage_id", operador: "igual", valor: "s1" }] },
            {
              condicoes: [
                { campo: "registro.amount_cents", operador: "maior", valor: 1 },
                { campo: "sistema.dia_util", operador: "verdadeiro" },
              ],
            },
          ],
        },
        ctx,
        agora
      )
    ).toBe(true);
    expect(avaliarRegra({ grupos: [{ condicoes: [{ campo: "registro.stage_id", operador: "igual", valor: "s1" }] }] }, ctx, agora)).toBe(false);
  });
});
