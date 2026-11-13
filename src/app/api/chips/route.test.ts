import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const db = vi.hoisted(() => ({
  prisma: {
    canal: { findMany: vi.fn() },
    agent: { findMany: vi.fn() },
    canalWhatsAppQr: { findMany: vi.fn() },
    outboundQueueItem: { groupBy: vi.fn() },
  },
}));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/db/prisma", () => db);

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.prisma.canal.findMany.mockResolvedValue([{ id: "c1", rotulo: "5511955075452", status: "conectado", agentId: "a1", createdAt: new Date() }]);
  db.prisma.agent.findMany.mockResolvedValue([{ id: "a1", name: "Chip 1" }]);
  db.prisma.canalWhatsAppQr.findMany.mockResolvedValue([
    { canalId: "c1", status: "connected", lastError: null, lastConnectedAt: new Date("2026-11-13T10:00:00Z"), lastDisconnectedAt: null, reconnectAttempts: 0 },
  ]);
  // Ordem das chamadas: uso hoje, enviados, entregues, falhas, último disparo.
  db.prisma.outboundQueueItem.groupBy
    .mockResolvedValueOnce([{ agentId: "a1", _count: { _all: 42 } }])
    .mockResolvedValueOnce([{ agentId: "a1", _count: { _all: 100 } }])
    .mockResolvedValueOnce([{ agentId: "a1", _count: { _all: 95 } }])
    .mockResolvedValueOnce([{ agentId: "a1", _count: { _all: 2 } }])
    .mockResolvedValueOnce([{ agentId: "a1", _max: { sentAt: new Date("2026-11-13T12:00:00Z") } }]);
});

describe("GET /api/chips", () => {
  it("só os canais QR do contrato", async () => {
    await GET();
    expect(db.prisma.canal.findMany.mock.calls[0][0].where).toEqual({ orgId: "o1", tipo: "whatsapp_qr" });
    expect(db.prisma.agent.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["a1"] }, orgId: "o1" });
  });

  it("monta situação, uso, último disparo e qualidade", async () => {
    const r = await (await GET()).json();
    expect(r.chips[0]).toMatchObject({
      numero: "5511955075452",
      sessao: "connected",
      agente: "Chip 1",
      usadosHoje: 42,
      enviados: 100,
      entregues: 95,
      falhas: 2,
      nivel: "boa",
      ultimoDisparo: "2026-11-13T12:00:00.000Z",
    });
  });
});
