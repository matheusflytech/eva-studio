import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { coletarFunil } from "@/lib/server/funil-dados";

const DIA = 86_400_000;

// Conversão etapa a etapa de um funil, para a faixa no topo da aba Negócios.
// Mais leve que /api/analytics/fontes: só o funil, sem o resto do dashboard.
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const pipelineId = url.searchParams.get("pipeline")?.trim() || undefined;
  const dias = Math.min(Math.max(Number(url.searchParams.get("dias")) || 90, 7), 365);
  const agora = new Date();

  const dados = await coletarFunil(ctx.orgId, new Date(agora.getTime() - dias * DIA), agora, pipelineId);
  return NextResponse.json({ dias, conversao: dados.funis.funilConversao, cicloDeVenda: dados.numeros.cicloDeVenda });
}
