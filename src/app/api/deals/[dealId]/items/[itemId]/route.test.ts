import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    deal: { update: vi.fn() },
    dealItem: { findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), update: vi.fn(), delete: vi.fn() },
    dealAmountSetting: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return d;
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "agent" })),
}));

import { DELETE, PATCH } from "./route";

const params = { params: Promise.resolve({ dealId: "d1", itemId: "i1" }) };
const patch = (body: unknown) =>
  PATCH(new Request("http://x/api/deals/d1/items/i1", { method: "PATCH", body: JSON.stringify(body) }), params);

const ITEM = {
  id: "i1",
  orgId: "org",
  dealId: "d1",
  productId: "p1",
  name: "Plano Pro",
  sku: "",
  unit: "un",
  recurrence: "unico",
  unitPriceCents: 10_000,
  quantity: "2.000",
  discountType: "percentual",
  discountValue: 0,
  totalCents: 20_000,
  position: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  db.dealItem.findFirst.mockResolvedValue(ITEM);
  db.dealItem.findMany.mockResolvedValue([]);
  db.dealItem.aggregate.mockResolvedValue({ _sum: { totalCents: 30_000 }, _count: { _all: 1 } });
  db.dealAmountSetting.findUnique.mockResolvedValue(null);
});

describe("PATCH /api/deals/[dealId]/items/[itemId]", () => {
  it("item de outro negócio ou outra org → 404", async () => {
    db.dealItem.findFirst.mockResolvedValue(null);
    const res = await patch({ quantity: 3 });
    expect(res.status).toBe(404);
    expect(db.dealItem.findFirst).toHaveBeenCalledWith({ where: { id: "i1", dealId: "d1", orgId: "org", deal: { orgId: "org" } } });
    expect(db.dealItem.update).not.toHaveBeenCalled();
  });

  it("muda a quantidade, recalcula o total e o valor do negócio", async () => {
    const res = await patch({ quantity: "3" });
    expect(res.status).toBe(200);
    expect(db.dealItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { quantity: 3, totalCents: 30_000 } });
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { amountCents: 30_000 } });
  });

  it("desconto usa o tipo já gravado quando só o número vem", async () => {
    await patch({ discount: 25 });
    expect(db.dealItem.update.mock.calls[0][0].data).toEqual({ discountValue: 2_500, totalCents: 15_000 });
  });

  it("trocar % por R$ sem número zera o desconto", async () => {
    db.dealItem.findFirst.mockResolvedValue({ ...ITEM, discountValue: 1000 });
    await patch({ discountType: "valor" });
    expect(db.dealItem.update.mock.calls[0][0].data).toMatchObject({ discountType: "valor", discountValue: 0, totalCents: 20_000 });
  });

  it("corpo sem campos conhecidos → 400", async () => {
    expect((await patch({ coisa: 1 })).status).toBe(400);
  });

  it("preço inválido → 400", async () => {
    expect((await patch({ unitPrice: "abc" })).status).toBe(400);
  });
});

describe("DELETE /api/deals/[dealId]/items/[itemId]", () => {
  it("remove e recalcula", async () => {
    const res = await DELETE(new Request("http://x"), params);
    expect(res.status).toBe(200);
    expect(db.dealItem.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(db.deal.update).toHaveBeenCalled();
  });

  it("item de outra org → 404, nada removido", async () => {
    db.dealItem.findFirst.mockResolvedValue(null);
    expect((await DELETE(new Request("http://x"), params)).status).toBe(404);
    expect(db.dealItem.delete).not.toHaveBeenCalled();
  });
});
