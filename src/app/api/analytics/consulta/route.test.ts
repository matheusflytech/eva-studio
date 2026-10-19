import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  customField: { findMany: vi.fn<(a: { where: Record<string, unknown> }) => Promise<unknown[]>>(async () => []) },
  deal: { findMany: vi.fn<(a: { where: Record<string, unknown> }) => Promise<unknown[]>>(async () => []) },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const perm = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/server/permissions", () => perm);

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/analytics/consulta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  perm.requirePermission.mockResolvedValue({ orgId: "org-A", userId: "u", role: "viewer" });
});

describe("POST /api/analytics/consulta", () => {
  it("roda só na organização da sessão, mesmo que o corpo diga outra", async () => {
    const res = await post({ consulta: { medida: "contagem", agrupar: "", status: "todos", orgId: "org-B" }, orgId: "org-B" });
    expect(res.status).toBe(200);
    expect(db.deal.findMany.mock.calls[0][0].where).toMatchObject({ orgId: "org-A" });
    expect(db.customField.findMany.mock.calls[0][0].where).toMatchObject({ orgId: "org-A" });
    expect((await res.json()).resultado).toMatchObject({ tipo: "numero", valor: 0, truncado: false });
  });

  it("400 com consulta inválida", async () => {
    expect((await post({ consulta: { medida: "apagar tudo" } })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(db.deal.findMany).not.toHaveBeenCalled();
  });

  it("sem permissão, devolve o erro da sessão", async () => {
    perm.requirePermission.mockResolvedValue({ error: "Não autenticado.", status: 401 });
    expect((await post({ consulta: { medida: "contagem", agrupar: "" } })).status).toBe(401);
  });

  it("filtros globais do painel chegam ao where (funis, responsável, intervalo)", async () => {
    await post({
      consulta: { medida: "contagem", agrupar: "", status: "todos", periodo: "painel" },
      de: "2026-10-01",
      ate: "2026-10-31",
      funis: ["p1"],
      donos: ["__nenhum"],
    });
    expect(db.deal.findMany.mock.calls[0][0].where.AND).toEqual([
      { pipelineId: { in: ["p1"] } },
      { ownerId: null },
      { createdAt: { gte: new Date("2026-10-01T03:00:00Z"), lt: new Date("2026-11-01T03:00:00Z") } },
    ]);
  });

  it("lista: true devolve a tabela", async () => {
    const res = await post({ consulta: { medida: "contagem", agrupar: "", status: "todos" }, lista: true });
    expect((await res.json()).resultado).toMatchObject({ tipo: "tabela", linhas: [] });
  });
});
