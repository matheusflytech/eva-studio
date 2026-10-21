import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import crypto from "node:crypto";
import { assinaturaDoWebhookConfere, criarDominio, enviarEmail } from "./resend";

const ENV = { ...process.env };
beforeEach(() => {
  process.env.RESEND_API_KEY = "re_teste";
});
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

describe("enviarEmail", () => {
  it("manda HTML, texto, responder-para, cabeçalhos e etiquetas; devolve o id", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await enviarEmail({
      from: "Loja <oi@loja.com>", to: "ana@x.com", subject: "Oi", html: "<p>oi</p>", text: "oi",
      replyTo: "vendas@loja.com", headers: { "List-Unsubscribe": "<https://a/b>" }, tags: { envio: "e1" },
    });
    expect(r).toEqual({ ok: true, id: "em_1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_teste");
    expect(JSON.parse(String(init.body))).toEqual({
      from: "Loja <oi@loja.com>", to: ["ana@x.com"], subject: "Oi", html: "<p>oi</p>", text: "oi",
      reply_to: "vendas@loja.com", headers: { "List-Unsubscribe": "<https://a/b>" }, tags: [{ name: "envio", value: "e1" }],
    });
  });

  it("sem a chave da plataforma: erro claro, sem chamar a Resend", async () => {
    delete process.env.RESEND_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await enviarEmail({ from: "a", to: "b", subject: "c", html: "d", text: "e" });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("erro da Resend vira a mensagem dela", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "The domain is not verified" }), { status: 403 })));
    expect(await enviarEmail({ from: "a", to: "b", subject: "c", html: "d", text: "e" })).toEqual({ ok: false, erro: "The domain is not verified" });
  });
});

describe("criarDominio", () => {
  it("cria no sa-east-1 e devolve os registros DNS", async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ id: "d1", name: "loja.com", status: "not_started", records: [{ record: "DKIM", name: "resend._domainkey", type: "TXT", value: "p=x" }] }))
    );
    vi.stubGlobal("fetch", f);
    const r = await criarDominio("loja.com");
    expect(r).toMatchObject({ ok: true, dominio: { id: "d1", status: "not_started", records: [{ record: "DKIM" }] } });
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ name: "loja.com", region: "sa-east-1" });
  });
});

describe("assinaturaDoWebhookConfere (Svix)", () => {
  const segredo = "whsec_" + Buffer.from("segredo-de-teste-123").toString("base64");
  const corpo = JSON.stringify({ type: "email.delivered", data: { email_id: "em_1" } });
  const agora = new Date("2026-10-22T12:00:00Z");
  const ts = String(Math.floor(agora.getTime() / 1000));
  const assinar = (c: string, t = ts) =>
    "v1," + crypto.createHmac("sha256", Buffer.from("segredo-de-teste-123")).update(`msg_1.${t}.${c}`).digest("base64");

  it("assinatura certa confere (inclusive entre várias, na rotação de segredo)", () => {
    expect(assinaturaDoWebhookConfere(corpo, { id: "msg_1", timestamp: ts, assinatura: assinar(corpo) }, segredo, agora)).toBe(true);
    expect(assinaturaDoWebhookConfere(corpo, { id: "msg_1", timestamp: ts, assinatura: `v1,AAAA ${assinar(corpo)}` }, segredo, agora)).toBe(true);
  });

  it("corpo mexido, segredo errado, carimbo velho ou cabeçalho faltando: recusa", () => {
    const a = assinar(corpo);
    expect(assinaturaDoWebhookConfere(corpo + " ", { id: "msg_1", timestamp: ts, assinatura: a }, segredo, agora)).toBe(false);
    expect(assinaturaDoWebhookConfere(corpo, { id: "msg_1", timestamp: ts, assinatura: a }, "whsec_" + Buffer.from("outro").toString("base64"), agora)).toBe(false);
    const velho = String(Number(ts) - 3600);
    expect(assinaturaDoWebhookConfere(corpo, { id: "msg_1", timestamp: velho, assinatura: assinar(corpo, velho) }, segredo, agora)).toBe(false);
    expect(assinaturaDoWebhookConfere(corpo, { id: null, timestamp: ts, assinatura: a }, segredo, agora)).toBe(false);
  });
});
