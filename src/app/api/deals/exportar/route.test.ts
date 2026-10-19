import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn() },
  deal: { findMany: vi.fn() },
  customField: { findMany: vi.fn(async () => [] as unknown[]) },
  pipelineCardLayout: { findUnique: vi.fn(async () => null) },
  organization: { findUnique: vi.fn(async () => ({ name: "Acme Solar" })) },
}));
const auth = vi.hoisted(() => ({
  requirePermission: vi.fn(async (): Promise<Record<string, unknown>> => ({ orgId: "org", userId: "u", role: "viewer" })),
}));
const funil = vi.hoisted(() => ({
  coletarFunil: vi.fn(async () => ({
    numeros: { taxaDeGanho: 0.5, cicloDeVenda: 12 },
    funis: { funilConversao: [{ etapaId: "s1", nome: "Novo", quantidade: 2, taxaDaAnterior: 1, taxaDoInicio: 1 }] },
  })),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/server/funil-dados", () => funil);

import { GET } from "./route";

const get = (q: string) => GET(new Request(`http://x/api/deals/exportar?${q}`));

const deal = (o: Record<string, unknown>) => ({
  id: "d",
  name: "Negócio",
  description: "",
  stageId: "s1",
  position: 0,
  amountCents: 1000,
  probability: 10,
  lostReason: "",
  createdAt: new Date("2026-10-01T15:00:00Z"),
  stageSince: new Date("2026-10-01T15:00:00Z"),
  closedAt: null,
  expectedClosingAt: null,
  archivedAt: null,
  company: null,
  owner: null,
  contacts: [],
  tasks: [],
  _count: { tasks: 0 },
  customFields: {},
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.pipeline.findFirst.mockResolvedValue({
    id: "p1",
    name: "Vendas Sul",
    stages: [
      { id: "s1", name: "Novo", type: "open", position: 0, probability: 10 },
      { id: "s2", name: "Ganho", type: "won", position: 1, probability: 100 },
    ],
  });
  db.deal.findMany.mockResolvedValue([
    deal({ id: "a", name: "Segundo", stageId: "s2" }),
    deal({ id: "b", name: "Primeiro", stageId: "s1", owner: { id: "u2", name: "Bia" } }),
  ]);
  db.customField.findMany.mockResolvedValue([
    { id: "f", entity: "deal", pipelineId: "p1", key: "kwh", label: "Consumo", type: "number", options: [], required: false, helpText: "", showOnCard: true, position: 0 },
  ]);
});

describe("GET /api/deals/exportar", () => {
  it("viewer baixa o CSV do funil, com nome de arquivo e ordem por etapa", async () => {
    const res = await get("pipeline=p1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="negocios-vendas-sul-\d{4}-\d{2}-\d{2}\.csv"/);
    // O BOM está nos bytes do arquivo (res.text() o descarta ao decodificar).
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const linhas = new TextDecoder().decode(bytes).split("\r\n");
    expect(linhas[0]).toMatch(/^Funil;Etapa;Situação;Negócio;/);
    expect(linhas[0].endsWith(";Consumo")).toBe(true);
    expect(linhas[1]).toMatch(/^Vendas Sul;Novo;Em andamento;Primeiro;/);
    expect(linhas[2]).toMatch(/^Vendas Sul;Ganho;Ganho;Segundo;/);
  });

  it("isola a organização: busca o funil e os negócios só da org da sessão", async () => {
    await get("pipeline=p1");
    expect(db.pipeline.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", orgId: "org" } }));
    expect(db.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org", pipelineId: "p1", archivedAt: null }) })
    );
  });

  it("funil de outra organização: 404", async () => {
    db.pipeline.findFirst.mockResolvedValue(null);
    const res = await get("pipeline=de-outra-org");
    expect(res.status).toBe(404);
    expect(db.deal.findMany).not.toHaveBeenCalled();
  });

  it("sem sessão: 401", async () => {
    auth.requirePermission.mockResolvedValueOnce({ error: "Não autenticado.", status: 401 });
    expect((await get("pipeline=p1")).status).toBe(401);
  });

  it("arquivados=1 tira o filtro de arquivados e acrescenta a coluna", async () => {
    const res = await get("pipeline=p1&arquivados=1");
    const where = db.deal.findMany.mock.calls[0][0].where;
    expect(where.archivedAt).toBeUndefined();
    expect(await res.text()).toContain("Arquivado em");
  });

  it("aplica os filtros da tela (dono)", async () => {
    const csv = await (await get("pipeline=p1&dono=u2")).text();
    expect(csv).toContain("Primeiro");
    expect(csv).not.toContain("Segundo");
  });

  it("formato json alimenta o relatório com totais e números da capa", async () => {
    const d = await (await get("pipeline=p1&formato=json")).json();
    expect(d.organizacao).toBe("Acme Solar");
    expect(d.funil).toEqual({ id: "p1", name: "Vendas Sul" });
    expect(d.etapas.map((e: { quantidade: number }) => e.quantidade)).toEqual([1, 1]);
    expect(d.resumo).toMatchObject({ abertos: 1, abertoCents: 1000, ponderadoCents: 100, taxaDeGanho: 0.5, cicloDeVenda: 12 });
    expect(d.conversao).toHaveLength(1);
    expect(funil.coletarFunil).toHaveBeenCalledWith("org", expect.any(Date), expect.any(Date), "p1", { donos: undefined });
  });
});
