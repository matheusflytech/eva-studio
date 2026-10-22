import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

const rotas = vi.hoisted(() => ({
  meta: vi.fn(async () => new Response('{"received":true}', { status: 200 })),
  telegram: vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
  tiktok: vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
}));

vi.mock("@/app/api/webhooks/meta/route", () => ({ POST: rotas.meta }));
vi.mock("@/app/api/webhooks/telegram/[agentId]/route", () => ({ POST: rotas.telegram }));
vi.mock("@/app/api/webhooks/tiktok/[agentId]/route", () => ({ POST: rotas.tiktok }));

import { POST } from "./route";

const SEGREDO = "segredo-ingress";

function envelope(extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    id: "k1",
    origem: "meta",
    recebidoEm: "2026-10-20T00:00:00.000Z",
    corpo: '{"object":"whatsapp_business_account","entry":[]}',
    cabecalhos: { "x-hub-signature-256": "sha256=abc" },
    ...extra,
  };
}

function assinado(corpo: unknown, opcoes: { segredo?: string; ts?: number } = {}) {
  const raw = JSON.stringify(corpo);
  const ts = String(opcoes.ts ?? Math.floor(Date.now() / 1000));
  const sig = "v1=" + crypto.createHmac("sha256", opcoes.segredo ?? SEGREDO).update(`${ts}.${raw}`).digest("hex");
  return new Request("https://eva.test/api/internal/webhooks", {
    method: "POST",
    headers: { "x-eva-timestamp": ts, "x-eva-signature": sig, "content-type": "application/json" },
    body: raw,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INGRESS_SIGNING_SECRET = SEGREDO;
  process.env.INTERNAL_API_SECRET = "segredo-interno";
});

describe("POST /api/internal/webhooks", () => {
  it("sem INGRESS_SIGNING_SECRET responde 503 (o Worker re-tenta)", async () => {
    delete process.env.INGRESS_SIGNING_SECRET;
    const res = await POST(assinado(envelope()));
    expect(res.status).toBe(503);
  });

  it("recusa assinatura errada, sem assinatura e timestamp velho", async () => {
    expect((await POST(assinado(envelope(), { segredo: "outro" }))).status).toBe(401);
    expect((await POST(assinado(envelope(), { ts: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    const semAssinatura = new Request("https://eva.test/api/internal/webhooks", { method: "POST", body: "{}" });
    expect((await POST(semAssinatura)).status).toBe(401);
    expect(rotas.meta).not.toHaveBeenCalled();
  });

  it("envelope malformado é 400 (vai para a fila morta)", async () => {
    expect((await POST(assinado({ v: 2 }))).status).toBe(400);
    expect((await POST(assinado(envelope({ origem: "blip" })))).status).toBe(400);
    expect((await POST(assinado(envelope({ origem: "telegram", agentId: "../x" })))).status).toBe(400);
  });

  it("Meta: repassa o corpo cru e a assinatura original para a rota de sempre", async () => {
    const res = await POST(assinado(envelope()));
    expect(res.status).toBe(200);
    const req = (rotas.meta.mock.calls[0] as unknown as [Request])[0];
    expect(await req.text()).toBe('{"object":"whatsapp_business_account","entry":[]}');
    expect(req.headers.get("x-hub-signature-256")).toBe("sha256=abc");
  });

  it("Telegram: chama a rota do agente com o segredo do app", async () => {
    await POST(assinado(envelope({ origem: "telegram", agentId: "a1", corpo: '{"update_id":1}', cabecalhos: {} })));
    const [req, ctx] = rotas.telegram.mock.calls[0] as unknown as [Request, { params: Promise<{ agentId: string }> }];
    expect(req.headers.get("x-telegram-bot-api-secret-token")).toBe("segredo-interno");
    expect(await ctx.params).toEqual({ agentId: "a1" });
    expect(await req.text()).toBe('{"update_id":1}');
  });

  it("TikTok: chama a rota do agente com ?token= do app", async () => {
    await POST(assinado(envelope({ origem: "tiktok", agentId: "a9", corpo: '{"event":"x"}', cabecalhos: {} })));
    const [req] = rotas.tiktok.mock.calls[0] as unknown as [Request];
    expect(new URL(req.url).searchParams.get("token")).toBe("segredo-interno");
  });

  it("repassa o status da rota de origem e transforma exceção em 500", async () => {
    rotas.meta.mockResolvedValueOnce(new Response('{"error":"Assinatura inválida."}', { status: 401 }));
    expect((await POST(assinado(envelope()))).status).toBe(401);
    rotas.meta.mockRejectedValueOnce(new Error("banco fora"));
    expect((await POST(assinado(envelope()))).status).toBe(500);
  });
});
