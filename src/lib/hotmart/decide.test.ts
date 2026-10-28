import { describe, it, expect } from "vitest";
import { decide, type CurrentState } from "./decide";
import type { StageRole } from "./types";

const empty: CurrentState = { model: "subscription", hasLateStage: false, card: null, contact: null };
const card = (role: StageRole, extra: Partial<NonNullable<CurrentState["card"]>> = {}) => ({ role, name: "Drawing Club | Ana", lastEvent: null, transaction: null, ...extra });
const ev = (event: string, extra = {}) => ({ event, transaction: "HP1", cardName: "Drawing Club | Ana | Founders", plan: "Founders", amountBrlCents: 3500, productSlug: "drawing-club", directChannel: false, ...extra });

describe("decide — assinatura", () => {
  it("aprovado sem card cria em Novo membro e marca o contato como ativo", () => {
    expect(decide(empty, ev("PURCHASE_APPROVED"))).toMatchObject({ action: "create", target: "new", contact: { status_drawing_club: "ativo" } });
  });
  it("aprovado de quem já foi membro (ex) volta para Membro ativo", () => {
    expect(decide({ ...empty, card: card("former") }, ev("PURCHASE_APPROVED"))).toMatchObject({ action: "update", target: "active", move: true });
  });
  it("atrasado move ativo -> pendente e pendente -> ativo de volta", () => {
    expect(decide({ ...empty, card: card("active") }, ev("PURCHASE_DELAYED"))).toMatchObject({ target: "overdue", move: true });
    expect(decide({ ...empty, card: card("overdue") }, ev("PURCHASE_APPROVED"))).toMatchObject({ target: "active", move: true });
  });
  it("carrinho abandonado não regride quem já é membro", () => {
    expect(decide({ ...empty, card: card("active") }, ev("PURCHASE_OUT_OF_SHOPPING_CART"))).toMatchObject({ move: false, late: true, action: "none" });
  });
  it("cancelado só leva a ex-membro quem era membro", () => {
    expect(decide({ ...empty, card: card("awaiting") }, ev("PURCHASE_CANCELED")).move).toBe(false);
    expect(decide({ ...empty, card: card("active") }, ev("PURCHASE_CANCELED"))).toMatchObject({ target: "former", move: true, lossReason: "cancelado" });
  });
  it("ex-membro é final, exceto pagamento aprovado", () => {
    expect(decide({ ...empty, card: card("former") }, ev("PURCHASE_DELAYED")).move).toBe(false);
  });
  it("contato: LTV soma no aprovado, não soma de novo no repetido, desconta no reembolso", () => {
    const c = { products: ["creative-ai"], ltvCents: 10000 };
    expect(decide({ ...empty, contact: c }, ev("PURCHASE_APPROVED")).contact).toMatchObject({ ltv_hotmart: 13500, produtos_comprados: ["creative-ai", "drawing-club"], status_drawing_club: "ativo" });
    const repeated = decide({ ...empty, contact: c, card: card("active", { lastEvent: "PURCHASE_APPROVED", transaction: "HP1" }) }, ev("PURCHASE_APPROVED"));
    expect(repeated.repeated).toBe(true);
    expect(repeated.contact.ltv_hotmart).toBe(10000);
    expect(decide({ ...empty, contact: c, card: card("active") }, ev("PURCHASE_REFUNDED")).contact.ltv_hotmart).toBe(6500);
  });
  it("renomeia o card quando o plano aparece", () => {
    expect(decide({ ...empty, card: card("new") }, ev("CLUB_FIRST_ACCESS")).rename).toBe("Drawing Club | Ana | Founders");
  });
  it("canal 'direto' não sobrescreve o canal de um card existente", () => {
    expect(decide({ ...empty, card: card("active") }, ev("PURCHASE_APPROVED", { directChannel: true })).dropChannel).toBe(true);
  });
  it("cancelamento de assinatura marca a assinatura como cancelada", () => {
    expect(decide({ ...empty, card: card("active") }, ev("SUBSCRIPTION_CANCELLATION"))).toMatchObject({ target: "former", move: true, dealFields: { status_da_assinatura: "CANCELLED" } });
  });
});

describe("decide — compra única", () => {
  const u: CurrentState = { model: "one_time", hasLateStage: true, card: null, contact: null };
  it("aprovado -> Compra aprovada; completo -> Venda Confirmada; reembolso -> Perdido", () => {
    expect(decide(u, ev("PURCHASE_APPROVED"))).toMatchObject({ action: "create", target: "approved" });
    expect(decide({ ...u, card: card("approved") }, ev("PURCHASE_COMPLETE"))).toMatchObject({ target: "confirmed", move: true });
    expect(decide({ ...u, card: card("confirmed") }, ev("PURCHASE_REFUNDED"))).toMatchObject({ target: "lost", move: true, lossReason: "reembolso" });
  });
  it("atrasado sem etapa 'Pagamento atrasado' cai em Aguardando", () => {
    expect(decide({ ...u, hasLateStage: false }, ev("PURCHASE_DELAYED")).target).toBe("awaiting");
  });
  it("primeiro acesso sem card não cria", () => {
    expect(decide(u, ev("CLUB_FIRST_ACCESS")).action).toBe("none");
  });
  it("primeiro acesso atrasado só grava a data do primeiro acesso", () => {
    expect(decide({ ...u, card: card("confirmed") }, ev("CLUB_FIRST_ACCESS"))).toMatchObject({ action: "update", move: false, firstAccessOnly: true });
  });
});
