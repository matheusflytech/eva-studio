import type { ProductConfig } from "./types";

// Porta do nó "Normalizar evento" dos workflows do n8n da Renata. Puro.
// Datas em horário de SP: data e hora `AAAA-MM-DDTHH:mm`, data `AAAA-MM-DD`;
// moeda em centavos. As chaves dos campos são as do Beeno (já copiadas).
/* eslint-disable @typescript-eslint/no-explicit-any -- payload externo, lido com cuidado */

const CURRENCIES = ["BRL", "USD", "EUR"];
const saoPaulo = (ms: unknown) => {
  const n = Number(ms);
  return n ? new Date(n - 3 * 3600e3).toISOString() : null;
};
const dateTime = (ms: unknown) => saoPaulo(ms)?.slice(0, 16) ?? null;
const day = (ms: unknown) => saoPaulo(ms)?.slice(0, 10) ?? null;
const cents = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100));
function compact(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== "") r[k] = v;
  return r;
}

export interface NormalizedEvent {
  event: string;
  eventId: string | null;
  email: string;
  /** CPF de 11 dígitos (busca do contato quando o e-mail não acha). */
  cpf: string | null;
  baseName: string;
  cardName: string;
  key: { source: "hotmart" | "hotmart_assinatura"; value: string };
  transaction: string;
  plan: string | null;
  contact: { name: string; phone: string; customFields: Record<string, unknown> };
  deal: { amountCents: number | null; currency: string | null; closeDate: string | null; customFields: Record<string, unknown> };
  amountBrlCents: number;
  sale: {
    status: string | null; productId: string | null; productName: string; offerCode: string | null; plan: string | null;
    subscriberCode: string | null; recurrence: number | null; paymentType: string | null; installments: number | null;
    src: string | null; sck: string | null; channel: string; orderedAt: string | null; approvedAt: string | null;
  };
}

const SALE_STATUS: Record<string, string> = {
  PURCHASE_APPROVED: "approved", PURCHASE_COMPLETE: "complete", PURCHASE_REFUNDED: "refunded",
  PURCHASE_CHARGEBACK: "chargeback", PURCHASE_CANCELED: "canceled", PURCHASE_EXPIRED: "expired",
  PURCHASE_DELAYED: "delayed", PURCHASE_BILLET_PRINTED: "pending", PURCHASE_PROTEST: "dispute",
  PURCHASE_OUT_OF_SHOPPING_CART: "cart_abandoned",
};

