import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn() },
  pipelineStage: { findFirst: vi.fn() },
  deal: { findMany: vi.fn(), groupBy: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
  pipelineCardLayout: { findUnique: vi.fn(async () => null) },
  dealItem: { findMany: vi.fn(async () => []) },
  teamMember: { findMany: vi.fn(async () => []) },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { GET } from "./route";

const cartao = (id: string, stageId: string, position: number, amountCents = 1000) => ({
  id,
  stageId,
  position,
  name: id,
  amountCents,
  currency: "BRL",
  probability: 50,
  company: null,
  owner: null,
  contacts: [],
  tasks: [],
  _count: { tasks: 0 },
  customFields: {},
  expectedClosingAt: null,
  closedAt: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  stageSince: new Date("2026-10-02T00:00:00Z"),
});

// Coluna s1 com 5 cartões em ordem (position, id); empate de posição em d2/d3.
const COLUNA = [cartao("d1", "s1", 0), cartao("d2", "s1", 1), cartao("d3", "s1", 1), cartao("d4", "s1", 2), cartao("d5", "s1", 3)];

type Cursor = { OR: [{ position: { gt: number } }, { position: number; id: { gt: string } }] };

/** findMany falso: aplica stageId, cursor (position, id) e take como o banco. */
function simularColuna(a: { where: { AND: unknown[] }; take?: number }) {
  const partes = a.where.AND;
  const stage = (partes.find((p) => (p as { stageId?: string }).stageId) as { stageId: string } | undefined)?.stageId;
  const cursor = partes.find((p) => (p as Cursor).OR?.[1]?.id) as Cursor | undefined;
  let linhas = COLUNA.filter((d) => d.stageId === stage);
  if (cursor) {
    const p = cursor.OR[1].position;
    const id = cursor.OR[1].id.gt;
    linhas = linhas.filter((d) => d.position > p || (d.position === p && d.id > id));
  }
  return linhas.slice(0, a.take ?? linhas.length);
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.pipeline.findFirst.mockResolvedValue({
    id: "p1",
    name: "Vendas",
    stages: [
      { id: "s1", name: "Novo", type: "open", color: "", probability: 10 },
      { id: "s2", name: "Proposta", type: "open", color: "", probability: 50 },
    ],
  });
  db.pipelineStage.findFirst.mockResolvedValue({ id: "s1", pipelineId: "p1" });
  db.deal.findMany.mockImplementation(async (a) => simularColuna(a));
  db.deal.groupBy.mockResolvedValue([
    { stageId: "s1", probability: 10, _count: { _all: 3 }, _sum: { amountCents: 3000 } },
    { stageId: "s1", probability: 50, _count: { _all: 2 }, _sum: { amountCents: 2001 } },
  ]);
});

describe("GET /api/deals?porEtapa (quadro paginado)", () => {
  it("totais por etapa vêm do agregado; cartões até N com temMais e cursor", async () => {
    const d = await (await GET(new Request("http://x/api/deals?pipeline=p1&porEtapa=2"))).json();
    expect(d.porEtapa).toBe(2);
    const [s1, s2] = d.stages;
    // 3000×10% + 2001×50% (arredondado por faixa) = 300 + 1001
    expect(s1).toMatchObject({ id: "s1", count: 5, totalCents: 5001, weightedCents: 1301, temMais: true, depois: "1~d2" });
    expect(s1.deals.map((x: { id: string }) => x.id)).toEqual(["d1", "d2"]);
    expect(s2).toMatchObject({ id: "s2", count: 0, totalCents: 0, weightedCents: 0, deals: [], temMais: false, depois: null });
    // Agregado e cartões com o MESMO where (filtro + escopo + funil).
    const where = { orgId: "o1", AND: [{ archivedAt: null }, { pipelineId: { in: ["p1"] } }] };
    expect(db.deal.groupBy).toHaveBeenCalledWith({ by: ["stageId", "probability"], where, _count: { _all: true }, _sum: { amountCents: true } });
    expect(db.deal.findMany.mock.calls[0][0]).toMatchObject({
      where: { AND: [where, { stageId: "s1" }] },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      take: 3,
    });
  });

  it("porEtapa inválido usa 30", async () => {
    const d = await (await GET(new Request("http://x/api/deals?pipeline=p1&porEtapa=abc"))).json();
    expect(d.porEtapa).toBe(30);
    expect(d.stages[0].temMais).toBe(false);
  });

  it("filtro aplicado igual no agregado e nos cartões", async () => {
    const filtro = encodeURIComponent(JSON.stringify([{ campo: "valor", op: "gte", valor: "10" }]));
    await GET(new Request(`http://x/api/deals?pipeline=p1&porEtapa=2&filtro=${filtro}`));
    const where = { orgId: "o1", AND: [{ archivedAt: null }, { pipelineId: { in: ["p1"] } }, { amountCents: { gte: 1000 } }] };
    expect(db.deal.groupBy.mock.calls[0][0].where).toEqual(where);
    expect(db.deal.findMany.mock.calls[0][0].where.AND[0]).toEqual(where);
  });

  it("carregar mais percorre a coluna inteira sem repetir nem pular (empate de posição incluso)", async () => {
    const vistos: string[] = [];
    let depois = "";
    for (let i = 0; i < 10; i++) {
      const url = `http://x/api/deals?etapa=s1&porEtapa=2${depois ? `&depois=${encodeURIComponent(depois)}` : ""}`;
      const r = await (await GET(new Request(url))).json();
      expect(r.etapa).toBe("s1");
      vistos.push(...r.deals.map((x: { id: string }) => x.id));
      if (!r.temMais) break;
      depois = r.depois;
    }
    expect(vistos).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(db.pipelineStage.findFirst).toHaveBeenCalledWith({ where: { id: "s1", pipeline: { orgId: "o1" } }, select: { id: true, pipelineId: true } });
  });

  it("etapa de outro contrato → 404; cursor inválido → 400", async () => {
    db.pipelineStage.findFirst.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://x/api/deals?etapa=s9"))).status).toBe(404);
    expect((await GET(new Request("http://x/api/deals?etapa=s1&depois=lixo"))).status).toBe(400);
  });

  it("sem porEtapa: modo de sempre, com count e temMais=false aditivos", async () => {
    db.deal.findMany.mockResolvedValue(COLUNA);
    const d = await (await GET(new Request("http://x/api/deals?pipeline=p1"))).json();
    expect(d.stages[0]).toMatchObject({ count: 5, temMais: false, totalCents: 5000 });
    expect(d.stages[0].deals).toHaveLength(5);
    expect(db.deal.groupBy).not.toHaveBeenCalled();
    expect(db.deal.findMany.mock.calls[0][0]).not.toHaveProperty("take");
  });
});
