import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { respostaDoErro } from "../../comum";

const STATUS = new Set(["pendente", "rodando", "esperando", "concluida", "falhou", "cancelada", "objetivo", "pausada"]);

// Execuções de uma automação (as 100 mais recentes; filtro por status e teste).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  try {
    const execucoes = await prisma.automacaoExecucao.findMany({
      where: { automacaoId: id, orgId: ctx.orgId, ...(status && STATUS.has(status) ? { status } : {}), ...(sp.get("teste") === "1" ? { teste: true } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        objeto: true,
        objetoId: true,
        status: true,
        erro: true,
        teste: true,
        noAtual: true,
        proximaEm: true,
        iniciadaEm: true,
        terminadaEm: true,
        duracaoMs: true,
        createdAt: true,
        versao: { select: { numero: true } },
        _count: { select: { passos: true } },
      },
    });
    return NextResponse.json({
      execucoes: execucoes.map((e) => ({ ...e, versao: e.versao.numero, passos: e._count.passos, _count: undefined })),
    });
  } catch (e) {
    return respostaDoErro(e);
  }
}
