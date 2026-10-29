import { describe, it, expect } from "vitest";
import { buyerOf, cancellationPayload, historyToPayload, subscriptionOf } from "./history";
import { normalizeEvent } from "./normalize";
import type { ProductConfig } from "./types";

const curso: ProductConfig = { slug: "curso", name: "Curso", model: "one_time", pipelineId: "p", stages: {} };
const club: ProductConfig = { slug: "club", name: "Drawing Club", model: "subscription", pipelineId: "p2", stages: {} };
const ms = Date.UTC(2025, 2, 10, 15);

// Formato do item de GET /sales/history (doc da Hotmart).
const item = (status: string, extra: Record<string, unknown> = {}) => ({
  product: { id: 111, name: "Curso" },
  buyer: { name: "Ana", ucode: "U1", email: "Ana@X.com" },
  producer: { name: "Renata" },
  purchase: {
    transaction: "HP100", order_date: ms - 3600e3, approved_date: ms, status, recurrency_number: 2, is_subscription: false,
    price: { value: 497, currency_code: "BRL" }, payment: { type: "PIX", installments_number: 1 },
    tracking: { source_sck: "hotmart_product_page", source: "" }, offer: { code: "abc" }, warranty_expire_date: ms + 7 * 86400e3,
    ...extra,
  },
});

describe("historyToPayload", () => {
  it("status que a regra conhece vira o evento do webhook, com id da importação", () => {
    const cases: [string, string, string][] = [
      ["APPROVED", "PURCHASE_APPROVED", "approved"],
      ["COMPLETE", "PURCHASE_COMPLETE", "complete"],
      ["REFUNDED", "PURCHASE_REFUNDED", "refunded"],
      ["PARTIALLY_REFUNDED", "PURCHASE_REFUNDED", "refunded"],
      ["CHARGEBACK", "PURCHASE_CHARGEBACK", "chargeback"],
      ["OVERDUE", "PURCHASE_DELAYED", "delayed"],
      ["WAITING_PAYMENT", "PURCHASE_BILLET_PRINTED", "pending"],
    ];
    for (const [status, event, sale] of cases) {
      const p = historyToPayload(item(status))!;
      expect(p).toMatchObject({ event, id: `import:HP100:${status}`, creation_date: ms });
      expect(normalizeEvent(p, curso).sale.status).toBe(sale);
    }
  });

  it("status sem evento (STARTED, BLOCKED...) é pulado", () => {
    expect(historyToPayload(item("STARTED"))).toBeNull();
    expect(historyToPayload(item("BLOCKED"))).toBeNull();
  });

  it("normalizeEvent lê valor em centavos, canal, chave da transação e dados do comprador", () => {
    const buyer = buyerOf({
      transaction: "HP100",
      users: [
        { role: "PRODUCER", user: { name: "R" } },
        { role: "BUYER", user: { name: "Ana", email: "ana@x.com", cellphone: "11999998888", documents: [{ type: "CPF", value: "123.456.789-01" }], address: { city: "SP", zip_code: "01000-000" } } },
      ],
    })!;
    expect(buyer[0]).toBe("HP100");
    const n = normalizeEvent(historyToPayload(item("APPROVED"), buyer[1]), curso);
    expect(n.email).toBe("ana@x.com");
    expect(n.amountBrlCents).toBe(49700);
    expect(n.deal.amountCents).toBe(49700);
    expect(n.deal.currency).toBe("BRL");
    expect(n.sale.channel).toBe("pagina-hotmart");
    expect(n.key).toEqual({ source: "hotmart", value: "HP100" });
    expect(n.cpf).toBe("12345678901");
    expect(n.contact.phone).toBe("5511999998888");
    expect(n.contact.customFields).toMatchObject({ city: "SP", zipcode: "01000-000", hotmart_ucode: "U1" });
    expect(n.deal.customFields).toMatchObject({ forma_de_pagamento: "PIX", codigo_da_oferta: "abc", fim_da_garantia: "2025-03-17" });
  });

  it("Club com assinatura: chave do assinante, plano e nº da cobrança", () => {
    const sub = subscriptionOf({ subscriber_code: "SUB9", status: "ACTIVE", plan: { name: "Founders" }, transaction: "HP100", subscriber: { email: "ANA@x.com" } })!;
    const n = normalizeEvent(historyToPayload(item("APPROVED"), undefined, sub), club);
    expect(n.key).toEqual({ source: "hotmart_assinatura", value: "SUB9" });
    expect(n.plan).toBe("Founders");
    expect(n.sale.recurrence).toBe(2);
    expect(n.cardName).toBe("Drawing Club | Ana | Founders");
  });
});

describe("cancellationPayload", () => {
  it("assinatura cancelada gera SUBSCRIPTION_CANCELLATION na data do fim; ativa não gera", () => {
    const base = { subscriber_code: "SUB9", plan: { name: "Founders" }, subscriber: { email: "ana@x.com", name: "Ana" }, end_accession_date: ms };
    expect(cancellationPayload(subscriptionOf({ ...base, status: "ACTIVE" })!, "222")).toBeNull();
    const p = cancellationPayload(subscriptionOf({ ...base, status: "CANCELLED_BY_CUSTOMER" })!, "222")!;
    expect(p).toMatchObject({ event: "SUBSCRIPTION_CANCELLATION", id: "import:SUB9:CANCELLATION", creation_date: ms });
    const n = normalizeEvent(p, club);
    expect(n.email).toBe("ana@x.com");
    expect(n.key).toEqual({ source: "hotmart_assinatura", value: "SUB9" });
  });
});
