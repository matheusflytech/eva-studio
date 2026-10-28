import type { ProductConfig } from "./types";

// Dados que a Hotmart manda e que podem ir para um campo personalizado. O id é
// a chave do campo padrão (a mesma que a Renata já usa). Cada contrato escolhe
// o destino: criar o campo padrão, usar um campo dele ou não gravar.

export type FieldType = "text" | "longtext" | "number" | "currency" | "date" | "datetime" | "select" | "multiselect";
export interface FieldOption { value: string; label: string }
export interface HotmartField {
  id: string;
  entity: "contact" | "deal";
  label: string;
  type: FieldType;
  options?: FieldOption[];
  /** Vem marcado para criar quando o contrato ainda não tem o campo. */
  essential?: boolean;
  /** A regra lê o campo de volta (evento repetido): sempre grava. */
  required?: boolean;
  hint?: string;
}
/** id -> chave do campo de destino; null = não gravar. Id ausente = campo com a mesma chave, se existir. */
export type FieldMap = Record<string, string | null>;

const YES_NO: FieldOption[] = [{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }];

export const CHANNEL_OPTIONS: FieldOption[] = [
  { value: "pagina-hotmart", label: "Página de vendas Hotmart" },
  { value: "area-membros", label: "Área de membros / Vitrine" },
  { value: "upsell", label: "Upsell / Order bump" },
  { value: "evento-qrcode", label: "Evento presencial / QR Code" },
  { value: "site", label: "Site próprio" },
  { value: "agente-hotmart", label: "Agente de vendas Hotmart" },
  { value: "afiliado", label: "Afiliado" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "outros", label: "Outros" },
  { value: "direto", label: "Direto" },
];

const BASE: HotmartField[] = [
  { id: "cpf_cnpj", entity: "contact", label: "CPF/CNPJ", type: "text", essential: true, hint: "Acha o contato quando o e-mail é outro." },
  { id: "ltv_hotmart", entity: "contact", label: "LTV Hotmart", type: "currency", essential: true, hint: "Soma das compras aprovadas, menos reembolsos." },
  { id: "teve_chargeback", entity: "contact", label: "Teve chargeback", type: "select", options: YES_NO, essential: true },
  { id: "tipo_de_documento", entity: "contact", label: "Tipo de documento", type: "text" },
  { id: "hotmart_ucode", entity: "contact", label: "Hotmart ucode", type: "text" },
  { id: "address1", entity: "contact", label: "Endereço", type: "text" },
  { id: "complement", entity: "contact", label: "Complemento", type: "text" },
  { id: "district", entity: "contact", label: "Bairro", type: "text" },
  { id: "city", entity: "contact", label: "Cidade", type: "text" },
  { id: "state", entity: "contact", label: "Estado", type: "text" },
  { id: "zipcode", entity: "contact", label: "CEP", type: "text" },
  { id: "country", entity: "contact", label: "País", type: "text" },

  { id: "ultimo_evento_hotmart", entity: "deal", label: "Último evento Hotmart", type: "text", required: true },
  { id: "transacao_hotmart", entity: "deal", label: "Transação Hotmart", type: "text", required: true },
  { id: "canal_de_origem", entity: "deal", label: "Canal de origem", type: "select", options: CHANNEL_OPTIONS, essential: true, hint: "Pelo afiliado, src e sck da compra." },
  {
    id: "motivo_da_perda", entity: "deal", label: "Motivo da perda", type: "select", essential: true,
    options: [
      { value: "cancelado", label: "Cancelado" }, { value: "expirado", label: "Expirado" },
      { value: "reembolso", label: "Reembolso" }, { value: "chargeback", label: "Chargeback" },
    ],
  },
  { id: "data_de_aprovacao", entity: "deal", label: "Data de aprovação", type: "datetime", essential: true },
  {
    id: "forma_de_pagamento", entity: "deal", label: "Forma de pagamento", type: "select", essential: true,
    options: [
      { value: "CREDIT_CARD", label: "Cartão de crédito" }, { value: "PIX", label: "Pix" }, { value: "BILLET", label: "Boleto" },
      { value: "PAYPAL", label: "PayPal" }, { value: "OUTRO", label: "Outro" },
    ],
  },
  { id: "data_do_ultimo_evento", entity: "deal", label: "Data do último evento", type: "datetime" },
  { id: "id_do_produto_hotmart", entity: "deal", label: "ID do produto Hotmart", type: "text" },
  { id: "codigo_da_oferta", entity: "deal", label: "Código da oferta", type: "text" },
  { id: "cupom", entity: "deal", label: "Cupom", type: "text" },
  { id: "valor_cheio", entity: "deal", label: "Valor cheio", type: "currency" },
  { id: "parcelas", entity: "deal", label: "Parcelas", type: "number" },
  { id: "valor_da_parcela", entity: "deal", label: "Valor da parcela", type: "currency" },
  { id: "codigo_pix", entity: "deal", label: "Código Pix", type: "longtext" },
  { id: "link_pix_boleto", entity: "deal", label: "Link Pix/boleto", type: "text" },
  { id: "vencimento_do_pix", entity: "deal", label: "Vencimento do Pix", type: "datetime" },
  { id: "motivo_da_recusa", entity: "deal", label: "Motivo da recusa", type: "text" },
  { id: "data_do_pedido", entity: "deal", label: "Data do pedido", type: "datetime" },
  { id: "fim_da_garantia", entity: "deal", label: "Fim da garantia", type: "date" },
  { id: "src", entity: "deal", label: "SRC", type: "text" },
  { id: "sck", entity: "deal", label: "SCK", type: "text" },
  { id: "afiliado", entity: "deal", label: "Afiliado", type: "text" },
  { id: "order_bump", entity: "deal", label: "Order bump", type: "select", options: YES_NO },
  { id: "data_do_primeiro_acesso", entity: "deal", label: "Data do primeiro acesso", type: "datetime" },
];

