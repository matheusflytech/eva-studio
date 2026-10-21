import { describe, it, expect } from "vitest";
import { assinaturaCobre, filtroDeEventoValido, normalizarFiltros } from "./eventos";

describe("catálogo de eventos", () => {
  it("aceita tudo, curinga do objeto e tipo exato; recusa o resto", () => {
    expect(filtroDeEventoValido("*")).toBe(true);
    expect(filtroDeEventoValido("deal.*")).toBe(true);
    expect(filtroDeEventoValido("deal.won")).toBe(true);
    expect(filtroDeEventoValido("deal.ganho")).toBe(false);
    expect(filtroDeEventoValido("pedido.*")).toBe(false);
  });

  it("normaliza sem repetir; '*' engole o resto; filtro errado = null", () => {
    expect(normalizarFiltros(["deal.won", "deal.won", "contact.created"])).toEqual(["contact.created", "deal.won"]);
    expect(normalizarFiltros(["deal.won", "*"])).toEqual(["*"]);
    expect(normalizarFiltros(["deal.wn"])).toBeNull();
    expect(normalizarFiltros([])).toBeNull();
    expect(normalizarFiltros("deal.won")).toBeNull();
  });

  it("cobertura da assinatura; o teste chega sempre", () => {
    expect(assinaturaCobre(["deal.*"], "deal.lost")).toBe(true);
    expect(assinaturaCobre(["deal.won"], "deal.lost")).toBe(false);
    expect(assinaturaCobre(["*"], "message.received")).toBe(true);
    expect(assinaturaCobre(["contact.created"], "webhook.test")).toBe(true);
  });
});
