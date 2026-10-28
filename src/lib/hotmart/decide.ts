import { STAGE_ORDER, type ProductModel, type StageRole } from "./types";
import { statusFieldId } from "./fields";

// Porta do nó "Decidir" dos workflows do n8n: que etapa o evento pede, se pode
// mover (nunca volta; no Club, ativo <-> pendente e novo -> pendente podem;
// ex/perdido só saem com pagamento aprovado) e o que muda no contato. Puro.

export interface CurrentState {
  model: ProductModel;
  /** O funil tem a etapa "Pagamento atrasado" (o e-book não tem). */
  hasLateStage: boolean;
  card: { role: StageRole | null; name: string; lastEvent: string | null; transaction: string | null } | null;
  contact: { products: string[]; ltvCents: number } | null;
}

export interface DecisionInput {
  event: string;
  transaction: string;
  cardName: string;
  plan: string | null;
  amountBrlCents: number;
  productSlug: string;
  /** O canal calculado foi "direto" (renovação sem rastreio). */
  directChannel: boolean;
}

export interface Decision {
  action: "create" | "update" | "none";
  target: StageRole | null;
  move: boolean;
  /** Valor do campo "Motivo da perda" (opções iguais às do Beeno). */
  lossReason: string | null;
  /** Evento atrás da etapa atual: não sobrescreve os dados do card. */
  late: boolean;
  /** Mesmo evento e mesma transação que o card já registrou. */
  repeated: boolean;
  /** Novo nome do card (Club, quando o plano aparece). */
  rename: string | null;
  /** Não gravar canal_de_origem "direto" por cima do canal do card. */
  dropChannel: boolean;
  /** Só gravar o primeiro acesso (evento atrasado). */
  firstAccessOnly: boolean;
  /** Campos extras do negócio que a regra decide. */
  dealFields: Record<string, unknown>;
  contact: Record<string, unknown>;
}

type Target = { target: StageRole | null; lossReason: string | null };

function oneTimeTarget(e: string, hasLate: boolean): Target {
  switch (e) {
    case "PURCHASE_OUT_OF_SHOPPING_CART": return { target: "cart", lossReason: null };
    case "PURCHASE_BILLET_PRINTED": return { target: "awaiting", lossReason: null };
    case "PURCHASE_DELAYED": return { target: hasLate ? "late" : "awaiting", lossReason: null };
    case "PURCHASE_APPROVED": return { target: "approved", lossReason: null };
    case "CLUB_FIRST_ACCESS": return { target: "student", lossReason: null };
    case "PURCHASE_COMPLETE": return { target: "confirmed", lossReason: null };
    case "PURCHASE_PROTEST": return { target: "refund_requested", lossReason: null };
    case "PURCHASE_CANCELED": return { target: "lost", lossReason: "cancelado" };
    case "PURCHASE_EXPIRED": return { target: "lost", lossReason: "expirado" };
    case "PURCHASE_REFUNDED": return { target: "lost", lossReason: "reembolso" };
    case "PURCHASE_CHARGEBACK": return { target: "lost", lossReason: "chargeback" };
    default: return { target: null, lossReason: null };
  }
}

function subscriptionTarget(e: string, current: StageRole | null, hasCard: boolean): Target {
  const member = current === "new" || current === "active" || current === "overdue" || current === "cancel_requested";
  switch (e) {
    case "PURCHASE_OUT_OF_SHOPPING_CART": return { target: "cart", lossReason: null };
    case "PURCHASE_BILLET_PRINTED": return { target: "awaiting", lossReason: null };
    case "PURCHASE_DELAYED": return { target: hasCard ? "overdue" : "awaiting", lossReason: null };
    case "PURCHASE_APPROVED": return { target: member || current === "former" ? "active" : "new", lossReason: null };
    case "CLUB_FIRST_ACCESS": return { target: "active", lossReason: null };
    case "PURCHASE_PROTEST": return { target: "cancel_requested", lossReason: null };
    case "PURCHASE_CANCELED": return { target: member ? "former" : null, lossReason: "cancelado" };
    case "PURCHASE_EXPIRED": return { target: member ? "former" : null, lossReason: "expirado" };
    case "PURCHASE_REFUNDED": return { target: "former", lossReason: "reembolso" };
    case "PURCHASE_CHARGEBACK": return { target: "former", lossReason: "chargeback" };
    case "SUBSCRIPTION_CANCELLATION": return { target: "former", lossReason: "cancelado" };
    default: return { target: null, lossReason: null };
  }
}

export function decide(state: CurrentState, n: DecisionInput): Decision {
  const isClub = state.model === "subscription";
  const order = STAGE_ORDER[state.model];
  const rank = (r: StageRole | null) => (r ? order[r] ?? -1 : -1);
  const card = state.card;
  const current = card?.role ?? null;
  const e = n.event;
  const { target, lossReason } = isClub ? subscriptionTarget(e, current, !!card) : oneTimeTarget(e, state.hasLateStage);
  const repeated = !!(card && card.lastEvent === e && n.transaction && card.transaction === n.transaction);

  let move = false;
  if (target && card) {
    if (rank(target) > rank(current)) move = true;
    if (isClub && ((current === "overdue" && target === "active") || (current === "active" && target === "overdue") || (current === "new" && target === "overdue"))) move = true;
    if (current === "lost" || current === "former") move = e === "PURCHASE_APPROVED";
  }
  const late = !!(card && target && !move && current && rank(target) < rank(current));

  let action: Decision["action"] = "none";
  let firstAccessOnly = false;
  if (card && late) {
    if (e === "CLUB_FIRST_ACCESS") { action = "update"; firstAccessOnly = true; }
  } else if (card) action = "update";
  else if (target && e !== "CLUB_FIRST_ACCESS") action = "create";

  const rename = isClub && card && n.plan && card.name !== n.cardName ? n.cardName : null;
  const dealFields: Record<string, unknown> = e === "SUBSCRIPTION_CANCELLATION" ? { status_da_assinatura: "CANCELLED" } : {};

  // Contato: produtos comprados, LTV e status do Club (sem contar duas vezes o mesmo evento).
  const c: Record<string, unknown> = {};
  const products = [...(state.contact?.products ?? [])];
  let ltv = state.contact?.ltvCents ?? 0;
  if (!repeated) {
    if (e === "PURCHASE_APPROVED") {
      if (!products.includes(n.productSlug)) products.push(n.productSlug);
      ltv += n.amountBrlCents;
    }
    if (e === "PURCHASE_REFUNDED" || e === "PURCHASE_CHARGEBACK") ltv = Math.max(0, ltv - n.amountBrlCents);
  }
  if (e === "PURCHASE_APPROVED" || e === "PURCHASE_REFUNDED" || e === "PURCHASE_CHARGEBACK") {
    c.produtos_comprados = products;
    c.ltv_hotmart = ltv;
  }
  if (e === "PURCHASE_CHARGEBACK") c.teve_chargeback = "sim";
  if (isClub) {
    // Diferença intencional do n8n: card criado agora também grava o status (lá ficava vazio).
    const final = move ? target : action === "create" ? target : current;
    const status = statusFieldId(n.productSlug);
    if (final === "new" || final === "active") c[status] = "ativo";
    if (final === "overdue") c[status] = "pagamento-pendente";
    if (final === "former") c[status] = "ex-membro";
  }

  return {
    action,
    target,
    move: action === "create" ? true : move,
    lossReason,
    late,
    repeated,
    rename,
    dropChannel: !!card && n.directChannel,
    firstAccessOnly,
    dealFields,
    contact: c,
  };
}
