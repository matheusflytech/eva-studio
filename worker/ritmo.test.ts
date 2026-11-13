import { describe, it, expect, vi } from "vitest";
import { paraJid, pausaMs, reivindicarDoDisparo, soltosHoje } from "./ritmo.js";

describe("paraJid", () => {
  it("número puro, com máscara ou sem DDI vira jid brasileiro", () => {
    expect(paraJid("5511999990001")).toBe("5511999990001@s.whatsapp.net");
    expect(paraJid("+55 (11) 99999-0001")).toBe("5511999990001@s.whatsapp.net");
    expect(paraJid("11999990001")).toBe("5511999990001@s.whatsapp.net");
    expect(paraJid("1133330001")).toBe("551133330001@s.whatsapp.net");
  });
  it("jid (contato, @lid, grupo) fica como está", () => {
    expect(paraJid("5511999990001@s.whatsapp.net")).toBe("5511999990001@s.whatsapp.net");
    expect(paraJid("120363000000@g.us")).toBe("120363000000@g.us");
    expect(paraJid("abc@lid")).toBe("abc@lid");
  });
  it("inválido dá null", () => {
    expect(paraJid("")).toBeNull();
    expect(paraJid("12345")).toBeNull();
    expect(paraJid(null)).toBeNull();
  });
});

describe("pausaMs", () => {
  it("fica entre min e max", () => {
    expect(pausaMs(8, 20, () => 0)).toBe(8000);
    expect(pausaMs(8, 20, () => 1)).toBe(20000);
    expect(pausaMs(20, 8, () => 0.5)).toBe(14000);
  });
});

describe("SQL do disparo", () => {
  it("reivindica 1 item do agente, pulando disparo cancelado, com a mesma trava", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await reivindicarDoDisparo({ query }, "ag1");
    const sql = String(query.mock.calls[0][0]).replace(/\s+/g, " ");
    expect(sql).toMatch(/"broadcastId" is not null and "agentId" = \$1/);
    expect(sql).toMatch(/b.status = 'canceled'/);
    expect(sql).toMatch(/limit 1 for update skip locked/);
    expect(query.mock.calls[0][1]).toEqual(["ag1"]);
  });
  it("conta o dia no horário de Brasília", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ n: 7 }] });
    expect(await soltosHoje({ query }, "ag1")).toBe(7);
    expect(String(query.mock.calls[0][0])).toMatch(/America\/Sao_Paulo/);
  });
});
