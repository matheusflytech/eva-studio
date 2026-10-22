import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { respostaDoErro } from "../../comum";

// Histórico de versões publicadas (a 0 é o rascunho de teste e não aparece).
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    const a = await prisma.automacao.findFirst({ where: { id, orgId: ctx.orgId }, select: { versaoPublicadaId: true } });
    if (!a) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
    const versoes = await prisma.automacaoVersao.findMany({
      where: { automacaoId: id, numero: { gt: 0 } },
      orderBy: { numero: "desc" },
      select: { id: true, numero: true, publicadaPor: true, createdAt: true, _count: { select: { execucoes: true } } },
    });
    return NextResponse.json({
      versoes: versoes.map((v) => ({
        numero: v.numero,
        publicadaPor: v.publicadaPor,
        publicadaEm: v.createdAt.toISOString(),
        execucoes: v._count.execucoes,
        atual: v.id === a.versaoPublicadaId,
      })),
    });
  } catch (e) {
    return respostaDoErro(e);
  }
}
