import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { hmacSha256Hex } from "../src/assinatura";
import { classificarResposta, esperaExponencial } from "../src/entrega";
import type { EnvelopeDeWebhook } from "../src/tipos";
import { ambiente, contexto, mensagem } from "./fakes";

const BASE = "https://ingress.eva.test";

async function postMeta(corpo: string, segredo = "segredo-meta") {
  const sig = "sha256=" + (await hmacSha256Hex(segredo, corpo));
  return new Request(`${BASE}/api/webhooks/meta`, {
    method: "POST",
    headers: { "x-hub-signature-256": sig, "content-type": "application/json" },
    body: corpo,
  });
}

const corpoWhats = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: "P" }, messages: [{ id: "wamid.1", from: "55", type: "text" }] } }] }],
});

afterEach(() => vi.unstubAllGlobals());

describe("entrada", () => {
  it("Meta assinada: enfileira com corpo cru e assinatura, marca visto, responde 200", async () => {
    const env = ambiente();
    const ctx = contexto();
    const res = await worker.fetch(await postMeta(corpoWhats), env, ctx);
    await ctx.esperar();
    expect(res.status).toBe(200);
    expect(env.FILA_ENTRADA.enviados).toHaveLength(1);
    const e = env.FILA_ENTRADA.enviados[0];
    expect(e.origem).toBe("meta");
    expect(e.corpo).toBe(corpoWhats);
    expect(e.cabecalhos["x-hub-signature-256"]).toMatch(/^sha256=/);
    expect(env.DEDUPE.dados.size).toBe(1);
  });

  it("reentrega não enfileira de novo", async () => {
    const env = ambiente();
    const ctx = contexto();
    await worker.fetch(await postMeta(corpoWhats), env, ctx);
    await ctx.esperar();
    const res = await worker.fetch(await postMeta(corpoWhats), env, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicado: true });
    expect(env.FILA_ENTRADA.enviados).toHaveLength(1);
  });

  it("assinatura errada da Meta é 401 e nada entra na fila", async () => {
    const env = ambiente();
    const res = await worker.fetch(await postMeta(corpoWhats, "segredo-falso"), env, contexto());
    expect(res.status).toBe(401);
    expect(env.FILA_ENTRADA.enviados).toHaveLength(0);
  });

  it("sem META_APP_SECRET é 503 (não engole evento calado)", async () => {
    const env = ambiente({ META_APP_SECRET: undefined });
    const res = await worker.fetch(await postMeta(corpoWhats), env, contexto());
    expect(res.status).toBe(503);
  });

  it("Meta com corpo não-JSON assinado é 400", async () => {
    const res = await worker.fetch(await postMeta("nao-json"), ambiente(), contexto());
    expect(res.status).toBe(400);
  });

  it("se a fila falhar devolve 500 e NÃO marca visto (a origem re-tenta)", async () => {
    const env = ambiente();
    env.FILA_ENTRADA.falhar = true;
    const ctx = contexto();
    const res = await worker.fetch(await postMeta(corpoWhats), env, ctx);
    await ctx.esperar();
    expect(res.status).toBe(500);
    expect(env.DEDUPE.dados.size).toBe(0);
  });

  it("GET de verificação da Meta devolve o challenge só com o token certo", async () => {
    const env = ambiente();
    const ok = await worker.fetch(
      new Request(`${BASE}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=123`),
      env,
      contexto()
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    const ruim = await worker.fetch(
      new Request(`${BASE}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123`),
      env,
      contexto()
    );
    expect(ruim.status).toBe(403);
  });

  it("Telegram exige o secret token e guarda o agentId da URL", async () => {
    const env = ambiente();
    const req = (token: string) =>
      new Request(`${BASE}/api/webhooks/telegram/a1`, {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": token },
        body: '{"update_id":7,"message":{"text":"oi"}}',
      });
    expect((await worker.fetch(req("errado"), env, contexto())).status).toBe(401);
    const res = await worker.fetch(req("segredo-tg"), env, contexto());
    expect(res.status).toBe(200);
    expect(env.FILA_ENTRADA.enviados[0]).toMatchObject({ origem: "telegram", agentId: "a1", id: "tg:a1:7", cabecalhos: {} });
  });

  it("TikTok exige ?token= e responde o eco do GET", async () => {
    const env = ambiente();
    const post = (token: string) =>
      new Request(`${BASE}/api/webhooks/tiktok/a9?token=${token}`, { method: "POST", body: '{"event":"im_receive_msg"}' });
    expect((await worker.fetch(post("x"), env, contexto())).status).toBe(401);
    expect((await worker.fetch(post("segredo-tt"), env, contexto())).status).toBe(200);
    expect(env.FILA_ENTRADA.enviados[0]).toMatchObject({ origem: "tiktok", agentId: "a9" });
    const eco = await worker.fetch(new Request(`${BASE}/api/webhooks/tiktok/a9?challenge=abc`), env, contexto());
    expect(await eco.text()).toBe("abc");
  });

  it("caminho desconhecido é 404 e /health é 200", async () => {
    expect((await worker.fetch(new Request(`${BASE}/x`), ambiente(), contexto())).status).toBe(404);
    expect((await worker.fetch(new Request(`${BASE}/health`), ambiente(), contexto())).status).toBe(200);
  });
});

