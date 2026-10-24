import { describe, it, expect, vi, beforeEach } from "vitest";
import { reivindicarItens, marcarEnviado, marcarFalha, somarNoDisparo, expirarTravados } from "./fila.js";

// Pool falso: guarda o SQL e devolve o que cada teste mandar.
const query = vi.fn();
const pool = { query };
const sqls = () => query.mock.calls.map((c) => String(c[0]).replace(/\s+/g, " "));

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe("reivindicarItens", () => {
  it("trava com FOR UPDATE SKIP LOCKED e marca 'sending' numa instrução só", async () => {
    await reivindicarItens(pool, 20);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = sqls();
    expect(sql).toMatch(/update eva_studio_outbound_queue/i);
    expect(sql).toMatch(/set status = 'sending', "claimedAt" = now\(\)/i);
    expect(sql).toMatch(/where status = 'pending'/i);
    expect(sql).toMatch(/for update skip locked/i);
    expect(sql).toMatch(/returning/i);
    expect(query.mock.calls[0][1]).toEqual([20]);
  });

  it("devolve os itens na ordem de chegada (RETURNING não garante ordem)", async () => {
    query.mockResolvedValue({
      rows: [
        { id: "b", createdAt: new Date("2026-10-20T10:00:02Z") },
        { id: "a", createdAt: new Date("2026-10-20T10:00:01Z") },
      ],
    });
    const itens = await reivindicarItens(pool, 20);
    expect(itens.map((i: { id: string }) => i.id)).toEqual(["a", "b"]);
  });

  it("traz o variantId pro placar da variante", async () => {
    await reivindicarItens(pool, 5);
    expect(sqls()[0]).toMatch(/"variantId"/);
  });
});

describe("somarNoDisparo", () => {
  it("soma e fecha o disparo numa instrução só, e soma na variante", async () => {
    await somarNoDisparo(pool, "b1", "v1", "sentCount");
    const [disparo, variante] = sqls();
    expect(disparo).toMatch(/update eva_studio_broadcasts set "sentCount" = "sentCount" \+ 1/i);
    expect(disparo).toMatch(/case when status = 'sending' and "totalCount" > 0 and "sentCount" \+ "failedCount" \+ 1 >= "totalCount" then 'done' else status end/i);
    expect(query.mock.calls[0][1]).toEqual(["b1"]);
    expect(variante).toMatch(/update eva_studio_broadcast_variants set "sentCount" = "sentCount" \+ 1/i);
    expect(query.mock.calls[1][1]).toEqual(["v1"]);
  });

  it("sem variante não mexe em variante", async () => {
    await somarNoDisparo(pool, "b1", null, "failedCount");
    expect(query).toHaveBeenCalledTimes(1);
    expect(sqls()[0]).toMatch(/"failedCount" = "failedCount" \+ 1/);
  });

  it("recusa coluna fora da lista (o nome vai no SQL)", async () => {
    await expect(somarNoDisparo(pool, "b1", null, 'status" = \'done\' --')).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe("marcarEnviado / marcarFalha", () => {
  it("enviado: só sai de 'sending' e soma no disparo", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await marcarEnviado(pool, { id: "q1", broadcastId: "b1", variantId: null });
    expect(sqls()[0]).toMatch(/set status = 'sent', "sentAt" = now\(\) where id = \$1 and status = 'sending'/i);
    expect(sqls()[1]).toMatch(/"sentCount" = "sentCount" \+ 1/);
  });

  it("com o id do WhatsApp: item e mensagem de Conversas passam a apontar para ele", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await marcarEnviado(pool, { id: "q1", broadcastId: null, variantId: null }, "WA1");
    expect(sqls()[1]).toMatch(/update eva_studio_outbound_queue set "externalId" = \$2 where id = \$1/);
    expect(sqls()[2]).toMatch(/update eva_studio_messages set "externalId" = \$2, "deliveryStatus" = 'sent' where "externalId" = \$1/);
    expect(query.mock.calls[2][1]).toEqual(["q1", "WA1"]);
  });

  it("se o item já não estava em 'sending' (expirou), não soma de novo", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await marcarEnviado(pool, { id: "q1", broadcastId: "b1", variantId: null });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("falha grava o erro e soma failedCount", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await marcarFalha(pool, { id: "q1", broadcastId: "b1", variantId: "v1" }, "WhatsApp não conectado");
    expect(sqls()[0]).toMatch(/set status = 'failed', error = \$2 where id = \$1 and status = 'sending'/i);
    expect(query.mock.calls[0][1]).toEqual(["q1", "WhatsApp não conectado"]);
    expect(sqls()[1]).toMatch(/"failedCount" = "failedCount" \+ 1/);
    expect(sqls()[2]).toMatch(/eva_studio_broadcast_variants/);
  });

  it("item avulso (sem disparo) não mexe em disparo", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await marcarEnviado(pool, { id: "q1", broadcastId: null, variantId: null });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("expirarTravados", () => {
  it("item preso em 'sending' vira 'failed' (não volta pra fila: evita mandar duas vezes)", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "q1", broadcastId: "b1", variantId: null }, { id: "q2", broadcastId: null, variantId: null }] });
    const n = await expirarTravados(pool, 15);
    expect(n).toBe(2);
    const [sql] = sqls();
    expect(sql).toMatch(/set status = 'failed'/i);
    expect(sql).toMatch(/where status = 'sending' and "claimedAt" < now\(\) - make_interval\(mins => \$1\)/i);
    expect(sql).not.toMatch(/'pending'/);
    expect(query.mock.calls[0][1][0]).toBe(15);
    // só o item com disparo soma falha
    expect(sqls().filter((s) => /eva_studio_broadcasts/.test(s))).toHaveLength(1);
  });
});
