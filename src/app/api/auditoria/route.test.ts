import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const hist = vi.hoisted(() => ({ listarHistorico: vi.fn(async () => ({ disponivel: true, linhas: [], proximo: null })) }));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/server/historico", () => hist);
vi.mock("@/lib/server/historico-leitura", () => ({ itensDoHistorico: async () => [] }));
vi.mock("@/lib/server/membros", () => ({ listarMembros: async () => [{ id: "u1", name: "Ana", email: "ana@x.com" }] }));

import { GET } from "./route";

const get = (q: string) => GET(new Request(`http://x/api/auditoria?${q}`));

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
});

describe("GET /api/auditoria", () => {
  it("exige Ver auditoria", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    expect((await get("")).status).toBe(403);
    expect(auth.requirePermission).toHaveBeenCalledWith("auditoria:ver");
    expect(hist.listarHistorico).not.toHaveBeenCalled();
  });

  it("filtros viram consulta; dia de São Paulo inteiro; pessoas só na primeira página", async () => {
    const r = await (await get("tipo=acesso&acao=apagou&ator=u2&de=2026-10-01&ate=2026-10-23&q=acme")).json();
    const [org, f] = hist.listarHistorico.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(org).toBe("o1");
    expect(f).toMatchObject({
      objeto: ["member", "role", "permission_group", "team"],
      acoes: ["apagou", "papel.apagou", "grupo.apagou", "equipe.apagou", "chave_api.revogou", "membro.removeu"],
      atorId: "u2",
      busca: "acme",
      limite: 50,
    });
    expect((f.de as Date).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect((f.ate as Date).toISOString()).toBe("2026-10-24T02:59:59.999Z");
    expect(r.pessoas).toEqual([{ id: "u1", nome: "Ana" }]);

    const r2 = await (await get("cursor=x|y&tipo=lixo&acao=lixo&atorTipo=hacker&de=ontem")).json();
    const f2 = (hist.listarHistorico.mock.calls[1] as unknown as [string, Record<string, unknown>])[1];
    expect(f2).toMatchObject({ objeto: undefined, acoes: undefined, atorTipo: undefined, de: undefined, cursor: "x|y" });
    expect(r2.pessoas).toBeUndefined();
  });
});
