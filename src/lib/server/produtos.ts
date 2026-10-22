import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { MAX_CENTAVOS, erro, reaisParaCentavos, respostaDeErroDoPrisma } from "@/lib/server/api-validacao";
import {
  lerDesconto,
  lerQuantidade,
  lerRecorrencia,
  lerTipoDeDesconto,
  resumoDosItens,
  totalDoItem,
  type ContaDoItem,
  type ItemDoNegocio,
  type ProdutoDoCatalogo,
  type ResumoDosItens,
} from "@/lib/produtos";

// Produtos no negócio, lado do servidor: ler itens, recalcular o valor do
// negócio e saber se as tabelas já existem no banco. As contas moram em
// src/lib/produtos.ts.

type Tx = Prisma.TransactionClient;

export class ErroDeProdutos extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Tabela de produtos/itens ainda não criada no banco (SQL não aplicado). */
export function tabelaDeProdutosAusente(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2021" || e.code === "P2022";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /eva_studio_(products|deal_items|deal_amount_settings)|does not exist|não existe/i.test(msg);
}

export const PRODUTOS_INATIVOS = "Produtos ainda não foram ativados no banco.";

/** Erro de escrita nos itens em resposta HTTP. */
export function falhaDeItens(e: unknown) {
  if (e instanceof ErroDeProdutos) return erro(e.message, e.status);
  if (tabelaDeProdutosAusente(e)) return erro(PRODUTOS_INATIVOS, 503);
  return respostaDeErroDoPrisma(e);
}

/** O formato do GET dos itens, usado também como resposta de toda escrita. */
export async function respostaDosItens(dealId: string) {
  return NextResponse.json({ ...(await lerItensDoNegocio(dealId)), disponivel: true });
}

type LinhaDeItem = {
  id: string;
  productId: string | null;
  name: string;
  sku: string;
  unit: string;
  recurrence: string;
  unitPriceCents: number;
  quantity: Prisma.Decimal | number | string;
  discountType: string;
  discountValue: number;
  totalCents: number;
  position: number;
};

/** Item do banco para JSON (Decimal vira número; textos desconhecidos viram o padrão). */
export function serializarItem(i: LinhaDeItem): ItemDoNegocio {
  return {
    id: i.id,
    productId: i.productId,
    name: i.name,
    sku: i.sku,
    unit: i.unit,
    recurrence: lerRecorrencia(i.recurrence) ?? "unico",
    unitPriceCents: i.unitPriceCents,
    quantity: Number(i.quantity),
    discountType: lerTipoDeDesconto(i.discountType) ?? "percentual",
    discountValue: i.discountValue,
    totalCents: i.totalCents,
    position: i.position,
  };
}

type LinhaDeProduto = {
  id: string;
  name: string;
  sku: string;
  description: string;
  priceCents: number;
  currency: string;
  unit: string;
  recurrence: string;
  category: string;
  archivedAt: Date | null;
};

export function serializarProduto(p: LinhaDeProduto): ProdutoDoCatalogo {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    description: p.description,
    priceCents: p.priceCents,
    currency: p.currency,
    unit: p.unit,
    recurrence: lerRecorrencia(p.recurrence) ?? "unico",
    category: p.category,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
  };
}

export interface ItensDoNegocio {
  itens: ItemDoNegocio[];
  valorManual: boolean;
  resumo: ResumoDosItens;
}

