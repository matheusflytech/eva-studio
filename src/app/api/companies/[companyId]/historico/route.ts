import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { listarHistorico } from "@/lib/server/historico";
import { itensDoHistorico } from "@/lib/server/historico-leitura";

// Histórico da empresa (bloco "Histórico" da ficha): quem criou e alterou o
// quê. Primeira página com 10, "Ver mais" traz 20 por vez (?cursor=).
export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { companyId } = await params;
  const empresa = await prisma.company.findFirst({ where: { id: companyId, orgId: ctx.orgId }, select: { id: true } });
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const cursor = new URL(request.url).searchParams.get("cursor");
  const pagina = await listarHistorico(ctx.orgId, {
    objeto: "company",
    objetoId: companyId,
    acoes: ["criou", "alterou", "restaurou"],
    cursor,
    limite: cursor ? 20 : 10,
  });
  const itens = await itensDoHistorico(ctx.orgId, pagina.linhas);
  return NextResponse.json({ disponivel: pagina.disponivel, itens, proximo: pagina.proximo });
}
