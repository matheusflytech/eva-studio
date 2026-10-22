import { describe, it, expect, vi, beforeEach } from "vitest";

const lix = vi.hoisted(() => ({
  listarLixeira: vi.fn(),
  lerItemDaLixeira: vi.fn(),
  restaurarDaLixeira: vi.fn(),
  apagarParaSempre: vi.fn(),
}));
const http = vi.hoisted(() => ({ entidadesVisiveis: vi.fn(), podeVerItem: vi.fn() }));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn(), ctxPode: vi.fn() }));
vi.mock("@/lib/server/lixeira", async (original) => ({ ...(await original<object>()), ...lix }));
vi.mock("@/lib/server/lixeira-http", () => http);
vi.mock("@/lib/server/permissions", () => auth);

import { ErroDaLixeira } from "@/lib/server/lixeira";
import { GET, POST } from "./route";

const ITEM = {
  id: "tr1",
  orgId: "o1",
  entity: "deal",
  entityId: "d1",
  name: "Acme",
  detail: "1 tarefa",
  ownerId: "u1",
  deletedById: "u1",
  deletedByName: "Lu",
  deletedAt: new Date("2026-10-20T12:00:00Z"),
  expiresAt: new Date("2026-11-19T12:00:00Z"),
};

const post = (body: unknown) => POST(new Request("http://x/api/lixeira", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ orgId: "o1", userId: "u1", role: "agent" });
  auth.ctxPode.mockReturnValue(false);
  http.entidadesVisiveis.mockResolvedValue({ deal: ["u1"], contact: null });
  http.podeVerItem.mockResolvedValue(true);
  lix.lerItemDaLixeira.mockResolvedValue(ITEM);
});

describe("GET /api/lixeira", () => {
  it("lista o que a pessoa pode ver, filtrando por tipo e busca", async () => {
    lix.listarLixeira.mockResolvedValueOnce({ disponivel: true, itens: [ITEM] });
    const res = await GET(new Request("http://x/api/lixeira?tipo=deal&busca=acme"));
    const corpo = await res.json();
    expect(lix.listarLixeira).toHaveBeenCalledWith("o1", { entidades: { deal: ["u1"], contact: null }, userId: "u1", busca: "acme", tipo: "deal" });
    expect(corpo).toMatchObject({ disponivel: true, tipos: ["deal", "contact"], podeApagarParaSempre: false });
    expect(corpo.itens[0]).toEqual({
      id: "tr1",
      entidade: "deal",
      entityId: "d1",
      nome: "Acme",
      detalhe: "1 tarefa",
      apagadoPor: "Lu",
      apagadoEm: "2026-10-20T12:00:00.000Z",
      expiraEm: "2026-11-19T12:00:00.000Z",
    });
  });
});

describe("POST /api/lixeira", () => {
  it("item de outra org (ou que não existe): 404, nada restaurado", async () => {
    lix.lerItemDaLixeira.mockResolvedValueOnce(null);
    const res = await post({ acao: "restaurar", id: "tr-outra" });
    expect(res.status).toBe(404);
    expect(lix.lerItemDaLixeira).toHaveBeenCalledWith("o1", "tr-outra");
    expect(lix.restaurarDaLixeira).not.toHaveBeenCalled();
  });

  it("fora do escopo: 404", async () => {
    http.podeVerItem.mockResolvedValueOnce(false);
    expect((await post({ acao: "restaurar", id: "tr1" })).status).toBe(404);
    expect(lix.restaurarDaLixeira).not.toHaveBeenCalled();
  });

  it("restaura e devolve os avisos", async () => {
    lix.restaurarDaLixeira.mockResolvedValueOnce({ entidade: "deal", entityId: "d1", nome: "Acme", avisos: ["Etapa sumiu"] });
    const res = await post({ acao: "restaurar", id: "tr1" });
    expect(await res.json()).toEqual({ ok: true, entidade: "deal", entityId: "d1", nome: "Acme", avisos: ["Etapa sumiu"] });
  });

  it("vencido: o 410 do servidor passa", async () => {
    lix.restaurarDaLixeira.mockRejectedValueOnce(new ErroDaLixeira("passou dos 30 dias", 410, "expirado"));
    const res = await post({ acao: "restaurar", id: "tr1" });
    expect(res.status).toBe(410);
    expect((await res.json()).codigo).toBe("expirado");
  });

  it("apagar para sempre exige lixeira:esvaziar", async () => {
    expect((await post({ acao: "apagar_para_sempre", id: "tr1" })).status).toBe(403);
    expect(lix.apagarParaSempre).not.toHaveBeenCalled();

    auth.ctxPode.mockReturnValue(true);
    expect((await post({ acao: "apagar_para_sempre", id: "tr1" })).status).toBe(200);
    expect(lix.apagarParaSempre).toHaveBeenCalledWith("o1", "tr1");
  });

  it("ação desconhecida: 400", async () => {
    expect((await post({ acao: "x", id: "tr1" })).status).toBe(400);
  });
});
