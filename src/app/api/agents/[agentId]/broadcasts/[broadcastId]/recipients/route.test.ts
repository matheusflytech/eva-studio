import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const db = vi.hoisted(() => ({
  prisma: {
    broadcast: { findFirst: vi.fn() },
    outboundQueueItem: { findMany: vi.fn() },
    conversation: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/db/prisma", () => db);

import { GET } from "./route";

const params = { params: Promise.resolve({ agentId: "a1", broadcastId: "b1" }) };
const get = (q = "") => GET(new Request(`http://x/r${q}`), params);

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.prisma.broadcast.findFirst.mockResolvedValue({ id: "b1", channel: "whatsapp_qr", createdAt: new Date("2026-11-13T12:00:00Z") });
  db.prisma.outboundQueueItem.findMany.mockResolvedValue([
    { id: "i1", contactId: "5511999990001@s.whatsapp.net", status: "sent", error: null, sentAt: new Date(), deliveredAt: new Date(), readAt: null, repliedAt: null },
    { id: "i2", contactId: "5511999990002@s.whatsapp.net", status: "failed", error: "Número sem WhatsApp", sentAt: null, deliveredAt: null, readAt: null, repliedAt: null },
  ]);
  db.prisma.conversation.findMany.mockResolvedValue([{ id: "c1", contactId: "5511999990001@s.whatsapp.net" }]);
});

describe("GET recipients", () => {
  it("disparo de outro contrato dá 404", async () => {
    db.prisma.broadcast.findFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(db.prisma.broadcast.findFirst.mock.calls[0][0].where).toEqual({ id: "b1", agentId: "a1", agent: { orgId: "o1" } });
  });

  it("lista com situação, motivo e conversa", async () => {
    const r = await (await get()).json();
    expect(r.contagem).toMatchObject({ entregue: 1, falhou: 1 });
    expect(r.destinatarios[0]).toMatchObject({ numero: "5511999990001", situacao: "entregue", conversationId: "c1" });
    expect(r.destinatarios[1]).toMatchObject({ numero: "5511999990002", situacao: "falhou", motivo: "Número sem WhatsApp", conversationId: null });
  });

  it("filtra e exporta CSV só com quem não chegou", async () => {
    const res = await get("?status=falhou&format=csv");
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    const csv = await res.text();
    expect(csv).toContain("5511999990002;Não chegou;Número sem WhatsApp");
    expect(csv).not.toContain("5511999990001");
  });

  it("filtro desconhecido dá 400", async () => {
    expect((await get("?status=xyz")).status).toBe(400);
  });
});
