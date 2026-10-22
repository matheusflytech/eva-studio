import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    deal: { findFirst: vi.fn(), update: vi.fn() },
    product: { findFirst: vi.fn() },
    dealItem: { findMany: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn() },
    dealAmountSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(d));
  return d;
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "agent" })),
}));

import { GET, PATCH, POST } from "./route";

const params = { params: Promise.resolve({ dealId: "d1" }) };
const req = (method: string, body?: unknown) =>
  new Request("http://x/api/deals/d1/items", { method, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const post = (body: unknown) => POST(req("POST", body), params);
const patch = (body: unknown) => PATCH(req("PATCH", body), params);

const PRODUTO = { id: "p1", name: "Plano Pro", sku: "PRO", unit: "mês", recurrence: "mensal", priceCents: 9_900 };

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  db.deal.findFirst.mockResolvedValue({ id: "d1" });
  db.product.findFirst.mockResolvedValue(PRODUTO);
  db.dealItem.findMany.mockResolvedValue([]);
  // 1ª chamada: contagem/posição antes de criar; 2ª: soma para o valor do negócio.
  db.dealItem.aggregate.mockImplementation(async (a: { _sum?: unknown }) =>
    a._sum ? { _sum: { totalCents: 19_800 }, _count: { _all: 1 } } : { _count: { _all: 0 }, _max: { position: null } }
  );
  db.dealAmountSetting.findUnique.mockResolvedValue(null);
});

describe("GET /api/deals/[dealId]/items", () => {
  it("negócio de outra org → 404", async () => {
    db.deal.findFirst.mockResolvedValue(null);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
    expect(db.deal.findFirst).toHaveBeenCalledWith({ where: { id: "d1", orgId: "org" }, select: { id: true } });
  });

  it("devolve itens com quantidade numérica e o resumo", async () => {
    db.dealItem.findMany.mockResolvedValue([
      { id: "i1", productId: "p1", name: "Plano Pro", sku: "", unit: "mês", recurrence: "mensal", unitPriceCents: 9_900, quantity: "2.000", discountType: "percentual", discountValue: 0, totalCents: 19_800, position: 0 },
    ]);
    const corpo = await (await GET(req("GET"), params)).json();
    expect(corpo.disponivel).toBe(true);
    expect(corpo.itens[0].quantity).toBe(2);
    expect(corpo.resumo).toMatchObject({ totalCents: 19_800, mrrCents: 19_800, arrCents: 19_800 * 12 });
  });

  it("sem a tabela no banco: disponivel=false, sem erro", async () => {
    db.dealItem.findMany.mockRejectedValue(new Error('relation "eva_studio_deal_items" does not exist'));
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).disponivel).toBe(false);
  });
});

