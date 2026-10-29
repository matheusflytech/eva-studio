import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
  deal: { findFirst: vi.fn(), update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })) },
  sale: { upsert: vi.fn(async () => ({})) },
}));
const crm = vi.hoisted(() => ({
  createDeal: vi.fn(async () => ({ id: "d-new", closedAt: new Date() })),
  moveDealStage: vi.fn(async () => ({})),
  preencherCamposDoNegocio: vi.fn(async () => ({ aplicados: 1, erros: [] })),
  preencherCamposDoContato: vi.fn(async () => ({ aplicados: 1, erros: [] })),
}));
const ext = vi.hoisted(() => ({ idPorExterno: vi.fn(async () => null as string | null), vincularExterno: vi.fn(async () => {}) }));
const contacts = vi.hoisted(() => ({ criarContato: vi.fn(async () => ({ id: "c-new" })) }));
const bus = vi.hoisted(() => ({ publicarEvento: vi.fn(async () => {}) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crm", () => crm);
vi.mock("@/lib/server/api-v1/externos", () => ext);
vi.mock("@/lib/server/api-v1/contatos", () => contacts);
vi.mock("@/lib/server/eventos/barramento", () => bus);

import { applyEvent } from "./apply";

const products = {
  "8261397": {
    slug: "drawing-club", name: "Drawing Club", model: "subscription" as const, pipelineId: "p",
    stages: { cart: "s-cart", awaiting: "s-await", new: "s-new", active: "s-active", overdue: "s-overdue", cancel_requested: "s-canc", former: "s-former" },
  },
};
const payload = (event: string) => ({
  id: `ev-${event}`, event, creation_date: Date.UTC(2026, 9, 28, 14),
  data: {
    product: { id: 8261397 }, buyer: { email: "ana@x.com", name: "Ana" },
    purchase: { transaction: "HP1", approved_date: Date.UTC(2026, 9, 28, 14), price: { value: 35, currency_value: "BRL" } },
    subscription: { subscriber: { code: "SUB1" }, plan: { name: "Founders" } },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  ext.idPorExterno.mockResolvedValue(null);
});

describe("applyEvent", () => {
  it("produto sem funil é ignorado", async () => {
    expect((await applyEvent("o1", {}, payload("PURCHASE_APPROVED"))).result).toBe("ignored");
  });

  it("compra aprovada nova: cria contato, negócio em Novo membro, chave do assinante e venda", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    db.deal.findFirst.mockResolvedValue(null);
    const r = await applyEvent("o1", products, payload("PURCHASE_APPROVED"));
    expect(r).toMatchObject({ result: "ok", contactId: "c-new", dealId: "d-new" });
    expect(crm.createDeal).toHaveBeenCalledWith(expect.objectContaining({ stageId: "s-new", contactId: "c-new", name: "Drawing Club | Ana | Founders" }));
    expect(crm.preencherCamposDoContato).toHaveBeenCalledWith("o1", "c-new", expect.objectContaining({ ltv_hotmart: 3500, status_drawing_club: "ativo" }));
    expect(ext.vincularExterno).toHaveBeenCalledWith("o1", "deal", "d-new", "SUB1", "hotmart_assinatura");
    expect(db.sale.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId_platform_transaction: { orgId: "o1", platform: "hotmart", transaction: "HP1" } } }));
    expect(bus.publicarEvento).toHaveBeenCalledWith(expect.objectContaining({ tipo: "sale.approved", objetoId: "d-new" }));
  });

  it("card existente em Membro ativo + atrasado: move para Pagamento Pendente", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Ana", phone: "55", customFields: {} });
    ext.idPorExterno.mockResolvedValue("d1");
    db.deal.findFirst.mockResolvedValue({ id: "d1", name: "Drawing Club | Ana | Founders", stageId: "s-active", customFields: {} });
    const r = await applyEvent("o1", products, payload("PURCHASE_DELAYED"));
    expect(r.result).toBe("ok");
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "s-overdue", expect.objectContaining({ reabrir: true }));
    expect(ext.vincularExterno).not.toHaveBeenCalled();
  });

  it("reembolso leva o motivo da perda no formato do moveDealStage", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Ana", phone: "55", customFields: { ltv_hotmart: 3500 } });
    ext.idPorExterno.mockResolvedValue("d1");
    db.deal.findFirst.mockResolvedValue({ id: "d1", name: "Drawing Club | Ana | Founders", stageId: "s-active", customFields: {} });
    await applyEvent("o1", products, payload("PURCHASE_REFUNDED"));
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "s-former", expect.objectContaining({ perda: { motivo: "reembolso" } }));
    expect(crm.preencherCamposDoNegocio).toHaveBeenCalledWith("o1", "d1", expect.objectContaining({ motivo_da_perda: "reembolso" }));
    // Sem data de aprovação no evento, fecha na data do evento.
    expect(db.deal.updateMany).toHaveBeenCalledWith({ where: { id: "d1", closedAt: { not: null } }, data: { closedAt: new Date(Date.UTC(2026, 9, 28, 14)) } });
    expect(bus.publicarEvento).toHaveBeenCalledWith(expect.objectContaining({ tipo: "sale.refunded" }));
  });

  it("importação: histórico de etapa como importacao, fechamento na data da aprovação e sem sale.*", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Ana", phone: "55", customFields: {} });
    ext.idPorExterno.mockResolvedValue("d1");
    db.deal.findFirst.mockResolvedValue({ id: "d1", name: "Drawing Club | Ana | Founders", stageId: "s-cart", customFields: {} });
    await applyEvent("o1", products, payload("PURCHASE_APPROVED"), {}, { origin: "importacao" });
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "s-new", expect.objectContaining({ origem: "importacao" }));
    expect(db.deal.updateMany).toHaveBeenCalledWith({ where: { id: "d1", closedAt: { not: null } }, data: { closedAt: new Date("2026-10-28T12:00:00-03:00") } });
    expect(db.sale.upsert).toHaveBeenCalled();
    expect(bus.publicarEvento).not.toHaveBeenCalled();
  });

  it("mapa de campos: grava e lê pelo campo escolhido; dado sem destino não grava", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Ana", phone: "55", customFields: { valor_total: 1000 } });
    ext.idPorExterno.mockResolvedValue("d1");
    db.deal.findFirst.mockResolvedValue({ id: "d1", name: "Drawing Club | Ana | Founders", stageId: "s-active", customFields: {} });
    await applyEvent("o1", products, payload("PURCHASE_APPROVED"), { ltv_hotmart: "valor_total", canal_de_origem: null });
    expect(crm.preencherCamposDoContato).toHaveBeenCalledWith("o1", "c1", expect.objectContaining({ valor_total: 4500 }));
    const dealFields = (crm.preencherCamposDoNegocio.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(dealFields).not.toHaveProperty("canal_de_origem");
    expect(dealFields).toHaveProperty("transacao_hotmart", "HP1");
  });

  it("erro do CRM vira resultado de erro, sem exceção", async () => {
    db.contact.findFirst.mockRejectedValue(new Error("banco fora"));
    expect(await applyEvent("o1", products, payload("PURCHASE_APPROVED"))).toMatchObject({ result: "error", detail: "banco fora" });
  });
});
