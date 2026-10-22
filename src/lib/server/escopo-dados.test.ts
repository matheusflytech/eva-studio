import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  teamMember: { findMany: vi.fn() },
  pipeline: { findFirst: vi.fn() },
  deal: { findMany: vi.fn<(a?: unknown) => Promise<unknown[]>>(async () => []), findFirst: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
  pipelineCardLayout: { findUnique: vi.fn(async () => null) },
  dealItem: { findMany: vi.fn(async () => []) },
  dealAmountSetting: { findUnique: vi.fn(async () => null) },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/server/permissions", () => auth);

import { donosVisiveis, filtroDeEscopo, noEscopo } from "./escopo-dados";
import { GET as listarNegocios } from "@/app/api/deals/route";
import { GET as abrirNegocio } from "@/app/api/deals/[dealId]/route";

const base = { userId: "u1", orgId: "o1" };

beforeEach(() => {
  vi.clearAllMocks();
  db.teamMember.findMany.mockResolvedValue([{ userId: "u2" }, { userId: "u1" }, { userId: "u3" }]);
  db.pipeline.findFirst.mockResolvedValue({ id: "p1", name: "Vendas", stages: [] });
});

describe("escopo de dados", () => {
  it("todos (ou papel de sistema, sem escopo) não filtra nada", async () => {
    expect(await filtroDeEscopo(base, "negocios")).toEqual({});
    expect(await filtroDeEscopo({ ...base, escopo: { negocios: "todos", contatos: "todos", conversas: "todos" } }, "negocios")).toEqual({});
    expect(db.teamMember.findMany).not.toHaveBeenCalled();
  });

  it("só os meus = sou o responsável", async () => {
    const ctx = { ...base, escopo: { negocios: "proprios" as const, contatos: "todos" as const, conversas: "proprios" as const } };
    expect(await filtroDeEscopo(ctx, "negocios")).toEqual({ ownerId: { in: ["u1"] } });
    expect(await filtroDeEscopo(ctx, "conversas", "assignedToId")).toEqual({ assignedToId: { in: ["u1"] } });
    expect(await noEscopo(ctx, "negocios", "u2")).toBe(false);
    expect(await noEscopo(ctx, "negocios", null)).toBe(false);
  });

  it("da minha equipe = eu + colegas das minhas equipes, só neste contrato", async () => {
    const ctx = { ...base, escopo: { negocios: "equipe" as const, contatos: "todos" as const, conversas: "todos" as const } };
    expect(await donosVisiveis(ctx, "negocios")).toEqual(["u1", "u2", "u3"]);
    expect(db.teamMember.findMany).toHaveBeenCalledWith({
      where: { team: { orgId: "o1", members: { some: { userId: "u1" } } } },
      select: { userId: true },
    });
  });
});

describe("escopo nas rotas de negócios", () => {
  it("kanban de quem vê só os seus filtra por responsável", async () => {
    auth.requirePermission.mockResolvedValue({ ...base, role: "agent", escopo: { negocios: "proprios", contatos: "todos", conversas: "todos" } });
    const res = await listarNegocios(new Request("http://x/api/deals?pipeline=p1"));
    expect(res.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledWith("negocios:ver");
    expect((db.deal.findMany.mock.calls[0][0] as { where: unknown }).where).toMatchObject({ orgId: "o1", ownerId: { in: ["u1"] } });
  });

  it("negócio de outra pessoa, fora do escopo, é 404", async () => {
    auth.requirePermission.mockResolvedValue({ ...base, role: "agent", escopo: { negocios: "proprios", contatos: "todos", conversas: "todos" } });
    db.deal.findFirst.mockResolvedValue(null);
    const res = await abrirNegocio(new Request("http://x/api/deals/d9"), { params: Promise.resolve({ dealId: "d9" }) });
    expect(res.status).toBe(404);
    expect(db.deal.findFirst.mock.calls[0][0].where).toEqual({ id: "d9", orgId: "o1", ownerId: { in: ["u1"] } });
  });

  it("sem acesso ao contrato pedido: 403 antes de consultar qualquer dado", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Você não tem acesso a este contrato.", status: 403 });
    const res = await listarNegocios(new Request("http://x/api/deals"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Você não tem acesso a este contrato." });
    expect(db.pipeline.findFirst).not.toHaveBeenCalled();
    expect(db.deal.findMany).not.toHaveBeenCalled();
  });
});
