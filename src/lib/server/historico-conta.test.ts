import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  customRole: { findFirst: vi.fn() },
  permissionGroup: { findFirst: vi.fn(), findMany: vi.fn() },
  team: { findFirst: vi.fn() },
  profile: { findMany: vi.fn() },
}));
const hist = vi.hoisted(() => ({ registrarHistorico: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/historico", () => hist);
vi.mock("@/lib/server/eventos/barramento", () => ({ publicarEvento: vi.fn() }));

import { fotoDaEquipe, fotoDoPapel, registrarNaConta } from "./historico-conta";

beforeEach(() => vi.clearAllMocks());

describe("ações da conta", () => {
  it("papel: foto com grupos pelo nome; só o que mudou vai para o histórico", async () => {
    db.permissionGroup.findMany.mockResolvedValue([{ id: "g1", name: "Financeiro" }]);
    db.customRole.findFirst
      .mockResolvedValueOnce({ name: "Vendas", description: "", permissions: ["negocios:ver"], groupIds: [], dataScope: {} })
      .mockResolvedValueOnce({ name: "Vendas", description: "", permissions: ["negocios:editar", "negocios:ver"], groupIds: ["g1"], dataScope: {} });
    const antes = await fotoDoPapel("o1", "r1");
    const depois = await fotoDoPapel("o1", "r1");
    await registrarNaConta("o1", "papel.alterou", "role", "r1", antes, depois);
    expect(hist.registrarHistorico).toHaveBeenCalledWith({
      orgId: "o1",
      acao: "papel.alterou",
      objeto: "role",
      objetoId: "r1",
      objetoNome: "Vendas",
      mudancas: {
        permissoes: { de: ["negocios:ver"], para: ["negocios:editar", "negocios:ver"] },
        grupos: { de: [], para: ["Financeiro"] },
      },
    });
  });

  it("salvar sem mudar nada não grava; apagar grava com o nome de antes", async () => {
    const f = { nome: "Time A", foto: { nome: "Time A", lider: null, membros: [] } };
    await registrarNaConta("o1", "equipe.alterou", "team", "t1", f, f);
    expect(hist.registrarHistorico).not.toHaveBeenCalled();
    await registrarNaConta("o1", "equipe.apagou", "team", "t1", null, f);
    expect(hist.registrarHistorico).toHaveBeenCalledWith(expect.objectContaining({ acao: "equipe.apagou", objetoNome: "Time A", mudancas: null }));
  });

  it("equipe: líder e membros pelos nomes", async () => {
    db.team.findFirst.mockResolvedValue({ name: "Time A", leaderId: "u1", members: [{ userId: "u2" }, { userId: "u1" }] });
    db.profile.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      [{ id: "u1", name: "Ana" }, { id: "u2", name: "Bruno" }].filter((p) => where.id.in.includes(p.id))
    );
    expect(await fotoDaEquipe("o1", "t1")).toEqual({ nome: "Time A", foto: { nome: "Time A", lider: "Ana", membros: ["Ana", "Bruno"] } });
  });
});
