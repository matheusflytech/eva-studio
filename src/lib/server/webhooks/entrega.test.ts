import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  webhookEndpoint: { findUnique: vi.fn(), update: vi.fn() },
  webhookEntrega: { update: vi.fn(), updateMany: vi.fn() },
}));
const rede = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/ssrf", () => rede);
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (s: string) => s }));

import { proximaEspera, tentarEntrega } from "./entrega";

const endpoint = (extra: Record<string, unknown> = {}) => ({ id: "w1", url: "https://n8n.x/webhook/1", segredo: "whsec_AAAA", ativo: true, falhandoDesde: null, ...extra });
const entrega = { id: "e1", endpointId: "w1", eventoId: "msg_1", payload: { type: "deal.won" }, tentativas: 0 };
const resposta = (status: number, headers: Record<string, string> = {}) => ({ status, headers: new Headers(headers), text: async () => "ok" });

beforeEach(() => {
  vi.clearAllMocks();
  db.webhookEndpoint.findUnique.mockResolvedValue(endpoint());
});

describe("proximaEspera", () => {
  it("segue a tabela e para no fim; Retry-After maior vale", () => {
    expect(proximaEspera(1, null)).toBe(5);
    expect(proximaEspera(2, null)).toBe(300);
    expect(proximaEspera(7, null)).toBe(36000);
    expect(proximaEspera(8, null)).toBeNull();
    expect(proximaEspera(1, 120)).toBe(120);
  });
});

describe("tentarEntrega", () => {
  it("2xx: entregue, com a assinatura Standard Webhooks e o mesmo webhook-id", async () => {
    rede.safeFetch.mockResolvedValue(resposta(204));
    const r = await tentarEntrega(entrega);
    expect(r.ok).toBe(true);
    const init = rede.safeFetch.mock.calls[0][1];
    expect(init.headers["webhook-id"]).toBe("msg_1");
    expect(init.headers["webhook-signature"]).toMatch(/^v1,/);
    expect(init.body).toBe(JSON.stringify(entrega.payload));
    expect(db.webhookEntrega.update.mock.calls[0][0].data).toMatchObject({ status: "entregue", tentativas: 1, ultimoStatus: 204 });
    expect(db.webhookEndpoint.update.mock.calls[0][0].data).toMatchObject({ falhandoDesde: null });
  });

  it("500: continua pendente e marca a próxima tentativa", async () => {
    rede.safeFetch.mockResolvedValue(resposta(500));
    const r = await tentarEntrega(entrega);
    expect(r.ok).toBe(false);
    const data = db.webhookEntrega.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.proximaEm).toBeInstanceOf(Date);
  });

  it("400: recusa definitiva, não tenta de novo", async () => {
    rede.safeFetch.mockResolvedValue(resposta(400));
    await tentarEntrega(entrega);
    expect(db.webhookEntrega.update.mock.calls[0][0].data.status).toBe("falhou");
  });

  it("410: desliga o endpoint e cancela o que estava na fila", async () => {
    rede.safeFetch.mockResolvedValue(resposta(410));
    const r = await tentarEntrega(entrega);
    expect(r).toMatchObject({ desligar: "410" });
    expect(db.webhookEndpoint.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ativo: false }) }));
    expect(db.webhookEntrega.updateMany).toHaveBeenCalledWith({ where: { endpointId: "w1", status: "pendente" }, data: { status: "cancelada" } });
  });

  it("falhando há mais de 5 dias: desliga", async () => {
    db.webhookEndpoint.findUnique.mockResolvedValue(endpoint({ falhandoDesde: new Date(Date.now() - 6 * 86_400_000) }));
    rede.safeFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await tentarEntrega(entrega);
    expect(r).toMatchObject({ desligar: "dias" });
  });

  it("endpoint desligado: cancela sem chamar", async () => {
    db.webhookEndpoint.findUnique.mockResolvedValue(endpoint({ ativo: false }));
    await tentarEntrega(entrega);
    expect(rede.safeFetch).not.toHaveBeenCalled();
    expect(db.webhookEntrega.update.mock.calls[0][0].data).toEqual({ status: "cancelada" });
  });
});
