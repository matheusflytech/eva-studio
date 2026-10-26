import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  webhookEndpoint: { findMany: vi.fn() },
  webhookEntrega: { createMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./entrega", () => ({ tentarEntrega: vi.fn() }));
vi.mock("next/server", () => ({ after: () => { throw new Error("fora de requisição"); } }));

import { emitirEvento } from "./emitir";

beforeEach(() => vi.clearAllMocks());

describe("emitirEvento", () => {
  it("sem endpoint assinado: não monta o corpo nem grava", async () => {
    db.webhookEndpoint.findMany.mockResolvedValue([{ id: "w1", eventos: ["contact.*"] }]);
    const montar = vi.fn();
    await emitirEvento("o1", "deal.won", montar);
    expect(montar).not.toHaveBeenCalled();
    expect(db.webhookEntrega.createMany).not.toHaveBeenCalled();
  });

  it("uma entrega por endpoint assinado, cada uma com o seu webhook-id e o mesmo evento", async () => {
    db.webhookEndpoint.findMany.mockResolvedValue([
      { id: "w1", eventos: ["deal.*"] },
      { id: "w2", eventos: ["deal.won"] },
      { id: "w3", eventos: ["contact.created"] },
    ]);
    await emitirEvento("o1", "deal.won", async () => ({ data: { id: "d1" }, previous: { stage_id: "s1" } }));
    const linhas = db.webhookEntrega.createMany.mock.calls[0][0].data;
    expect(linhas.map((l: { endpointId: string }) => l.endpointId)).toEqual(["w1", "w2"]);
    expect(linhas[0].eventoId).not.toBe(linhas[1].eventoId);
    expect(linhas[0].payload).toMatchObject({ type: "deal.won", data: { id: "d1" }, previous: { stage_id: "s1" } });
    expect(linhas[0].payload.id).toBe(linhas[1].payload.id);
  });

  it("tag montada vai no corpo (contact.tag_added)", async () => {
    db.webhookEndpoint.findMany.mockResolvedValue([{ id: "w1", eventos: ["contact.*"] }]);
    await emitirEvento("o1", "contact.tag_added", async () => ({ data: { id: "c1" }, tag: { id: "t9", name: "VIP" } }));
    expect(db.webhookEntrega.createMany.mock.calls[0][0].data[0].payload).toMatchObject({ type: "contact.tag_added", tag: { id: "t9", name: "VIP" } });
  });

  it("tabela ausente: não derruba quem chamou", async () => {
    db.webhookEndpoint.findMany.mockRejectedValue(new Error('relation "eva_studio_webhook_endpoints" does not exist'));
    await expect(emitirEvento("o1", "deal.won", async () => ({ data: {} }))).resolves.toBeUndefined();
  });
});