describe("consumidor", () => {
  const envelope: EnvelopeDeWebhook = {
    v: 1,
    id: "tg:a1:7",
    origem: "telegram",
    agentId: "a1",
    recebidoEm: "2026-10-20T00:00:00.000Z",
    corpo: '{"update_id":7}',
    cabecalhos: {},
  };

  function lote(attempts = 1) {
    const m = mensagem(envelope, attempts);
    return { m, lote: { queue: "eva-webhooks-entrada", messages: [m] } };
  }

  it("entrega assinada ao app e dá ack no 2xx", async () => {
    const chamadas: Request[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      chamadas.push(new Request(url, init));
      return new Response("{}", { status: 200 });
    });
    const env = ambiente();
    const { m, lote: l } = lote();
    await worker.queue(l, env);
    expect(m.acked).toBe(true);
    const req = chamadas[0];
    expect(req.url).toBe("https://app.eva.test/api/internal/webhooks");
    const corpo = await req.text();
    const ts = req.headers.get("x-eva-timestamp")!;
    expect(req.headers.get("x-eva-signature")).toBe("v1=" + (await hmacSha256Hex("segredo-app", `${ts}.${corpo}`)));
    expect(JSON.parse(corpo)).toEqual(envelope);
  });

  it("5xx vira retry com espera exponencial", async () => {
    vi.stubGlobal("fetch", async () => new Response("caiu", { status: 503 }));
    const { m, lote: l } = lote(3);
    await worker.queue(l, ambiente());
    expect(m.acked).toBe(false);
    expect(m.retried?.delaySeconds).toBeGreaterThanOrEqual(120);
  });

  it("429 respeita Retry-After", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 429, headers: { "retry-after": "17" } }));
    const { m, lote: l } = lote();
    await worker.queue(l, ambiente());
    expect(m.retried?.delaySeconds).toBe(17);
  });

  it("erro de rede vira retry", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNRESET");
    });
    const { m, lote: l } = lote();
    await worker.queue(l, ambiente());
    expect(m.retried).toBeDefined();
  });

  it("4xx vai direto para a fila morta e sai da principal", async () => {
    vi.stubGlobal("fetch", async () => new Response("assinatura", { status: 401 }));
    const env = ambiente();
    const { m, lote: l } = lote();
    await worker.queue(l, env);
    expect(env.FILA_MORTA.enviados).toEqual([envelope]);
    expect(m.acked).toBe(true);
  });

  it("classificação e espera", () => {
    expect(classificarResposta(204, null).tipo).toBe("ok");
    expect(classificarResposta(400, null).tipo).toBe("desistir");
    expect(classificarResposta(500, null).tipo).toBe("tentar_de_novo");
    expect(esperaExponencial(1, () => 0)).toBe(30);
    expect(esperaExponencial(2, () => 0)).toBe(60);
    expect(esperaExponencial(20, () => 0)).toBe(3600);
    expect(esperaExponencial(20, () => 1)).toBe(4320);
  });
});
