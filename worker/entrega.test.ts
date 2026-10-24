import { describe, it, expect, vi, beforeEach } from "vitest";
import { anotarIdDaResposta, aplicarRecibo, statusDoRecibo } from "./entrega.js";

const query = vi.fn();
const pool = { query };
const sqls = () => query.mock.calls.map((c) => String(c[0]).replace(/\s+/g, " "));

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe("statusDoRecibo", () => {
  it("3 entregue, 4 lida, 5 ouvida (lida); o resto não muda tique", () => {
    expect([0, 1, 2, 3, 4, 5, undefined].map(statusDoRecibo)).toEqual([null, null, null, "delivered", "read", "read", null]);
  });
});

describe("aplicarRecibo", () => {
  it("entregue: tique só avança (nunca volta de lida) e marca a entrega no item da fila", async () => {
    await aplicarRecibo(pool, "WA1", "delivered");
    expect(sqls()[0]).toMatch(/update eva_studio_messages set "deliveryStatus" = \$2 where "externalId" = \$1 and "deliveryStatus" = any\(\$3\)/);
    expect(query.mock.calls[0][1]).toEqual(["WA1", "delivered", ["sending", "queued", "sent"]]);
    expect(sqls()[1]).toMatch(/set "deliveredAt" = now\(\) where "externalId" = \$1 and "deliveredAt" is null/);
    expect(query).toHaveBeenCalledTimes(2); // sem disparo: não soma nada
  });

  it("lida de mensagem de disparo: soma entregue e lida uma vez cada", async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // mensagem
      .mockResolvedValueOnce({ rows: [{ broadcastId: "b1" }] }) // deliveredAt marcado agora
      .mockResolvedValueOnce({ rows: [] }) // soma deliveredCount
      .mockResolvedValueOnce({ rows: [{ broadcastId: "b1" }] }); // readAt marcado agora
    await aplicarRecibo(pool, "WA1", "read");
    expect(query.mock.calls[0][1][2]).toContain("delivered");
    expect(sqls()[2]).toMatch(/"deliveredCount" = "deliveredCount" \+ 1 where id = any\(\$1\)/);
    expect(sqls()[4]).toMatch(/"readCount" = "readCount" \+ 1/);
  });

  it("recibo repetido (data já preenchida): não soma de novo", async () => {
    await aplicarRecibo(pool, "WA1", "read");
    expect(sqls().some((s) => /Count" \+ 1/.test(s))).toBe(false);
  });
});

describe("anotarIdDaResposta", () => {
  it("acha a última resposta sem id daquela conversa pelo texto", async () => {
    await anotarIdDaResposta(pool, { agentId: "a1", contactId: "5547@s.whatsapp.net", texto: "Oi!", id: "WA9" });
    expect(sqls()[0]).toMatch(/m.role = 'bot' and m.text = \$3 and m."externalId" is null/);
    expect(query.mock.calls[0][1]).toEqual(["a1", "5547@s.whatsapp.net", "Oi!", "WA9"]);
  });
});
