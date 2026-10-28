// Hotmart nativa: o que a regra usa. Papel (role) = o que a etapa significa
// para a regra (um por chave do nó "Decidir" do n8n); o nome da etapa é livre.

export type ProductModel = "subscription" | "one_time";

// Assinatura (Club): ca, ag, novo, ativo, inad, canc, ex no n8n.
export type SubscriptionRole = "cart" | "awaiting" | "new" | "active" | "overdue" | "cancel_requested" | "former";
// Compra única: li, ca, ag, pa, co, al, ga, re, pe no n8n.
export type OneTimeRole = "waitlist" | "cart" | "awaiting" | "late" | "approved" | "student" | "confirmed" | "refund_requested" | "lost";
export type StageRole = SubscriptionRole | OneTimeRole;

export interface ProductConfig {
  slug: string;
  name: string;
  model: ProductModel;
  pipelineId: string;
  /** papel -> id da etapa no Eva */
  stages: Partial<Record<StageRole, string>>;
}

/** Ordem para "nunca voltar etapa" (igual ao n8n). */
export const STAGE_ORDER: Record<ProductModel, Partial<Record<StageRole, number>>> = {
  subscription: { cart: 1, awaiting: 2, new: 4, active: 5, overdue: 5, cancel_requested: 6, former: 9 },
  one_time: { waitlist: 0, cart: 1, awaiting: 2, late: 3, approved: 4, student: 5, refund_requested: 6, confirmed: 7, lost: 9 },
};

export const ROLES: Record<ProductModel, StageRole[]> = {
  subscription: ["cart", "awaiting", "new", "active", "overdue", "cancel_requested", "former"],
  one_time: ["waitlist", "cart", "awaiting", "late", "approved", "student", "confirmed", "refund_requested", "lost"],
};

/** Rótulo do papel no painel. */
export const ROLE_LABELS: Record<StageRole, string> = {
  waitlist: "Lista de interesse", cart: "Carrinho abandonado", awaiting: "Aguardando pagamento",
  late: "Pagamento atrasado", approved: "Compra aprovada", student: "Aluno ativo", confirmed: "Venda confirmada",
  refund_requested: "Reembolso solicitado", lost: "Perdido", new: "Novo membro", active: "Membro ativo",
  overdue: "Pagamento pendente", cancel_requested: "Cancelamento solicitado", former: "Ex-membro",
};

/** Nome da etapa (como veio do Beeno), sem acento e minúsculo -> papel. Sugere o mapeamento. */
export const ROLE_BY_STAGE_NAME: Record<string, StageRole> = {
  "lista de interesse": "waitlist", "carrinho abandonado": "cart", "aguardando pagamento": "awaiting",
  "pagamento atrasado": "late", "compra aprovada": "approved", "aluno ativo": "student", "turma confirmada": "student",
  "venda confirmada": "confirmed", "reembolso solicitado": "refund_requested", perdido: "lost",
  "novo membro": "new", "membro ativo": "active", "pagamento pendente": "overdue",
  "cancelamento solicitado": "cancel_requested", "ex-membro": "former",
};
