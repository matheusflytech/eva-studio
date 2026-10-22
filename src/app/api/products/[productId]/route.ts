import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo, respostaDeErroDoPrisma } from "@/lib/server/api-validacao";
import { PRODUTOS_INATIVOS, lerCamposDoProduto, serializarProduto, tabelaDeProdutosAusente } from "@/lib/server/produtos";

// Um produto do catálogo.
//   GET                    → { produto }
//   PATCH { ...campos, archived?: boolean } → { produto }
//   DELETE                 → { ok }  (itens de negócio ficam, com nome e preço congelados)

type Params = { params: Promise<{ productId: string }> };

function falha(e: unknown) {
  if (tabelaDeProdutosAusente(e)) return erro(PRODUTOS_INATIVOS, 503);
  return respostaDeErroDoPrisma(e);
}

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { productId } = await params;
  try {
    const produto = await prisma.product.findFirst({ where: { id: productId, orgId: ctx.orgId } });
    if (!produto) return erro("Produto não encontrado.", 404);
    return NextResponse.json({ produto: serializarProduto(produto) });
  } catch (e) {
    return falha(e);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requirePermission("produtos:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { productId } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const lido = lerCamposDoProduto(body, false);
  if ("erro" in lido) return erro(lido.erro);

  const data: Prisma.ProductUpdateInput = { ...lido.campos };
  if (body.archived === true) data.archivedAt = new Date();
  if (body.archived === false) data.archivedAt = null;

  try {
    const atual = await prisma.product.findFirst({ where: { id: productId, orgId: ctx.orgId }, select: { id: true } });
    if (!atual) return erro("Produto não encontrado.", 404);
    const produto = await prisma.product.update({ where: { id: atual.id }, data });
    return NextResponse.json({ produto: serializarProduto(produto) });
  } catch (e) {
    return falha(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("produtos:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { productId } = await params;
  try {
    const atual = await prisma.product.findFirst({ where: { id: productId, orgId: ctx.orgId }, select: { id: true } });
    if (!atual) return erro("Produto não encontrado.", 404);
    await prisma.product.delete({ where: { id: atual.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}
