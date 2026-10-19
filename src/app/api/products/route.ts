import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo, respostaDeErroDoPrisma } from "@/lib/server/api-validacao";
import { MAX_PRODUTOS_POR_ORG } from "@/lib/produtos";
import { PRODUTOS_INATIVOS, lerCamposDoProduto, serializarProduto, tabelaDeProdutosAusente } from "@/lib/server/produtos";

// Catálogo de produtos da organização.
//   GET ?busca=&arquivados=1&limite=  → { produtos, disponivel }
//   POST { name, price, sku, description, unit, recurrence, category } → { produto }
// Ver e buscar: qualquer um (a ficha busca daqui para adicionar item).
// Criar e editar o catálogo: quem configura o CRM ("agents:manage").

export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const busca = url.searchParams.get("busca")?.trim().slice(0, 80) ?? "";
  const comArquivados = url.searchParams.get("arquivados") === "1";
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 200, 1), 200);

  const where: Prisma.ProductWhereInput = {
    orgId: ctx.orgId,
    ...(comArquivados ? {} : { archivedAt: null }),
    ...(busca
      ? {
          OR: [
            { name: { contains: busca, mode: "insensitive" } },
            { sku: { contains: busca, mode: "insensitive" } },
            { category: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  try {
    const linhas = await prisma.product.findMany({
      where,
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
      take: limite,
    });
    return NextResponse.json({ produtos: linhas.map(serializarProduto), disponivel: true });
  } catch (e) {
    if (tabelaDeProdutosAusente(e)) return NextResponse.json({ produtos: [], disponivel: false });
    throw e;
  }
}

export async function POST(request: Request) {
  const ctx = await requirePermission("produtos:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const lido = lerCamposDoProduto(body, true);
  if ("erro" in lido) return erro(lido.erro);

  try {
    const total = await prisma.product.count({ where: { orgId: ctx.orgId } });
    if (total >= MAX_PRODUTOS_POR_ORG) {
      return erro(`O catálogo chegou ao limite de ${MAX_PRODUTOS_POR_ORG.toLocaleString("pt-BR")} produtos. Arquive ou apague algum.`);
    }
    const produto = await prisma.product.create({
      data: { ...lido.campos, name: lido.campos.name!, orgId: ctx.orgId },
    });
    return NextResponse.json({ produto: serializarProduto(produto) });
  } catch (e) {
    if (tabelaDeProdutosAusente(e)) return erro(PRODUTOS_INATIVOS, 503);
    return respostaDeErroDoPrisma(e);
  }
}
