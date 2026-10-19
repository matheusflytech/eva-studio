import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { falhaDeItens, lerCamposDoItem, recalcularValorDoNegocio, respostaDosItens, totalConferido } from "@/lib/server/produtos";

// Um item do negócio.
//   PATCH { quantity?, unitPrice?, discountType?, discount?, name?, sku?, unit?, recurrence? }
//   DELETE
// As duas recalculam o valor do negócio e devolvem a lista inteira (formato do GET).

type Params = { params: Promise<{ dealId: string; itemId: string }> };

/** O item, se for deste negócio E desta organização. */
async function itemDaOrg(dealId: string, itemId: string, orgId: string) {
  return prisma.dealItem.findFirst({ where: { id: itemId, dealId, orgId, deal: { orgId } } });
}

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId, itemId } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);

  try {
    const atual = await itemDaOrg(dealId, itemId, ctx.orgId);
    if (!atual) return erro("Item não encontrado neste negócio.", 404);

    const lido = lerCamposDoItem(body, atual.discountType);
    if ("erro" in lido) return erro(lido.erro);
    const c = lido.campos;
    if (Object.keys(c).length === 0) return erro("Nada para mudar.");

    const totalCents = totalConferido({
      unitPriceCents: c.unitPriceCents ?? atual.unitPriceCents,
      quantity: c.quantity ?? Number(atual.quantity),
      discountType: c.discountType ?? atual.discountType,
      discountValue: c.discountValue ?? atual.discountValue,
    });

    await prisma.$transaction(async (tx) => {
      await tx.dealItem.update({ where: { id: atual.id }, data: { ...c, totalCents } });
      await recalcularValorDoNegocio(tx, atual.dealId);
    });
    return await respostaDosItens(atual.dealId);
  } catch (e) {
    return falhaDeItens(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId, itemId } = await params;

  try {
    const atual = await itemDaOrg(dealId, itemId, ctx.orgId);
    if (!atual) return erro("Item não encontrado neste negócio.", 404);
    await prisma.$transaction(async (tx) => {
      await tx.dealItem.delete({ where: { id: atual.id } });
      await recalcularValorDoNegocio(tx, atual.dealId);
    });
    return await respostaDosItens(atual.dealId);
  } catch (e) {
    return falhaDeItens(e);
  }
}
