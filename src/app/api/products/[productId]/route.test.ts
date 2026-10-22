import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "owner" })),
}));

import { DELETE, PATCH } from "./route";

const params = { params: Promise.resolve({ productId: "p1" }) };
const patch = (body: unknown) =>
  PATCH(new Request("http://x/api/products/p1", { method: "PATCH", body: JSON.stringify(body) }), params);

const PRODUTO = {
  id: "p1",
  name: "Plano Pro",
  sku: "",
  description: "",
  priceCents: 9_900,
  currency: "BRL",
  unit: "un",
  recurrence: "mensal",
  category: "",
  archivedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue({ id: "p1" });
  db.product.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...PRODUTO, ...data }));
});

describe("PATCH /api/products/[productId]", () => {
  it("produto de outra organização → 404", async () => {
    db.product.findFirst.mockResolvedValue(null);
    const res = await patch({ name: "Outro" });
    expect(res.status).toBe(404);
    expect(db.product.findFirst).toHaveBeenCalledWith({ where: { id: "p1", orgId: "org" }, select: { id: true } });
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it("nome vazio → 400", async () => {
    expect((await patch({ name: "" })).status).toBe(400);
  });

  it("arquivar grava archivedAt; reativar limpa", async () => {
    await patch({ archived: true });
    expect(db.product.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
    await patch({ archived: false });
    expect(db.product.update.mock.calls[1][0].data.archivedAt).toBeNull();
  });

  it("edita só o que veio", async () => {
    await patch({ price: 150 });
    expect(db.product.update.mock.calls[0][0].data).toEqual({ priceCents: 15_000 });
  });
});

describe("DELETE /api/products/[productId]", () => {
  it("de outra organização → 404, sem apagar", async () => {
    db.product.findFirst.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x"), params);
    expect(res.status).toBe(404);
    expect(db.product.delete).not.toHaveBeenCalled();
  });

  it("apaga o da org", async () => {
    const res = await DELETE(new Request("http://x"), params);
    expect(res.status).toBe(200);
    expect(db.product.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});
