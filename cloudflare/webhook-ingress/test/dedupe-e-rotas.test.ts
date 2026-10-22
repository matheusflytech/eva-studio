import { describe, expect, it } from "vitest";
import { chaveDeDedupe, idsDaMeta, jaVisto, marcarVisto, TTL_DEDUPE_SEGUNDOS } from "../src/dedupe";
import { rotear } from "../src/rotas";
import { KvFalso } from "./fakes";

describe("rotear", () => {
  it("reconhece os mesmos caminhos do app, com e sem /api", () => {
    expect(rotear("/api/webhooks/meta")).toEqual({ origem: "meta" });
    expect(rotear("/webhooks/meta/")).toEqual({ origem: "meta" });
    expect(rotear("/api/webhooks/telegram/agente_1")).toEqual({ origem: "telegram", agentId: "agente_1" });
    expect(rotear("/api/webhooks/tiktok/cl9x-2")).toEqual({ origem: "tiktok", agentId: "cl9x-2" });
  });

  it("recusa caminhos desconhecidos e agentId estranho", () => {
    expect(rotear("/api/webhooks/blip")).toBeNull();
    expect(rotear("/api/webhooks/telegram/")).toBeNull();
    expect(rotear("/api/webhooks/telegram/a/b")).toBeNull();
    expect(rotear("/api/webhooks/telegram/a%2F..")).toBeNull();
  });
});

describe("dedupe", () => {
  const whatsapp = (ids: string[], statuses: { id: string; status: string }[] = []) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "WABA", changes: [{ field: "messages", value: { messages: ids.map((id) => ({ id })), statuses } }] }],
    });

  it("extrai wamids, recibos, mids e comentários", () => {
    const ids = idsDaMeta({
      entry: [
        { changes: [{ field: "messages", value: { messages: [{ id: "w1" }], statuses: [{ id: "w0", status: "read" }] } }] },
        { messaging: [{ message: { mid: "m1" } }, { sender: { id: "u" }, timestamp: 5, postback: { payload: "op" } }] },
        { changes: [{ field: "comments", value: { id: "c1" } }] },
      ],
    });
    expect(ids).toEqual(["c:c1", "m:w1", "mid:m1", "pb:u:5:op", "s:w0:read"]);
  });

  it("reentrega da Meta cai na mesma chave mesmo com JSON formatado diferente", async () => {
    const a = await chaveDeDedupe("meta", undefined, whatsapp(["w1", "w2"]));
    const b = await chaveDeDedupe("meta", undefined, JSON.stringify(JSON.parse(whatsapp(["w2", "w1"])), null, 2));
    expect(a).toBe(b);
    expect(a).toMatch(/^meta:[0-9a-f]{64}$/);
  });

  it("transições de status do mesmo wamid são eventos diferentes", async () => {
    const enviado = await chaveDeDedupe("meta", undefined, whatsapp([], [{ id: "w1", status: "sent" }]));
    const lido = await chaveDeDedupe("meta", undefined, whatsapp([], [{ id: "w1", status: "read" }]));
    expect(enviado).not.toBe(lido);
  });

  it("Telegram usa update_id por agente", async () => {
    expect(await chaveDeDedupe("telegram", "a1", '{"update_id":42}')).toBe("tg:a1:42");
    expect(await chaveDeDedupe("telegram", "a2", '{"update_id":42}')).toBe("tg:a2:42");
  });

  it("sem id reconhecível usa o hash do corpo", async () => {
    const k = await chaveDeDedupe("tiktok", "a1", '{"event":"x"}');
    expect(k).toMatch(/^tiktok:a1:h:[0-9a-f]{64}$/);
    expect(await chaveDeDedupe("tiktok", "a1", '{"event":"y"}')).not.toBe(k);
  });

  it("marca com TTL de 7 dias e reconhece depois", async () => {
    const kv = new KvFalso();
    expect(await jaVisto(kv, "k")).toBe(false);
    await marcarVisto(kv, "k");
    expect(await jaVisto(kv, "k")).toBe(true);
    expect(kv.dados.get("d:k")?.ttl).toBe(TTL_DEDUPE_SEGUNDOS);
  });
});
