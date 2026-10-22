import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  dealItem: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  dealAmountSetting: { findUnique: vi.fn() },
  deal: { update: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { ErroDeProdutos, negocioUsaSomaDosItens, nomesDosProdutosPorNegocio, recalcularValorDoNegocio } from "./produtos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = db as any;

beforeEach(() => {
  vi.clearAllMocks();
  db.dealAmountSetting.findUnique.mockResolvedValue(null);
});

describe("recalcularValorDoNegocio", () => {
  it("com itens e sem valor manual: o valor vira a soma", async () => {
    db.dealItem.aggregate.mockResolvedValue({ _sum: { totalCents: 45_000 }, _count: { _all: 2 } });
    expect(await recalcularValorDoNegocio(tx, "d1")).toBe(45_000);
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { amountCents: 45_000 } });
  });

  it("com valor manual: não mexe", async () => {
    db.dealItem.aggregate.mockResolvedValue({ _sum: { totalCents: 45_000 }, _count: { _all: 2 } });
    db.dealAmountSetting.findUnique.mockResolvedValue({ manualAmount: true });
    expect(await recalcularValorDoNegocio(tx, "d1")).toBeNull();
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("sem itens: o valor fica como estava", async () => {
    db.dealItem.aggregate.mockResolvedValue({ _sum: { totalCents: null }, _count: { _all: 0 } });
    expect(await recalcularValorDoNegocio(tx, "d1")).toBeNull();
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("soma acima do teto da coluna: erro, sem gravar", async () => {
    db.dealItem.aggregate.mockResolvedValue({ _sum: { totalCents: 3_000_000_000 }, _count: { _all: 1 } });
    await expect(recalcularValorDoNegocio(tx, "d1")).rejects.toBeInstanceOf(ErroDeProdutos);
    expect(db.deal.update).not.toHaveBeenCalled();
  });
});

describe("negocioUsaSomaDosItens", () => {
  it("true com itens e sem manual", async () => {
    db.dealItem.count.mockResolvedValue(2);
    expect(await negocioUsaSomaDosItens("d1")).toBe(true);
  });
  it("false com manual ou sem itens", async () => {
    db.dealItem.count.mockResolvedValue(2);
    db.dealAmountSetting.findUnique.mockResolvedValue({ manualAmount: true });
    expect(await negocioUsaSomaDosItens("d1")).toBe(false);
    db.dealItem.count.mockResolvedValue(0);
    db.dealAmountSetting.findUnique.mockResolvedValue(null);
    expect(await negocioUsaSomaDosItens("d1")).toBe(false);
  });
  it("tabela ainda não existe: false (o negócio segue editável)", async () => {
    db.dealItem.count.mockRejectedValue(new Error('relation "eva_studio_deal_items" does not exist'));
    expect(await negocioUsaSomaDosItens("d1")).toBe(false);
  });
});

describe("nomesDosProdutosPorNegocio", () => {
  it("agrupa os nomes por negócio, filtrando pela org", async () => {
    db.dealItem.findMany.mockResolvedValue([
      { dealId: "d1", name: "Plano Pro" },
      { dealId: "d2", name: "Implantação" },
      { dealId: "d1", name: "Treinamento" },
    ]);
    const m = await nomesDosProdutosPorNegocio("org", ["d1", "d2"]);
    expect(m.get("d1")).toEqual(["Plano Pro", "Treinamento"]);
    expect(m.get("d2")).toEqual(["Implantação"]);
    expect(db.dealItem.findMany.mock.calls[0][0].where).toEqual({ orgId: "org", dealId: { in: ["d1", "d2"] } });
  });
  it("falha vira mapa vazio (o quadro não cai)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.dealItem.findMany.mockRejectedValue(new Error("boom"));
    expect((await nomesDosProdutosPorNegocio("org", ["d1"])).size).toBe(0);
  });
});
