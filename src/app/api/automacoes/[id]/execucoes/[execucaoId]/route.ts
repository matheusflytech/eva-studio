import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { respostaDoErro } from "../../../comum";

// Uma execução com todos os passos (entrada, saída, erro, ms) e a definição da
// versão em que rodou, para o canvas mostrar o caminho percorrido.
export async function GET(_r: Request, { params }: { params: Promise<{ id: string; execucaoId: string }> }) {
  const ctx = await requirePermission("automacoes:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, execucaoId } = await params;
  try {
    const e = await prisma.automacaoExecucao.findFirst({
      where: { id: execucaoId, automacaoId: id, orgId: ctx.orgId },
      include: { passos: { orderBy: { iniciadoEm: "asc" } }, versao: { select: { numero: true, definicao: true } } },
    });
    if (!e) return NextResponse.json({ error: "Execução não encontrada." }, { status: 404 });
    return NextResponse.json({
      execucao: {
        id: e.id,
        objeto: e.objeto,
        objetoId: e.objetoId,
        status: e.status,
        erro: e.erro,
        teste: e.teste,
        noAtual: e.noAtual,
        proximaEm: e.proximaEm?.toISOString() ?? null,
        iniciadaEm: e.iniciadaEm?.toISOString() ?? null,
        terminadaEm: e.terminadaEm?.toISOString() ?? null,
        duracaoMs: e.duracaoMs,
        gatilho: e.gatilho,
        createdAt: e.createdAt.toISOString(),
        versao: e.versao.numero,
        definicao: e.versao.definicao,
        passos: e.passos.map((p) => ({
          id: p.id,
          noId: p.noId,
          tipo: p.tipo,
          rotulo: p.rotulo,
          status: p.status,
          tentativa: p.tentativa,
          entrada: p.entrada,
          saida: p.saida,
          erro: p.erro,
          caminho: p.caminho,
          iniciadoEm: p.iniciadoEm.toISOString(),
          ms: p.ms,
        })),
      },
    });
  } catch (err) {
    return respostaDoErro(err);
  }
}
