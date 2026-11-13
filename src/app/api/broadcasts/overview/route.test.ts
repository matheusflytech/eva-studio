import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const db = vi.hoisted(() => ({
  prisma: {
    outboundQueueItem: { count: vi.fn(), groupBy: vi.fn() },
    canal: { findMany: vi.fn() },
    broadcast: { findMany: vi.fn() },
    agent: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/db/prisma", () => db);

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.prisma.outboundQueueItem.count.mockResolvedValue(3);
  db.prisma.outboundQueueItem.groupBy.mockResolvedValue([{ agentId: "a1", _count: { _all: 42 } }]);
  db.prisma.canal.findMany.mockResolvedValue([
    { id: "c1", rotulo: "5511955075452", status: "conectado", agentId: "a1" },
    { id: "c2", rotulo: "Número ainda não lido", status: "pendente", agentId: null },
  ]);
  db.prisma.agent.findMany.mockResolvedValue([{ id: "a1", name: "Chip 1" }]);
  db.prisma.broadcast.findMany.mockResolvedValue([
    { id: "b1", agentId: "a1", channel: "whatsapp_qr", text: "Oi", status: "sending", createdAt: new Date(), scheduledAt: null, totalCount: 200, sentCount: 42, failedCount: 1, deliveredCount: 30, readCount: 10, agent: { name: "Chip 1" } },
  ]);
});

describe("GET /api/broadcasts/overview", () => {
  it("sem permissão não lê nada", async () => {
    auth.requirePermission.mockResolvedValue({ error: "x", status: 403 });
    expect((await GET()).status).toBe(403);
    expect(db.prisma.outboundQueueItem.count).not.toHaveBeenCalled();
  });

  it("tudo preso ao contrato e só itens de disparo", async () => {
    await GET();
    for (const [arg] of db.prisma.outboundQueueItem.count.mock.calls) {
      expect(arg.where).toMatchObject({ broadcastId: { not: null }, agent: { orgId: "o1" } });
    }
    expect(db.prisma.canal.findMany.mock.calls[0][0].where).toEqual({ orgId: "o1", tipo: "whatsapp_qr" });
    expect(db.prisma.broadcast.findMany.mock.calls[0][0].where).toEqual({ kind: "campaign", agent: { orgId: "o1" } });
  });

  it("monta o uso de cada chip e os disparos", async () => {
    const r = await (await GET()).json();
    expect(r.hoje.enviados).toBe(3);
    expect(r.limiteDia).toBe(200);
    expect(r.chips[0]).toMatchObject({ numero: "5511955075452", agente: "Chip 1", usadosHoje: 42 });
    expect(r.chips[1]).toMatchObject({ agentId: null, usadosHoje: 0 });
    expect(r.disparos[0]).toMatchObject({ id: "b1", total: 200, enviados: 42, agente: "Chip 1" });
  });
});
