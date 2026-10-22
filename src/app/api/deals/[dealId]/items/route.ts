import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { MAX_ITENS_POR_NEGOCIO, resumoDosItens } from "@/lib/produtos";
import {
  ErroDeProdutos,
  falhaDeItens,
  lerCamposDoItem,
  recalcularValorDoNegocio,
  respostaDosItens,
  tabelaDeProdutosAusente,
  totalConferido,
} from "@/lib/server/produtos";

// Itens (produtos) de um negócio.
//   GET   → { itens, valorManual, resumo, disponivel }
//   POST  { productId, quantity?, unitPrice?, discountType?, discount? }   item do catálogo
//         { name, unitPrice, quantity?, recurrence?, sku?, unit?, ... }   item avulso
//   PATCH { ordem?: string[], valorManual?: boolean }
// Toda escrita recalcula o valor do negócio na mesma transação (regra em
// recalcularValorDoNegocio) e devolve o mesmo formato do GET.

type Params = { params: Promise<{ dealId: string }> };

async function negocioDaOrg(dealId: string, orgId: string) {
  return prisma.deal.findFirst({ where: { id: dealId, orgId }, select: { id: true } });
}

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const deal = await negocioDaOrg(dealId, ctx.orgId);
  if (!deal) return erro("Negócio não encontrado.", 404);
  try {
    return await respostaDosItens(deal.id);
  } catch (e) {
    if (tabelaDeProdutosAusente(e)) {
      return NextResponse.json({ itens: [], valorManual: false, resumo: resumoDosItens([]), disponivel: false });
    }
    throw e;
  }
}

export async function POST(request: Request, { params }: Params) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const deal = await negocioDaOrg(dealId, ctx.orgId);
  if (!deal) return erro("Negócio não encontrado.", 404);

  const lido = lerCamposDoItem(body, typeof body.discountType === "string" ? body.discountType : "percentual");
  if ("erro" in lido) return erro(lido.erro);
  const c = lido.campos;

  try {
    // Base: o produto do catálogo (congelado agora) ou o que veio no corpo.
    let base: { productId: string | null; name: string; sku: string; unit: string; recurrence: string; unitPriceCents: number };
    if (body.productId !== undefined && body.productId !== null && body.productId !== "") {
      if (typeof body.productId !== "string") return erro("Produto inválido.");
      const produto = await prisma.product.findFirst({
        where: { id: body.productId, orgId: ctx.orgId, archivedAt: null },
        select: { id: true, name: true, sku: true, unit: true, recurrence: true, priceCents: true },
      });
      if (!produto) return erro("Produto não encontrado (ou arquivado).", 404);
      base = {
        productId: produto.id,
        name: produto.name,
        sku: produto.sku,
        unit: produto.unit,
        recurrence: produto.recurrence,
        unitPriceCents: produto.priceCents,
      };
    } else {
      if (!c.name) return erro("Escolha um produto do catálogo ou dê um nome ao item avulso.");
      base = { productId: null, name: c.name, sku: "", unit: "un", recurrence: "unico", unitPriceCents: 0 };
    }

    const item = {
      orgId: ctx.orgId,
      dealId: deal.id,
      productId: base.productId,
      name: c.name ?? base.name,
      sku: c.sku ?? base.sku,
      unit: c.unit ?? base.unit,
      recurrence: c.recurrence ?? base.recurrence,
      unitPriceCents: c.unitPriceCents ?? base.unitPriceCents,
      quantity: c.quantity ?? 1,
      discountType: c.discountType ?? "percentual",
      discountValue: c.discountValue ?? 0,
    };
    const totalCents = totalConferido(item);

    await prisma.$transaction(async (tx) => {
      const agora = await tx.dealItem.aggregate({ where: { dealId: deal.id }, _count: { _all: true }, _max: { position: true } });
      if (agora._count._all >= MAX_ITENS_POR_NEGOCIO) {
        throw new ErroDeProdutos(`Um negócio aceita no máximo ${MAX_ITENS_POR_NEGOCIO} itens.`);
      }
      await tx.dealItem.create({ data: { ...item, totalCents, position: (agora._max.position ?? -1) + 1 } });
      await recalcularValorDoNegocio(tx, deal.id);
    });
    return await respostaDosItens(deal.id);
  } catch (e) {
    return falhaDeItens(e);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const deal = await negocioDaOrg(dealId, ctx.orgId);
  if (!deal) return erro("Negócio não encontrado.", 404);

  const ordem = body.ordem;
  if (ordem !== undefined && (!Array.isArray(ordem) || ordem.some((x) => typeof x !== "string") || ordem.length > MAX_ITENS_POR_NEGOCIO)) {
    return erro("Ordem inválida: envie a lista de ids dos itens.");
  }
  if (body.valorManual !== undefined && typeof body.valorManual !== "boolean") return erro("valorManual deve ser verdadeiro ou falso.");
  if (ordem === undefined && body.valorManual === undefined) return erro("Nada para mudar: envie ordem ou valorManual.");

  try {
    await prisma.$transaction(async (tx) => {
      if (Array.isArray(ordem)) {
        const atuais = await tx.dealItem.findMany({ where: { dealId: deal.id }, select: { id: true } });
        const ids = new Set(atuais.map((i) => i.id));
        // A lista tem de ser exatamente os itens do negócio: id de outro negócio
        // (ou de outra org) não entra, e faltar item deixaria posições repetidas.
        if (new Set(ordem).size !== ordem.length || ordem.length !== ids.size || !ordem.every((id) => ids.has(id as string))) {
          throw new ErroDeProdutos("Ordem inválida: a lista precisa ter todos os itens deste negócio, uma vez cada.");
        }
        for (const [i, id] of (ordem as string[]).entries()) {
          await tx.dealItem.update({ where: { id }, data: { position: i } });
        }
      }
      if (typeof body.valorManual === "boolean") {
        await tx.dealAmountSetting.upsert({
          where: { dealId: deal.id },
          create: { dealId: deal.id, orgId: ctx.orgId, manualAmount: body.valorManual },
          update: { manualAmount: body.valorManual },
        });
        // Voltou para a soma dos produtos: aplica na hora.
        if (!body.valorManual) await recalcularValorDoNegocio(tx, deal.id);
      }
    });
    return await respostaDosItens(deal.id);
  } catch (e) {
    return falhaDeItens(e);
  }
}
