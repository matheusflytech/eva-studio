import { describe, it, expect } from "vitest";
import { normalizeEvent } from "./normalize";

const club = { slug: "drawing-club", name: "Drawing Club", model: "subscription" as const, pipelineId: "p", stages: {} };
const oneTime = { ...club, slug: "creative-ai", name: "Creative AI for Fashion", model: "one_time" as const };

const approved = {
  id: "ev-1",
  event: "PURCHASE_APPROVED",
  creation_date: Date.UTC(2026, 9, 28, 14, 16),
  data: {
    product: { id: 8261397, name: "Drawing Club", warranty_date: "2026-11-04T00:00:00Z" },
    buyer: { email: " Ana@X.com ", name: "Ana Souza", checkout_phone: "21968523557", document: "123.456.789-01", document_type: "CPF", ucode: "U1" },
    purchase: {
      transaction: "HP1", approved_date: Date.UTC(2026, 9, 28, 14, 15), order_date: Date.UTC(2026, 9, 28, 14, 10),
      price: { value: 35, currency_value: "BRL" }, full_price: { value: 35 }, recurrence_number: 2,
      payment: { type: "CREDIT_CARD", installments_number: 1 }, offer: { code: "off1" }, origin: { src: "site", sck: "SITE_DCLUB" },
      date_next_charge: Date.UTC(2026, 10, 28, 3),
    },
    subscription: { subscriber: { code: "SUB1" }, plan: { name: "Founders" }, status: "ACTIVE" },
  },
};

describe("normalizeEvent", () => {
  it("contato: e-mail minúsculo, telefone só dígitos com 55, CPF só dígitos", () => {
    const n = normalizeEvent(approved, club);
    expect(n.email).toBe("ana@x.com");
    expect(n.contact.phone).toBe("5521968523557");
    expect(n.contact.customFields.cpf_cnpj).toBe("12345678901");
    expect(n.contact.name).toBe("Ana Souza");
  });

  it("assinatura usa o código do assinante como chave e o plano no nome do card", () => {
    const n = normalizeEvent(approved, club);
    expect(n.key).toEqual({ source: "hotmart_assinatura", value: "SUB1" });
    expect(n.cardName).toBe("Drawing Club | Ana Souza | Founders");
    expect(n.baseName).toBe("Drawing Club | Ana Souza");
  });

  it("compra única usa a transação", () => {
    const n = normalizeEvent(approved, oneTime);
    expect(n.key).toEqual({ source: "hotmart", value: "HP1" });
    expect(n.deal.customFields.plano).toBeUndefined();
  });

  it("campos do negócio no formato do Eva (data e hora em SP, moeda em centavos)", () => {
    const n = normalizeEvent(approved, club);
    expect(n.deal.customFields.data_de_aprovacao).toBe("2026-10-28T11:15");
    expect(n.deal.customFields.proxima_cobranca).toBe("2026-11-28");
    expect(n.deal.customFields.valor_cheio).toBe(3500);
    expect(n.deal.customFields.canal_de_origem).toBe("site-renata");
    expect(n.deal.amountCents).toBe(3500);
    expect(n.deal.closeDate).toBe("2026-10-28");
    expect(n.amountBrlCents).toBe(3500);
    expect(n.sale.status).toBe("approved");
  });

  it("moeda fora de BRL/USD/EUR usa o preço da oferta original", () => {
    const n = normalizeEvent({ ...approved, data: { ...approved.data, purchase: { ...approved.data.purchase, price: { value: 50, currency_value: "MXN" }, original_offer_price: { value: 35, currency_value: "BRL" } } } }, club);
    expect(n.deal.currency).toBe("BRL");
    expect(n.deal.amountCents).toBe(3500);
  });

  it("canal de origem: afiliado vence, depois upsell, src e sck", () => {
    const base = approved.data.purchase;
    const channel = (origin: object, extra: object = {}) => normalizeEvent({ ...approved, data: { ...approved.data, ...extra, purchase: { ...base, origin } } }, club).deal.customFields.canal_de_origem;
    expect(channel({ src: "instagram_bio" })).toBe("instagram");
    expect(channel({})).toBe("direto");
    expect(channel({ sck: "HOTMART_PRODUCT_PAGE" })).toBe("pagina-hotmart");
    expect(channel({ src: "site" }, { affiliates: [{ name: "Fulano", affiliate_code: "A1" }], producer: { name: "Renata Estefan" } })).toBe("afiliado");
  });
});
