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
    expect(d.widgets).toEqual([{ id: "a", tipo: "numero", fonte: "vendas", titulo: "Vendas fechadas", largura: 1 }]);
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
    expect(d.widgets[0].tipo).toBe("funil");
    expect(d.widgets[1].consulta).toMatchObject({
      funilIds: ["p1"],
      filtros: { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "etapa", op: "qualquer", valores: ["s1"] }] }] },
    });
  });

  it("cartão de funil salvo como número pelo bug antigo volta como funil", async () => {
    db.dashboardLayout.findUnique.mockResolvedValue({
      widgets: [{ id: "a", tipo: "numero", fonte: "funilConversao", titulo: "Conversão", largura: 2 }],
    });
    const d = await (await GET()).json();
    expect(d.widgets[0].tipo).toBe("funil");
  });

  it("sem layout salvo, o padrão", async () => {
    db.dashboardLayout.findUnique.mockResolvedValue(null);
    const d = await (await GET()).json();
    expect(d.padrao).toBe(true);
    expect(d.widgets.length).toBeGreaterThan(0);
  });
});
