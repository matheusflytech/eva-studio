// Histórico da API da Hotmart -> payload igual ao do webhook 2.0, para a
// importação passar pela mesma regra (normalizeEvent + applyEvent). Puro.
/* eslint-disable @typescript-eslint/no-explicit-any -- resposta externa, lida com cuidado */

/** Status da venda no histórico -> evento do webhook. Os que faltam aqui são pulados. */
export const STATUS_TO_EVENT: Record<string, string> = {
  APPROVED: "PURCHASE_APPROVED",
  COMPLETE: "PURCHASE_COMPLETE",
  REFUNDED: "PURCHASE_REFUNDED",
  PARTIALLY_REFUNDED: "PURCHASE_REFUNDED",
  CHARGEBACK: "PURCHASE_CHARGEBACK",
  CANCELLED: "PURCHASE_CANCELED",
  EXPIRED: "PURCHASE_EXPIRED",
  OVERDUE: "PURCHASE_DELAYED",
  PRINTED_BILLET: "PURCHASE_BILLET_PRINTED",
  WAITING_PAYMENT: "PURCHASE_BILLET_PRINTED",
  PROTESTED: "PURCHASE_PROTEST",
};
export const IMPORTED_STATUSES = Object.keys(STATUS_TO_EVENT);

/** Prefixo do id dos eventos da importação (o @@unique do evento dá a idempotência). */
export const IMPORT_PREFIX = "import:";

/** Comprador de `/sales/users` (telefone, CPF e endereço que o histórico não traz). */
export interface HistoryBuyer {
  name?: string;
  email?: string;
  phone?: string;
  document?: string;
  documentType?: string;
  address?: Record<string, unknown>;
}

/** Assinatura de `/subscriptions`, só o que a regra usa. */
export interface HistorySubscription {
  code: string;
  status: string;
  plan: string | null;
  transaction: string | null;
  email: string;
  name: string | null;
  endedAt: number | null;
}

/** Item de `/sales/users` -> [transação, comprador]. */
export function buyerOf(item: any): [string, HistoryBuyer] | null {
  const tx = item?.transaction ? String(item.transaction) : "";
  const u = (Array.isArray(item?.users) ? item.users : []).find((x: any) => x?.role === "BUYER")?.user;
  if (!tx || !u) return null;
  const doc = (Array.isArray(u.documents) ? u.documents : []).find((d: any) => d?.value);
  const a = u.address ?? {};
  return [
    tx,
    {
      name: u.name || undefined,
      email: u.email || undefined,
      phone: u.cellphone || u.phone || undefined,
      document: doc?.value ? String(doc.value) : undefined,
      documentType: doc?.type ? String(doc.type) : undefined,
      address: a && Object.keys(a).length
        ? { address: a.address, number: a.number, complement: a.complement, neighborhood: a.neighborhood, city: a.city, state: a.state, zipcode: a.zip_code ?? a.zipcode, country: a.country }
        : undefined,
    },
  ];
}

/** Item de `/subscriptions` -> assinatura. */
export function subscriptionOf(item: any): HistorySubscription | null {
  const code = item?.subscriber_code ? String(item.subscriber_code) : "";
  const email = String(item?.subscriber?.email ?? "").trim().toLowerCase();
  if (!code || !email) return null;
  return {
    code,
    status: String(item.status ?? ""),
    plan: item.plan?.name ? String(item.plan.name) : null,
    transaction: item.transaction ? String(item.transaction) : null,
    email,
    name: item.subscriber?.name ? String(item.subscriber.name) : null,
    endedAt: Number(item.end_accession_date) || null,
  };
}

/** Venda do histórico -> payload do webhook. Status fora da tabela devolve null. */
export function historyToPayload(item: any, buyer?: HistoryBuyer, subscription?: HistorySubscription): Record<string, unknown> | null {
  const p = item?.purchase ?? {};
  const status = String(p.status ?? "");
  const event = STATUS_TO_EVENT[status];
  const tx = p.transaction ? String(p.transaction) : "";
  if (!event || !tx) return null;
  const b = item.buyer ?? {};
  return {
    event,
    id: `${IMPORT_PREFIX}${tx}:${status}`,
    creation_date: p.approved_date ?? p.order_date ?? null,
    data: {
      product: { id: item.product?.id, name: item.product?.name, ...(p.warranty_expire_date ? { warranty_date: new Date(Number(p.warranty_expire_date)).toISOString() } : {}) },
      buyer: {
        name: b.name || buyer?.name,
        email: b.email || buyer?.email,
        ucode: b.ucode,
        phone: buyer?.phone,
        document: buyer?.document,
        document_type: buyer?.documentType,
        address: buyer?.address,
      },
      producer: item.producer?.name ? { name: item.producer.name } : undefined,
      purchase: {
        transaction: tx,
        order_date: p.order_date,
        approved_date: p.approved_date,
        status,
        recurrence_number: p.recurrency_number,
        price: { value: p.price?.value, currency_value: p.price?.currency_code },
        payment: { type: p.payment?.type, installments_number: p.payment?.installments_number },
        offer: { code: p.offer?.code },
        origin: { src: p.tracking?.source, sck: p.tracking?.source_sck },
      },
      ...(subscription ? { subscription: { subscriber: { code: subscription.code }, plan: { name: subscription.plan }, status: subscription.status } } : {}),
    },
  };
}

/** Assinatura cancelada -> SUBSCRIPTION_CANCELLATION (o card do Club vai para Ex-membro, como no webhook). */
export function cancellationPayload(s: HistorySubscription, productId: string): Record<string, unknown> | null {
  if (!s.status.startsWith("CANCELLED")) return null;
  return {
    event: "SUBSCRIPTION_CANCELLATION",
    id: `${IMPORT_PREFIX}${s.code}:CANCELLATION`,
    creation_date: s.endedAt,
    data: {
      product: { id: productId },
      subscriber: { code: s.code, email: s.email, name: s.name },
      subscription: { subscriber: { code: s.code }, plan: { name: s.plan }, status: s.status },
      cancellation_date: s.endedAt,
    },
  };
}
