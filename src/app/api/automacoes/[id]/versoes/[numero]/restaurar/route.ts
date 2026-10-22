import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { respostaDoErro } from "../../../../comum";

// Volta o rascunho para uma versão publicada (para valer, é só publicar de novo).
export async function POST(_r: Request, { params }: { params: Promise<{ id: string; numero: string }> }) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, numero } = await params;
  try {
    const a = await prisma.automacao.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
    if (!a) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
    const v = await prisma.automacaoVersao.findFirst({ where: { automacaoId: id, numero: Number(numero) || -1 } });
    if (!v || v.numero <= 0) return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
    await prisma.automacao.update({ where: { id }, data: { rascunho: v.definicao as object } });
    return NextResponse.json({ ok: true, rascunho: v.definicao });
  } catch (e) {
    return respostaDoErro(e);
  }
}
