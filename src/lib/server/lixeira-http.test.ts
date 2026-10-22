import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ profile: { findUnique: vi.fn() } }));
const lix = vi.hoisted(() => ({ apagarComLixeira: vi.fn() }));
const escopo = vi.hoisted(() => ({ donosVisiveis: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/lixeira", async (original) => ({ ...(await original<object>()), ...lix }));
vi.mock("@/lib/server/escopo-dados", () => escopo);
vi.mock("@/lib/server/permissions", async () => {
  const { permite, permissoesDoPapelDeSistema } = await import("@/lib/permissoes/catalogo");
  return {
    ctxPode: (ctx: { role: "owner" | "admin" | "agent" | "viewer"; permissoes?: string[] }, p: Parameters<typeof permite>[1]) =>
      permite(ctx.permissoes ?? permissoesDoPapelDeSistema(ctx.role), p),
  };
});

import { ErroDaLixeira } from "@/lib/server/lixeira";
import { entidadesVisiveis, podeVerItem, responderExclusao } from "./lixeira-http";

const CTX = { orgId: "o1", userId: "u1", role: "agent" as const };

beforeEach(() => {
  vi.clearAllMocks();
  db.profile.findUnique.mockResolvedValue({ name: "Lu", email: "lu@x.com" });
  escopo.donosVisiveis.mockResolvedValue(null);
});

describe("DELETE das telas (responderExclusao)", () => {
  it("vai para a lixeira e devolve o id do item para o Desfazer", async () => {
    lix.apagarComLixeira.mockResolvedValueOnce({ lixeira: true, trashId: "tr1", expiresAt: new Date("2026-11-19T12:00:00Z"), aviso: null });
    const res = await responderExclusao(new Request("http://x/api/deals/d1", { method: "DELETE" }), CTX, "deal", "d1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, lixeira: { id: "tr1", expiresAt: "2026-11-19T12:00:00.000Z" }, aviso: null });
    expect(lix.apagarComLixeira).toHaveBeenCalledWith({
      orgId: "o1",
      entidade: "deal",
      id: "d1",
      quem: { id: "u1", nome: "Lu" },
      seIndisponivel: "recusar",
    });
  });

  it("sem a lixeira no banco: 409 lixeira_indisponivel; com ?definitivo=1 apaga de vez com aviso", async () => {
    lix.apagarComLixeira.mockRejectedValueOnce(new ErroDaLixeira("sem lixeira", 409, "lixeira_indisponivel"));
    const recusado = await responderExclusao(new Request("http://x/api/contacts/c1", { method: "DELETE" }), CTX, "contact", "c1");
    expect(recusado.status).toBe(409);
    expect((await recusado.json()).codigo).toBe("lixeira_indisponivel");

    lix.apagarComLixeira.mockResolvedValueOnce({ lixeira: false, trashId: null, expiresAt: null, aviso: "definitivo" });
    const res = await responderExclusao(new Request("http://x/api/contacts/c1?definitivo=1", { method: "DELETE" }), CTX, "contact", "c1");
    expect(await res.json()).toEqual({ ok: true, lixeira: null, aviso: "definitivo" });
    expect(lix.apagarComLixeira).toHaveBeenLastCalledWith(expect.objectContaining({ seIndisponivel: "apagar" }));
  });
});

describe("quem vê a lixeira", () => {
  it("cada tipo segue a permissão de apagar e o escopo do papel", async () => {
    escopo.donosVisiveis.mockImplementation(async (_c: unknown, modulo: string) => (modulo === "negocios" ? ["u1"] : null));
    expect(await entidadesVisiveis(CTX)).toEqual({ deal: ["u1"], contact: null, company: null });
    expect(await entidadesVisiveis({ ...CTX, role: "viewer" })).toEqual({});
  });

  it("fora do escopo não vê, a não ser o que a própria pessoa apagou", async () => {
    escopo.donosVisiveis.mockResolvedValue(["u1"]);
    expect(await podeVerItem(CTX, { entity: "deal", ownerId: "u2", deletedById: "u9" })).toBe(false);
    expect(await podeVerItem(CTX, { entity: "deal", ownerId: "u2", deletedById: "u1" })).toBe(true);
    expect(await podeVerItem(CTX, { entity: "deal", ownerId: "u1", deletedById: null })).toBe(true);
    expect(await podeVerItem({ ...CTX, role: "viewer" }, { entity: "deal", ownerId: "u1", deletedById: "u1" })).toBe(false);
  });
});
