import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  outboundQueueItem: { updateManyAndReturn: vi.fn() },
  broadcast: { updateMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { contarReciboNoDisparo } from "./recibos";

beforeEach(() => {
  vi.clearAllMocks();
  db.outboundQueueItem.updateManyAndReturn.mockResolvedValue([]);
});

describe("contarReciboNoDisparo", () => {
  it("entregue: marca só o item ainda sem data e soma no disparo dele", async () => {
    db.outboundQueueItem.updateManyAndReturn.mockResolvedValueOnce([{ broadcastId: "b1" }]);
    await contarReciboNoDisparo("wamid.1", "delivered");
    expect(db.outboundQueueItem.updateManyAndReturn.mock.calls[0][0].where).toEqual({ externalId: "wamid.1", deliveredAt: null });
    expect(db.broadcast.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["b1"] } }, data: { deliveredCount: { increment: 1 } } });
    expect(db.outboundQueueItem.updateManyAndReturn).toHaveBeenCalledTimes(1);
  });

  it("lida: marca entregue (se faltava) e lida", async () => {
    db.outboundQueueItem.updateManyAndReturn.mockResolvedValueOnce([]).mockResolvedValueOnce([{ broadcastId: "b1" }]);
    await contarReciboNoDisparo("wamid.1", "read");
    expect(db.outboundQueueItem.updateManyAndReturn.mock.calls[1][0].where).toEqual({ externalId: "wamid.1", readAt: null });
    expect(db.broadcast.updateMany).toHaveBeenCalledTimes(1);
    expect(db.broadcast.updateMany.mock.calls[0][0].data).toEqual({ readCount: { increment: 1 } });
  });

  it("mensagem fora de disparo (resposta do agente): nada a somar", async () => {
    db.outboundQueueItem.updateManyAndReturn.mockResolvedValue([{ broadcastId: null }]);
    await contarReciboNoDisparo("wamid.2", "read");
    expect(db.broadcast.updateMany).not.toHaveBeenCalled();
  });
});
