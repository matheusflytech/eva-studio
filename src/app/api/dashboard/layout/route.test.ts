import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  dashboardLayout: { findUnique: vi.fn(), upsert: vi.fn(async () => ({})), deleteMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org1", userId: "u", role: "admin" })),
}));
vi.mock("@/lib/auth/require-org", () => ({ requireOrgId: vi.fn(async () => "org1") }));

import { GET, PUT } from "./route";

const put = (widgets: unknown[]) =>
  PUT(new Request("http://x/api/dashboard/layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ widgets }) }));

beforeEach(() => vi.clearAllMocks());

describe("PUT /api/dashboard/layout", () => {
  it("preserva o tipo 'funil' do cartão de conversão", async () => {
    const res = await put([{ id: "a", tipo: "funil", fonte: "funilConversao", titulo: "Conversão", largura: 2 }]);
    const d = await res.json();
    expect(d.widgets[0].tipo).toBe("funil");
    expect(db.dashboardLayout.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "org1" } }));
  });

  it("descarta fonte inexistente e tipo inventado", async () => {
    const d = await (await put([{ id: "a", tipo: "xpto", fonte: "vendas" }, { id: "b", tipo: "numero", fonte: "nao-existe" }])).json();
    expect(d.widgets).toEqual([{ id: "a", tipo: "numero", fonte: "vendas", titulo: "Vendas fechadas", largura: 1, altura: 1 }]);
  });

  it("aceita largura 4, altura e destaque; altura fora do limite cai no padrão do tipo", async () => {
    const d = await (
      await put([
        { id: "a", tipo: "numero", fonte: "ritmo", titulo: "Ritmo", largura: 4, altura: 9, destaque: true },
        { id: "b", tipo: "linha", fonte: "receitaPorDia", titulo: "R", largura: 7, altura: 3, destaque: "sim" },
      ])
    ).json();
    expect(d.widgets[0]).toEqual({ id: "a", tipo: "especial", fonte: "ritmo", titulo: "Ritmo", largura: 4, altura: 2, destaque: true });
    expect(d.widgets[1]).toEqual({ id: "b", tipo: "linha", fonte: "receitaPorDia", titulo: "R", largura: 1, altura: 3 });
  });

  it("'especial' não vale para fonte que não é da visão geral", async () => {
    const d = await (await put([{ id: "a", tipo: "especial", fonte: "vendas", titulo: "V", largura: 1 }])).json();
    expect(d.widgets[0].tipo).toBe("numero");
  });

  it("cartão montado sai saneado, no formato novo", async () => {
    const d = await (
      await put([{ id: "c", tipo: "pizza", fonte: "custom", titulo: "Meu", largura: 2, consulta: { medida: "contagem", agrupar: "mes", funilId: "p1", filtros: [] } }])
    ).json();
    // Pizza não cabe em série no tempo: cai no primeiro tipo permitido.
    expect(d.widgets[0]).toMatchObject({ tipo: "linha", consulta: { funilIds: ["p1"], filtros: { logica: "e", grupos: [] } } });
  });
});

describe("GET /api/dashboard/layout", () => {
  it("cartão salvo no formato antigo volta no novo", async () => {
    db.dashboardLayout.findUnique.mockResolvedValue({
      widgets: [
        { id: "a", tipo: "funil", fonte: "funilConversao", titulo: "Conversão", largura: 2 },
        { id: "b", tipo: "barras", fonte: "custom", titulo: "X", largura: 2, consulta: { medida: "contagem", agrupar: "etapa", funilId: "p1", filtros: [{ campo: "etapa", op: "eq", valor: "s1" }] } },
      ],
    });
    const d = await (await GET()).json();
    expect(d.padrao).toBe(false);
    // Layout de antes do painel único: os cartões da visão geral entram no topo.
    expect(d.widgets.slice(0, 7).every((w: { tipo: string }) => w.tipo === "especial")).toBe(true);
    expect(d.widgets[7]).toMatchObject({ tipo: "funil", altura: 2 });
    expect(d.widgets[8].consulta).toMatchObject({
      funilIds: ["p1"],
      filtros: { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "etapa", op: "qualquer", valores: ["s1"] }] }] },
    });
  });

  it("cartão de funil salvo como número pelo bug antigo volta como funil", async () => {
    db.dashboardLayout.findUnique.mockResolvedValue({
      widgets: [{ id: "a", tipo: "numero", fonte: "funilConversao", titulo: "Conversão", largura: 2 }],
    });
    const d = await (await GET()).json();
    expect(d.widgets.find((w: { fonte: string }) => w.fonte === "funilConversao").tipo).toBe("funil");
  });

  it("sem layout salvo, o padrão", async () => {
    db.dashboardLayout.findUnique.mockResolvedValue(null);
    const d = await (await GET()).json();
    expect(d.padrao).toBe(true);
    expect(d.widgets[0]).toMatchObject({ fonte: "visaoReceita", tipo: "especial", destaque: true });
  });
});