export function normalizeEvent(h: any, product: ProductConfig): NormalizedEvent {
  const ev = String(h?.event ?? "");
  const d = h?.data ?? {};
  const buyer = d.buyer ?? {};
  const user = d.user ?? {};
  const sub = d.subscriber ?? {};
  const purchase = d.purchase ?? {};
  const payment = purchase.payment ?? {};
  const offer = purchase.offer ?? d.offer ?? {};
  const subscription = d.subscription ?? {};
  const hotmartProduct = d.product ?? {};
  const isClub = product.model === "subscription";

  const email = String(buyer.email || user.email || sub.email || "").trim().toLowerCase();
  const name = String(buyer.name || user.name || sub.name || "").trim();

  let phone = "";
  if (buyer.checkout_phone) {
    const cp = String(buyer.checkout_phone).replace(/\D/g, "");
    phone = cp.length >= 10 ? cp : String(buyer.checkout_phone_code || "") + cp;
  } else if (buyer.phone) phone = String(buyer.phone);
  else if (sub.phone?.cell) phone = String(sub.phone.dddCell || "") + String(sub.phone.cell);
  phone = phone.replace(/\D/g, "");
  if (phone && phone.length <= 11) phone = `55${phone}`;
  if (phone) phone = `+${phone}`;

  const doc = buyer.document ? String(buyer.document).replace(/\D/g, "") : null;
  const addr = buyer.address ?? {};
  const contactFields = compact({
    cpf_cnpj: doc,
    tipo_de_documento: buyer.document_type,
    hotmart_ucode: buyer.ucode,
    address1: addr.address ? `${addr.address}${addr.number ? `, ${addr.number}` : ""}` : null,
    complement: addr.complement, district: addr.neighborhood, city: addr.city, state: addr.state,
    zipcode: addr.zipcode, country: addr.country,
  });

  const transaction = String(purchase.transaction || "");
  const subscriber = String(subscription.subscriber?.code || sub.code || "");
  const plan = subscription.plan?.name ? String(subscription.plan.name) : "";
  const key = isClub && subscriber ? { source: "hotmart_assinatura" as const, value: subscriber } : { source: "hotmart" as const, value: transaction };
  const baseName = `${product.name} | ${name || email}`;
  const cardName = isClub && plan ? `${baseName} | ${plan}` : baseName;

  const paymentType = payment.type ? (["CREDIT_CARD", "PIX", "BILLET", "PAYPAL"].includes(payment.type) ? payment.type : "OUTRO") : null;
  const af = d.affiliates?.[0] ?? null;
  const affiliate = af && (af.name || af.affiliate_code) ? `${af.name ?? ""} (${af.affiliate_code ?? ""})` : null;
  const orderBump = typeof purchase.order_bump?.is_order_bump === "boolean" ? (purchase.order_bump.is_order_bump ? "sim" : "nao") : null;
  const origin = purchase.origin ?? {};
  const price = purchase.price ?? {};
  const full = purchase.full_price ?? {};
  const orig = purchase.original_offer_price ?? {};

  let currency: string | null = price.currency_value ? String(price.currency_value).toUpperCase() : null;
  let amount = price.value;
  if (currency && !CURRENCIES.includes(currency)) {
    const oc = orig.currency_value ? String(orig.currency_value).toUpperCase() : null;
    if (oc && CURRENCIES.includes(oc) && orig.value) { currency = oc; amount = orig.value; } else currency = null;
  }
  let amountBrl = 0;
  if (String(price.currency_value || "BRL").toUpperCase() === "BRL") amountBrl = Number(price.value || 0);
  else if (String(orig.currency_value || "").toUpperCase() === "BRL") amountBrl = Number(orig.value || 0);

  const s = String(origin.src || "").trim().toLowerCase();
  const k = String(origin.sck || "").trim().toLowerCase();
  const producer = d.producer?.name ? String(d.producer.name).toLowerCase() : "";
  const afName = af?.name ? String(af.name).toLowerCase() : "";
  // Valores do campo "Canal de origem" (opções iguais às do Beeno).
  const channel =
    afName && producer && afName !== producer && !afName.includes("estefan") ? "afiliado"
    : purchase.order_bump?.is_order_bump === true ? "upsell"
    : s === "qr_code" || s === "qrcode" ? "evento-qrcode"
    : s === "site" || k.startsWith("site_") ? "site-renata"
    : s.includes("instagram") || s === "ig" ? "instagram"
    : s.includes("whatsapp") || s === "wpp" || s === "wa" ? "whatsapp"
    : s.includes("email") || s.includes("e-mail") ? "email"
    : s === "eva_holding" || s.startsWith("eva") ? "equipe-comercial"
    : k === "hotmart_product_page" || k === "hotmart_site" ? "pagina-hotmart"
    : k.startsWith("hotmart_club_") || k.startsWith("new_club_sales_page") || k.startsWith("hotmart_mem") ? "area-membros"
    : k === "hotmart_sales_agent" ? "agente-hotmart"
    : !s && !k ? "direto" : "outros";

  const eventDate = h?.creation_date ?? h?.creationDate;
  const dealFields = compact({
    ultimo_evento_hotmart: ev,
    data_do_ultimo_evento: dateTime(eventDate),
    id_do_produto_hotmart: hotmartProduct.id ? String(hotmartProduct.id) : null,
    transacao_hotmart: transaction,
    codigo_da_oferta: offer.code,
    cupom: offer.coupon_code,
    valor_cheio: cents(full.value),
    forma_de_pagamento: paymentType,
    parcelas: payment.installments_number,
    codigo_pix: payment.pix_code,
    link_pix_boleto: payment.billet_url || payment.pix_qrcode ? String(payment.billet_url || payment.pix_qrcode).replace(/&amp;/g, "&") : null,
    vencimento_do_pix: dateTime(payment.pix_expiration_date),
    motivo_da_recusa: payment.refusal_reason,
    data_do_pedido: dateTime(purchase.order_date),
    fim_da_garantia: hotmartProduct.warranty_date ? String(hotmartProduct.warranty_date).slice(0, 10) : null,
    src: origin.src,
    sck: origin.sck,
    canal_de_origem: channel,
    afiliado: affiliate,
    order_bump: orderBump,
    codigo_do_assinante: isClub ? subscriber : null,
    plano: isClub ? plan : null,
    status_da_assinatura: isClub ? subscription.status : null,
    n__da_cobranca: isClub ? purchase.recurrence_number : null,
    proxima_cobranca: isClub ? day(purchase.date_next_charge || d.date_next_charge) : null,
    data_de_cancelamento: isClub ? dateTime(d.cancellation_date) : null,
    valor_da_recorrencia: isClub ? cents(d.actual_recurrence_value) : null,
    data_de_aprovacao: dateTime(purchase.approved_date),
    valor_da_parcela: full.value && payment.installments_number ? Math.round((Number(full.value) / Number(payment.installments_number)) * 100) : null,
    data_do_primeiro_acesso: ev === "CLUB_FIRST_ACCESS" ? dateTime(eventDate) : null,
  });

  return {
    event: ev,
    eventId: h?.id ? String(h.id) : null,
    email,
    cpf: doc && doc.length === 11 ? doc : null,
    baseName,
    cardName,
    key,
    transaction,
    plan: isClub && plan ? plan : null,
    contact: { name: name || email, phone, customFields: contactFields },
    deal: {
      amountCents: cents(amount),
      currency,
      closeDate: ev === "PURCHASE_APPROVED" && purchase.approved_date ? day(purchase.approved_date) : null,
      customFields: dealFields,
    },
    amountBrlCents: Math.round(amountBrl * 100),
    sale: {
      status: SALE_STATUS[ev] ?? null,
      productId: hotmartProduct.id ? String(hotmartProduct.id) : null,
      productName: product.name,
      offerCode: offer.code ?? null,
      plan: isClub ? plan || null : null,
      subscriberCode: isClub ? subscriber || null : null,
      recurrence: isClub && purchase.recurrence_number ? Number(purchase.recurrence_number) : null,
      paymentType,
      installments: payment.installments_number ? Number(payment.installments_number) : null,
      src: origin.src ?? null,
      sck: origin.sck ?? null,
      channel,
      orderedAt: purchase.order_date ? new Date(Number(purchase.order_date)).toISOString() : null,
      approvedAt: purchase.approved_date ? new Date(Number(purchase.approved_date)).toISOString() : null,
    },
  };
}
