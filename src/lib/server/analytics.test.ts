import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  deal: { findMany: vi.fn(), count: vi.fn(async () => 0) },
  conversation: { findMany: vi.fn(async () => []) },
  message: { count: vi.fn(async () => 0) },
  $queryRaw: vi.fn(async () => []),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const funil = vi.hoisted(() => ({ coletarFunil: vi.fn() }));
vi.mock("@/lib/server/funil-dados", () => funil);

import { coletarFontes } from "./analytics";

const AGORA = new Date("2026-10-19T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.deal.findMany.mockResolvedValue([]);
  funil.coletarFunil.mockResolvedValue({
    numeros: { taxaDeGanho: null, cicloDeVenda: null },
    quebras: { tempoPorEtapa: [], motivosDePerda: [] },
    tabelas: { negociosParados: [] },
    funis: { funilConversao: [] },
    historicoDesde: null,
    funil: { id: "p1", name: "Vendas" },
  });
});

describe("coletarFontes", () => {
  it("vendas ignoram negócio arquivado e respeitam funis e responsável da barra", async () => {
    await coletarFontes("o1", { dias: 7, funis: ["p1"], donos: ["u1", "__nenhum"] }, AGORA);
    const ganhos = db.deal.findMany.mock.calls[0][0].where;
    expect(ganhos).toMatchObject({ orgId: "o1", archivedAt: null, stage: { type: "won" } });
    expect(ganhos.closedAt).toEqual({ gte: new Date("2026-10-13T03:00:00Z"), lt: new Date("2026-10-20T03:00:00Z") });
    expect(ganhos.AND).toEqual([{ pipelineId: { in: ["p1"] } }, { OR: [{ ownerId: { in: ["u1"] } }, { ownerId: null }] }]);
    // Fontes de funil: com um funil só escolhido, é esse.
    expect(funil.coletarFunil).toHaveBeenCalledWith("o1", new Date("2026-10-13T03:00:00Z"), AGORA, "p1", {
      donos: ["u1", "__nenhum"],
      ate: new Date("2026-10-20T03:00:00Z"),
    });
  });

  it("receita por dia usa o dia de São Paulo: venda às 22h não pula pro dia seguinte", async () => {
    db.deal.findMany.mockImplementation(async (args: { select?: { closedAt?: boolean } }) =>
      args.select?.closedAt ? [{ amountCents: 10_000, closedAt: new Date("2026-10-19T01:00:00Z") }] : []
    );
    const r = await coletarFontes("o1", 3, AGORA);
    expect(r.series.receitaPorDia).toEqual([
      { label: "17/10", value: 0 },
      { label: "18/10", value: 100 },
      { label: "19/10", value: 0 },
    ]);
    expect(r.periodo).toEqual({ de: "2026-10-17", ate: "2026-10-19" });
  });

  it("intervalo personalizado: fim exclusivo no dia seguinte ao 'até'", async () => {
    const r = await coletarFontes("o1", { dias: 30, de: "2026-09-01", ate: "2026-09-30", funis: ["p1", "p2"], donos: [] }, AGORA);
    expect(db.deal.findMany.mock.calls[0][0].where.closedAt).toEqual({ gte: new Date("2026-09-01T03:00:00Z"), lt: new Date("2026-10-01T03:00:00Z") });
    expect(r.series.receitaPorDia).toHaveLength(30);
    // Vários funis: as fontes de funil usam o padrão e a tela avisa.
    expect(funil.coletarFunil.mock.calls[0][3]).toBeUndefined();
    expect(r.funilDasFontesDeFunil).toEqual({ id: "p1", name: "Vendas" });
  });
});
