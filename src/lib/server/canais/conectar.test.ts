import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => {
  const base = {
    canal: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    canalWhatsAppQr: { create: vi.fn(), updateMany: vi.fn() },
  };
  return { ...base, $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(base)) };
});
const ativ = vi.hoisted(() => ({
  apagarAtivacao: vi.fn(),
  gravarAtivacao: vi.fn(),
  desativarCanal: vi.fn(),
  cifrarSegredos: (d: unknown) => `enc(${JSON.stringify(d)})`,
  decifrarSegredos: (s: string | null) => (s ? JSON.parse(s.replace(/^enc\(|\)$/g, "")) : null),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crypto", () => ({ encryptSecret: (s: string) => `c:${s}`, decryptSecret: (s: string) => s.replace(/^c:/, "") }));
vi.mock("@/lib/server/instagram-subscribe", () => ({ assinarEventosInstagram: vi.fn(async () => ({ ok: true })) }));
vi.mock("./ativacao", () => ativ);

import { conectarTelegram, conectarWhatsAppQr, desconectarCanal, salvarCanal } from "./conectar";

const ENV = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.eva";
  process.env.INTERNAL_API_SECRET = "segredo";
  db.canal.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "novo", ...data }));
});
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

describe("salvarCanal", () => {
  const c = { tipo: "messenger" as const, rotulo: "Loja", externalId: "page1", dados: { pageId: "page1", pageAccessToken: "c:t" } };

  it("canal novo nasce sem agente, com os segredos cifrados", async () => {
    db.canal.findFirst.mockResolvedValue(null);
    expect(await salvarCanal("o1", c)).toEqual({ ok: true, canalId: "novo" });
    expect(db.canal.create.mock.calls[0][0].data).toMatchObject({ orgId: "o1", tipo: "messenger", externalId: "page1", segredos: `enc(${JSON.stringify(c.dados)})` });
    expect(db.canal.create.mock.calls[0][0].data.agentId).toBeUndefined();
  });

  it("mesma página já conectada em outro contrato: recusa", async () => {
    db.canal.findFirst.mockResolvedValue({ id: "x", orgId: "outro" });
    expect(await salvarCanal("o1", c)).toMatchObject({ ok: false, status: 409 });
    expect(db.canal.create).not.toHaveBeenCalled();
  });

  it("reconectar canal que um agente usa: atualiza o canal e a cópia do agente", async () => {
    db.canal.findFirst.mockResolvedValue({ id: "k", orgId: "o1", agentId: "A" });
    expect(await salvarCanal("o1", c)).toEqual({ ok: true, canalId: "k" });
    expect(ativ.apagarAtivacao).toHaveBeenCalledWith(expect.anything(), "messenger", "A");
    expect(ativ.gravarAtivacao).toHaveBeenCalledWith(expect.anything(), "messenger", "A", c.dados);
  });
});

describe("conectarTelegram", () => {
  it("token inválido: não grava nada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }))));
    expect(await conectarTelegram("o1", "123:abc")).toMatchObject({ ok: false, status: 400 });
    expect(db.canal.create).not.toHaveBeenCalled();
  });

  it("registra o webhook com o id do CANAL (não do agente)", async () => {
    db.canal.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: "novo", orgId: "o1", agentId: null });
    const f = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes("getMe") ? { ok: true, result: { username: "lojabot" } } : { ok: true }))
    );
    vi.stubGlobal("fetch", f);
    expect(await conectarTelegram("o1", "123:abc")).toEqual({ ok: true, canalId: "novo" });
    const corpo = JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(corpo).toMatchObject({ url: "https://app.eva/api/webhooks/telegram/canal/novo", secret_token: "segredo" });
  });
});

describe("conectarWhatsAppQr", () => {
  it("cria o canal e pede a sessão ao worker", async () => {
    await conectarWhatsAppQr("o1");
    expect(db.canal.create.mock.calls[0][0].data).toMatchObject({ orgId: "o1", tipo: "whatsapp_qr", status: "pendente" });
    expect(db.canalWhatsAppQr.create).toHaveBeenCalledWith({ data: { canalId: "novo", status: "requesting" } });
  });
});

describe("desconectarCanal", () => {
  it("QR: tira do agente, avisa o worker (logging_out) e apaga o canal", async () => {
    db.canal.findFirst.mockResolvedValue({ id: "q", orgId: "o1", tipo: "whatsapp_qr", agentId: "A", segredos: null });
    ativ.desativarCanal.mockResolvedValue({ ok: true, tipo: "whatsapp_qr", dados: {}, saiuDe: "A" });
    expect(await desconectarCanal("o1", "q")).toEqual({ ok: true });
    expect(db.canalWhatsAppQr.updateMany).toHaveBeenCalledWith({ where: { canalId: "q" }, data: { status: "logging_out" } });
    expect(db.canal.delete).toHaveBeenCalledWith({ where: { id: "q" } });
  });

  it("Telegram: tira o webhook do bot", async () => {
    db.canal.findFirst.mockResolvedValue({ id: "t", orgId: "o1", tipo: "telegram", agentId: null, segredos: null });
    ativ.desativarCanal.mockResolvedValue({ ok: true, tipo: "telegram", dados: { botToken: "c:123:abc" }, saiuDe: null });
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    await desconectarCanal("o1", "t");
    expect(f.mock.calls[0][0]).toBe("https://api.telegram.org/bot123:abc/deleteWebhook");
  });

  it("canal de outro contrato: não encontra", async () => {
    db.canal.findFirst.mockResolvedValue(null);
    expect(await desconectarCanal("o1", "x")).toMatchObject({ ok: false, status: 404 });
  });
});