/** Itens do negócio, na ordem, com a escolha de valor manual e o resumo. */
export async function lerItensDoNegocio(dealId: string, db: Tx | typeof prisma = prisma): Promise<ItensDoNegocio> {
  const [linhas, ajuste] = await Promise.all([
    db.dealItem.findMany({ where: { dealId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    db.dealAmountSetting.findUnique({ where: { dealId }, select: { manualAmount: true } }),
  ]);
  const itens = linhas.map(serializarItem);
  return { itens, valorManual: !!ajuste?.manualAmount, resumo: resumoDosItens(itens) };
}

/**
 * Regra do valor: com itens e sem "valor manual", o valor do negócio é a soma
 * dos itens. Sem itens o valor fica como estava (remover o último item não
 * zera o negócio). Chamar dentro da mesma transação que mexeu nos itens.
 */
export async function recalcularValorDoNegocio(tx: Tx, dealId: string): Promise<number | null> {
  const [soma, ajuste] = await Promise.all([
    tx.dealItem.aggregate({ where: { dealId }, _sum: { totalCents: true }, _count: { _all: true } }),
    tx.dealAmountSetting.findUnique({ where: { dealId }, select: { manualAmount: true } }),
  ]);
  if (ajuste?.manualAmount || soma._count._all === 0) return null;
  const total = soma._sum.totalCents ?? 0;
  if (total > MAX_CENTAVOS) throw new ErroDeProdutos("A soma dos produtos passa do máximo de um negócio (R$ 21 milhões).");
  await tx.deal.update({ where: { id: dealId }, data: { amountCents: total } });
  return total;
}

/**
 * O valor do negócio está preso à soma dos itens? Usado pelo PATCH do negócio
 * para recusar valor digitado. Sem as tabelas no banco: não está.
 */
export async function negocioUsaSomaDosItens(dealId: string): Promise<boolean> {
  try {
    const [itens, ajuste] = await Promise.all([
      prisma.dealItem.count({ where: { dealId } }),
      prisma.dealAmountSetting.findUnique({ where: { dealId }, select: { manualAmount: true } }),
    ]);
    return itens > 0 && !ajuste?.manualAmount;
  } catch (e) {
    if (tabelaDeProdutosAusente(e)) return false;
    throw e;
  }
}

/** Nomes dos itens de cada negócio, na ordem (para o cartão). Falha = mapa vazio. */
export async function nomesDosProdutosPorNegocio(orgId: string, dealIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (dealIds.length === 0) return mapa;
  try {
    const linhas = await prisma.dealItem.findMany({
      where: { orgId, dealId: { in: dealIds } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { dealId: true, name: true },
    });
    for (const l of linhas) mapa.set(l.dealId, [...(mapa.get(l.dealId) ?? []), l.name]);
  } catch (e) {
    console.error("[produtos] nomes dos itens indisponíveis", e);
  }
  return mapa;
}

export interface CamposDoProduto {
  name?: string;
  sku?: string;
  description?: string;
  priceCents?: number;
  unit?: string;
  recurrence?: string;
  category?: string;
}

/**
 * Campos do produto vindos do corpo. `novo` exige o nome. Devolve o erro em
 * texto ou os campos já aparados (só os que vieram).
 */
export function lerCamposDoProduto(body: Record<string, unknown>, novo: boolean): { erro: string } | { campos: CamposDoProduto } {
  const campos: CamposDoProduto = {};
  if (body.name !== undefined || novo) {
    const nome = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    if (!nome) return { erro: "Nome do produto é obrigatório." };
    campos.name = nome;
  }
  for (const [chave, max] of [
    ["sku", 60],
    ["description", 2000],
    ["unit", 20],
    ["category", 80],
  ] as const) {
    const v = body[chave];
    if (v === undefined) continue;
    if (v !== null && typeof v !== "string") return { erro: "Campo inválido: " + chave + "." };
    campos[chave] = (v ?? "").trim().slice(0, max);
  }
  if (campos.unit === "") campos.unit = "un";
  if (body.price !== undefined) {
    const c = reaisParaCentavos(body.price);
    if (c === null || c === undefined) return { erro: "Preço inválido (máximo R$ 21 milhões)." };
    campos.priceCents = c;
  }
  if (body.recurrence !== undefined) {
    const r = lerRecorrencia(body.recurrence);
    if (!r) return { erro: "Recorrência inválida: use único, mensal ou anual." };
    campos.recurrence = r;
  }
  return { campos };
}

export interface CamposDoItem {
  name?: string;
  sku?: string;
  unit?: string;
  recurrence?: string;
  unitPriceCents?: number;
  quantity?: number;
  discountType?: string;
  discountValue?: number;
}

/**
 * Campos editáveis de um item vindos do corpo (só os que vieram).
 * `tipoAtual` é o tipo de desconto já gravado: mandar só `discount` usa ele.
 */
export function lerCamposDoItem(
  body: Record<string, unknown>,
  tipoAtual: string = "percentual"
): { erro: string } | { campos: CamposDoItem } {
  const campos: CamposDoItem = {};
  if (body.name !== undefined) {
    const nome = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    if (!nome) return { erro: "Nome do item é obrigatório." };
    campos.name = nome;
  }
  for (const [chave, max] of [
    ["sku", 60],
    ["unit", 20],
  ] as const) {
    const v = body[chave];
    if (v === undefined) continue;
    if (v !== null && typeof v !== "string") return { erro: "Campo inválido: " + chave + "." };
    campos[chave] = (v ?? "").trim().slice(0, max);
  }
  if (campos.unit === "") campos.unit = "un";
  if (body.recurrence !== undefined) {
    const r = lerRecorrencia(body.recurrence);
    if (!r) return { erro: "Recorrência inválida: use único, mensal ou anual." };
    campos.recurrence = r;
  }
  if (body.unitPrice !== undefined) {
    const c = reaisParaCentavos(body.unitPrice);
    if (c === null || c === undefined) return { erro: "Preço inválido (máximo R$ 21 milhões)." };
    campos.unitPriceCents = c;
  }
  const q = lerQuantidade(body.quantity);
  if (q === null) return { erro: "Quantidade inválida: use um número maior que zero." };
  if (q !== undefined) campos.quantity = q;
  if (body.discountType !== undefined) {
    const t = lerTipoDeDesconto(body.discountType);
    if (!t) return { erro: "Tipo de desconto inválido: use percentual ou valor." };
    campos.discountType = t;
  }
  if (body.discount !== undefined) {
    const tipo = (campos.discountType ?? lerTipoDeDesconto(tipoAtual) ?? "percentual") as "percentual" | "valor";
    const d = lerDesconto(tipo, body.discount);
    if (d === null) return { erro: tipo === "percentual" ? "Desconto inválido: use de 0 a 100%." : "Desconto inválido." };
    campos.discountValue = d;
  } else if (campos.discountType !== undefined && campos.discountType !== tipoAtual) {
    // Trocou % por R$ sem mandar o número: o número antigo não vale na outra unidade.
    campos.discountValue = 0;
  }
  return { campos };
}

/** Item completo (o gravado com as mudanças por cima) → total, conferindo o teto. */
export function totalConferido(i: ContaDoItem): number {
  const total = totalDoItem(i);
  if (total > MAX_CENTAVOS) throw new ErroDeProdutos("O total do item passa do máximo de um negócio (R$ 21 milhões).");
  return total;
}

/** Itens completos de vários negócios (exportação). Falha = mapa vazio. */
export async function itensPorNegocio(orgId: string, dealIds: string[]): Promise<Map<string, ItemDoNegocio[]>> {
  const mapa = new Map<string, ItemDoNegocio[]>();
  if (dealIds.length === 0) return mapa;
  try {
    const linhas = await prisma.dealItem.findMany({
      where: { orgId, dealId: { in: dealIds } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    for (const l of linhas) mapa.set(l.dealId, [...(mapa.get(l.dealId) ?? []), serializarItem(l)]);
  } catch (e) {
    console.error("[produtos] itens indisponíveis", e);
  }
  return mapa;
}
