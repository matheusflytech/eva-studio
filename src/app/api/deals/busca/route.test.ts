import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  deal: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  teamMember: { findMany: vi.fn(async () => []) },
  customField: { findMany: vi.fn(async () => []) },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { POST } from "./route";

const negocio = (i: number) => ({
  id: `d${String(i).padStart(3, "0")}`,
  name: `Negócio ${i}`,
  amountCents: 1000 * i,
  currency: "BRL",
  probability: 50,
  ownerId: "u1",
  company: null,
  owner: { id: "u1", name: "Ana" },
  contacts: [],
  tasks: [],
  _count: { tasks: 0 },
  customFields: {},
  expectedClosingAt: null,
  closedAt: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  stageSince: new Date("2026-10-02T00:00:00Z"),
  stage: { id: "s1", name: "Novo", type: "open", position: 0 },
  pipeline: { id: "p1", name: "Vendas" },
});
const BASE = Array.from({ length: 30 }, (_, i) => negocio(i + 1));

const post = (corpo: unknown) =>
  POST(new Request("https://eva.test/api/deals/busca", { method: "POST", body: JSON.stringify(corpo) }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.deal.count.mockResolvedValue(BASE.length);
  db.deal.aggregate.mockResolvedValue({ _sum: { amountCents: 465000 } });
  db.deal.findMany.mockImplementation(async (a: { skip?: number; take?: number }) => BASE.slice(a.skip ?? 0, (a.skip ?? 0) + (a.take ?? BASE.length)));
});

describe("POST /api/deals/busca", () => {
  it("lista paginada com total, soma e etapa/funil de cada linha", async () => {
    const r = await (await post({ pipeline: "p1", pageSize: 25, page: 2 })).json();
    expect(auth.requirePermission).toHaveBeenCalledWith("negocios:ver");
    expect(r).toMatchObject({ total: 30, page: 2, pageSize: 25, somaCents: 465000, avisos: [], truncado: false });
    expect(r.deals).toHaveLength(5);
    expect(r.deals[0]).toMatchObject({ id: "d026", stage: { id: "s1", name: "Novo" }, pipeline: { id: "p1" } });
    const where = { orgId: "o1", AND: [{ archivedAt: null }, { pipelineId: { in: ["p1"] } }] };
    expect(db.deal.findMany.mock.calls[0][0]).toMatchObject({ where, skip: 25, take: 25 });
    expect(db.deal.count).toHaveBeenCalledWith({ where });
    expect(db.deal.aggregate).toHaveBeenCalledWith({ where, _sum: { amountCents: true } });
  });

  it.each([
    ["nome", { name: "asc" }],
    ["valor", { amountCents: "asc" }],
    ["etapa", { stage: { position: "asc" } }],
    ["responsavel", { owner: { name: "asc" } }],
    ["criadoEm", { createdAt: "asc" }],
    ["previsao", { expectedClosingAt: { sort: "asc", nulls: "last" } }],
    ["fechadoEm", { closedAt: { sort: "asc", nulls: "last" } }],
    ["diasNaEtapa", { stageSince: "desc" }],
  ])("ordena por %s", async (campo, esperado) => {
    await post({ sort: `${campo}:asc` });
    expect(db.deal.findMany.mock.calls[0][0].orderBy).toEqual([esperado, { id: "asc" }]);
  });

  it("ordenação recusada e pageSize inválido", async () => {
    const r = await (await post({ sort: "description", pageSize: 7 })).json();
    expect(r.pageSize).toBe(25);
    expect(r.avisos[0]).toContain("não é permitida");
    expect(db.deal.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
  });

  it("escopo do papel sempre no where, junto do filtro", async () => {
    auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "agent", escopo: { negocios: "proprios", contatos: "todos", conversas: "todos" } });
    await post({ filtro: [{ campo: "responsavel", op: "qualquer", valores: ["u7"] }] });
    expect(db.deal.count.mock.calls[0][0].where).toEqual({
      orgId: "o1",
      AND: [{ ownerId: { in: ["u1"] } }, { archivedAt: null }, { ownerId: { in: ["u7"] } }],
    });
  });

  it("arquivados só quando pedido", async () => {
    await post({ arquivados: true });
    expect(db.deal.count.mock.calls[0][0].where).toEqual({ orgId: "o1" });
  });
});