// Só fazem sentido com produto de assinatura.
const SUBSCRIPTION: HotmartField[] = [
  { id: "codigo_do_assinante", entity: "deal", label: "Código do assinante", type: "text" },
  { id: "plano", entity: "deal", label: "Plano", type: "text" },
  { id: "status_da_assinatura", entity: "deal", label: "Status da assinatura", type: "text" },
  { id: "n__da_cobranca", entity: "deal", label: "Nº da cobrança", type: "number" },
  { id: "proxima_cobranca", entity: "deal", label: "Próxima cobrança", type: "date" },
  { id: "data_de_cancelamento", entity: "deal", label: "Data de cancelamento", type: "datetime" },
  { id: "valor_da_recorrencia", entity: "deal", label: "Valor da recorrência", type: "currency" },
];

export const SUBSCRIPTION_STATUS_OPTIONS: FieldOption[] = [
  { value: "ativo", label: "Ativo" },
  { value: "pagamento-pendente", label: "Pagamento Pendente" },
  { value: "ex-membro", label: "Ex-membro" },
  { value: "nunca-foi", label: "Nunca foi membro" },
];

/** Chave do status do contato numa assinatura (drawing-club -> status_drawing_club). */
export const statusFieldId = (slug: string) => `status_${slug.replace(/-/g, "_")}`;

/** Catálogo para os produtos ligados: produtos comprados e status de cada assinatura dependem deles. */
export function hotmartFields(products: Record<string, ProductConfig>): HotmartField[] {
  const list = Object.values(products);
  const slugs = new Map(list.map((p) => [p.slug, p.name]));
  const subs = [...new Map(list.filter((p) => p.model === "subscription").map((p) => [p.slug, p.name])).entries()];
  return [
    {
      id: "produtos_comprados", entity: "contact", label: "Produtos comprados", type: "multiselect", essential: true,
      options: [...slugs].map(([value, label]) => ({ value, label })),
    },
    ...subs.map(([slug, name]): HotmartField => ({
      id: statusFieldId(slug), entity: "contact", label: `Status ${name}`, type: "select", options: SUBSCRIPTION_STATUS_OPTIONS, essential: true,
    })),
    ...BASE,
    ...(subs.length ? SUBSCRIPTION : []),
  ];
}

// Texto aceita o que chega como texto; o resto só no mesmo tipo.
const AS_TEXT: FieldType[] = ["text", "longtext", "select", "date", "datetime"];
export function compatible(source: FieldType, target: string): boolean {
  if (source === target) return true;
  return (target === "text" || target === "longtext") && AS_TEXT.includes(source);
}

/** Chave onde gravar o dado `id` (ou null). */
export function targetKey(map: FieldMap, id: string): string | null {
  return id in map ? map[id] : id;
}

/** Troca as chaves padrão pelas escolhidas e tira o que não é para gravar. */
export function remap(map: FieldMap, values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(values)) {
    const k = targetKey(map, id);
    if (k) out[k] = v;
  }
  return out;
}
