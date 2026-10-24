import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ contact: { findFirst: vi.fn(), update: vi.fn() } }));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const storage = vi.hoisted(() => ({ urlDeUpload: vi.fn(), midiaExiste: vi.fn(), apagarArquivos: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/server/escopo-dados", () => ({ filtroDeEscopo: async () => ({}) }));
vi.mock("@/lib/server/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/server/storage", async (original) => ({ ...(await original<typeof import("@/lib/server/storage")>()), ...storage }));

import { DELETE, POST, PUT } from "./route";

const params = () => ({ params: Promise.resolve({ contactId: "c1" }) });
const pedido = (body: unknown) => new Request("http://x/api/contacts/c1/foto", { method: "POST", body: JSON.stringify(body) });
const UUID = "0b6f5c1e-8f0a-4c35-9d7e-1a2b3c4d5e6f";

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "org", role: "agent" });
  db.contact.findFirst.mockResolvedValue({ id: "c1", avatarPath: `org/${"1".repeat(8)}-1111-1111-1111-${"1".repeat(12)}.webp` });
  storage.urlDeUpload.mockResolvedValue({ url: "https://s/up", token: "t" });
  storage.midiaExiste.mockResolvedValue({ existe: true, tamanho: 30_000 });
});

describe("foto do contato", () => {
  it("POST exige contatos:editar e devolve caminho da org no bucket de avatares", async () => {
    const r = await POST(pedido({ mime: "image/webp", size: 30_000 }), params());
    expect(auth.requirePermission).toHaveBeenCalledWith("contatos:editar");
    const d = await r.json();
    expect(d.path).toMatch(/^org\/[0-9a-f-]{36}\.webp$/);
    expect(storage.urlDeUpload).toHaveBeenCalledWith(d.path, "eva-avatares");
  });

  it("POST recusa tipo que não é foto e arquivo grande", async () => {
    expect((await POST(pedido({ mime: "application/pdf", size: 10 }), params())).status).toBe(400);
    expect((await POST(pedido({ mime: "image/png", size: 3 * 1024 * 1024 }), params())).status).toBe(400);
  });

  it("PUT recusa caminho de outra org sem gravar", async () => {
    const r = await PUT(pedido({ path: `outra/${UUID}.webp` }), params());
    expect(r.status).toBe(400);
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("PUT grava a nova e apaga a anterior", async () => {
    const r = await PUT(pedido({ path: `org/${UUID}.webp` }), params());
    expect(r.status).toBe(200);
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { avatarPath: `org/${UUID}.webp` } });
    expect(storage.apagarArquivos).toHaveBeenCalledWith([expect.stringMatching(/^org\/1{8}/)], "eva-avatares");
  });

  it("PUT recusa foto que não chegou ao storage", async () => {
    storage.midiaExiste.mockResolvedValue({ existe: false, tamanho: 0 });
    expect((await PUT(pedido({ path: `org/${UUID}.webp` }), params())).status).toBe(400);
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("DELETE limpa e apaga; contato fora do alcance é 404", async () => {
    await DELETE(new Request("http://x"), params());
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { avatarPath: null } });
    db.contact.findFirst.mockResolvedValue(null);
    expect((await DELETE(new Request("http://x"), params())).status).toBe(404);
  });
});