describe("POST /api/deals/[dealId]/items", () => {
  it("JSON inválido → 400", async () => {
    expect((await post("nao-json")).status).toBe(400);
  });

  it("negócio de outra org → 404, nada criado", async () => {
    db.deal.findFirst.mockResolvedValue(null);
    expect((await post({ productId: "p1" })).status).toBe(404);
    expect(db.dealItem.create).not.toHaveBeenCalled();
  });

  it("produto de outra org ou arquivado → 404", async () => {
    db.product.findFirst.mockResolvedValue(null);
    const res = await post({ productId: "p-outra" });
    expect(res.status).toBe(404);
    expect(db.product.findFirst.mock.calls[0][0].where).toEqual({ id: "p-outra", orgId: "org", archivedAt: null });
    expect(db.dealItem.create).not.toHaveBeenCalled();
  });

  it("do catálogo: congela nome, código, unidade, recorrência e preço; calcula o total", async () => {
    const res = await post({ productId: "p1", quantity: "2" });
    expect(res.status).toBe(200);
    const data = db.dealItem.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      orgId: "org",
      dealId: "d1",
      productId: "p1",
      name: "Plano Pro",
      sku: "PRO",
      unit: "mês",
      recurrence: "mensal",
      unitPriceCents: 9_900,
      quantity: 2,
      totalCents: 19_800,
      position: 0,
    });
  });

  it("recalcula o valor do negócio com a soma dos itens", async () => {
    await post({ productId: "p1", quantity: 2 });
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { amountCents: 19_800 } });
  });

  it("preço e desconto do corpo valem por cima do catálogo", async () => {
    await post({ productId: "p1", unitPrice: "100", quantity: 3, discountType: "percentual", discount: "10" });
    const data = db.dealItem.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ unitPriceCents: 10_000, discountType: "percentual", discountValue: 1000, totalCents: 27_000 });
  });

  it("avulso sem nome → 400", async () => {
    expect((await post({ unitPrice: 10 })).status).toBe(400);
  });

  it("avulso com nome e preço", async () => {
    await post({ name: "Frete", unitPrice: "35,50" });
    expect(db.dealItem.create.mock.calls[0][0].data).toMatchObject({ productId: null, name: "Frete", unitPriceCents: 3_550, totalCents: 3_550 });
  });

  it("quantidade inválida → 400", async () => {
    expect((await post({ productId: "p1", quantity: 0 })).status).toBe(400);
    expect((await post({ productId: "p1", quantity: "muito" })).status).toBe(400);
  });

  it("desconto acima de 100% → 400", async () => {
    expect((await post({ productId: "p1", discountType: "percentual", discount: 120 })).status).toBe(400);
  });

  it("limite de itens por negócio", async () => {
    db.dealItem.aggregate.mockResolvedValue({ _count: { _all: 100 }, _max: { position: 99 } });
    const res = await post({ productId: "p1" });
    expect(res.status).toBe(400);
    expect(db.dealItem.create).not.toHaveBeenCalled();
  });

  it("vai para o fim da lista", async () => {
    db.dealItem.aggregate.mockImplementation(async (a: { _sum?: unknown }) =>
      a._sum ? { _sum: { totalCents: 1 }, _count: { _all: 3 } } : { _count: { _all: 3 }, _max: { position: 7 } }
    );
    await post({ productId: "p1" });
    expect(db.dealItem.create.mock.calls[0][0].data.position).toBe(8);
  });

  it("sem a tabela no banco: 503", async () => {
    db.product.findFirst.mockRejectedValue(new Error('relation "eva_studio_products" does not exist'));
    expect((await post({ productId: "p1" })).status).toBe(503);
  });
});

describe("PATCH /api/deals/[dealId]/items", () => {
  it("nada para mudar → 400", async () => {
    expect((await patch({})).status).toBe(400);
  });

  it("reordena na ordem enviada", async () => {
    db.dealItem.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const res = await patch({ ordem: ["b", "a"] });
    expect(res.status).toBe(200);
    expect(db.dealItem.update).toHaveBeenNthCalledWith(1, { where: { id: "b" }, data: { position: 0 } });
    expect(db.dealItem.update).toHaveBeenNthCalledWith(2, { where: { id: "a" }, data: { position: 1 } });
  });

  it("ordem com id de fora do negócio → 400, nada gravado", async () => {
    db.dealItem.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const res = await patch({ ordem: ["a", "x-de-outro"] });
    expect(res.status).toBe(400);
    expect(db.dealItem.update).not.toHaveBeenCalled();
  });

  it("ordem faltando item → 400", async () => {
    db.dealItem.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    expect((await patch({ ordem: ["a"] })).status).toBe(400);
  });

  it("liga o valor manual sem recalcular", async () => {
    const res = await patch({ valorManual: true });
    expect(res.status).toBe(200);
    expect(db.dealAmountSetting.upsert).toHaveBeenCalledWith({
      where: { dealId: "d1" },
      create: { dealId: "d1", orgId: "org", manualAmount: true },
      update: { manualAmount: true },
    });
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("desliga o valor manual e recalcula na hora", async () => {
    await patch({ valorManual: false });
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { amountCents: 19_800 } });
  });

  it("valorManual não booleano → 400", async () => {
    expect((await patch({ valorManual: "sim" })).status).toBe(400);
  });
});
