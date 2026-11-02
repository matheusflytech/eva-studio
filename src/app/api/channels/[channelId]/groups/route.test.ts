import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const db = vi.hoisted(() => ({
  prisma: {
    canal: { findFirst: vi.fn() },
    whatsAppGroup: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/db/prisma", () => db);

import { GET, PATCH } from "./route";

const params = { params: Promise.resolve({ channelId: "c1" }) };
const patch = (body: unknown) => PATCH(new Request("http://x/api/channels/c1/groups", { method: "PATCH", body: JSON.stringify(body) }), params);

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.prisma.canal.findFirst.mockResolvedValue({ id: "c1" });
});

describe("GET /api/channels/[channelId]/groups", () => {
  it("exige gerenciar integrações e só lê canal WhatsApp QR do contrato", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    expect((await GET(new Request("http://x"), params)).status).toBe(403);
    expect(auth.requirePermission).toHaveBeenCalledWith("integracoes:gerenciar");

    auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
    db.prisma.canal.findFirst.mockResolvedValue(null);
    expect((await GET(new Request("http://x"), params)).status).toBe(404);
    expect(db.prisma.canal.findFirst).toHaveBeenLastCalledWith({ where: { id: "c1", orgId: "o1", tipo: "whatsapp_qr" }, select: { id: true } });
    expect(db.prisma.whatsAppGroup.findMany).not.toHaveBeenCalled();
  });

  it("lista os grupos do canal, presos ao contrato", async () => {
    db.prisma.whatsAppGroup.findMany.mockResolvedValue([{ id: "g1", jid: "1@g.us", subject: "Equipe", participantsCount: 4, mode: "mention", present: true, syncedAt: new Date("2026-11-02T12:00:00Z") }]);
    const r = await (await GET(new Request("http://x"), params)).json();
    expect(db.prisma.whatsAppGroup.findMany.mock.calls[0][0].where).toEqual({ channelId: "c1", orgId: "o1" });
    expect(r).toEqual({ available: true, groups: [{ id: "g1", jid: "1@g.us", subject: "Equipe", participantsCount: 4, mode: "mention", present: true, syncedAt: "2026-11-02T12:00:00.000Z" }] });
  });

  it("sem o SQL (tabela ausente) devolve available=false em vez de erro", async () => {
    db.prisma.whatsAppGroup.findMany.mockRejectedValue(Object.assign(new Error("does not exist"), { code: "P2021" }));
    expect(await (await GET(new Request("http://x"), params)).json()).toEqual({ available: false, groups: [] });
  });
});

describe("PATCH /api/channels/[channelId]/groups", () => {
  it("só aceita mention, all ou off, e um id de grupo", async () => {
    expect((await patch({ id: "g1", mode: "tudo" })).status).toBe(400);
    expect((await patch({ mode: "all" })).status).toBe(400);
    expect(db.prisma.whatsAppGroup.updateMany).not.toHaveBeenCalled();
  });

  it("muda o modo só de grupo deste canal e deste contrato", async () => {
    db.prisma.whatsAppGroup.updateMany.mockResolvedValue({ count: 1 });
    expect((await patch({ id: "g1", mode: "off" })).status).toBe(200);
    expect(db.prisma.whatsAppGroup.updateMany).toHaveBeenCalledWith({ where: { id: "g1", channelId: "c1", orgId: "o1" }, data: { mode: "off" } });

    db.prisma.whatsAppGroup.updateMany.mockResolvedValue({ count: 0 });
    expect((await patch({ id: "de-outro", mode: "all" })).status).toBe(404);
  });
});
