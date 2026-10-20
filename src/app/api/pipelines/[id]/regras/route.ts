import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { carregarDefinicoes } from "@/lib/server/custom-fields";
import { JSON_INVALIDO, erro, lerCorpo, respostaDeErroDoPrisma } from "@/lib/server/api-validacao";
import { tabelaAusente } from "@/lib/server/layout-do-cartao";
import { lerMotivos, lerRegras } from "@/lib/server/regras-de-etapa";
import { lerRegraDoCorpo } from "@/lib/regras-de-etapa";

// Regras por etapa do funil (Personalizar o CRM → Funis e etapas).
//   GET → { disponivel, regras: { [stageId]: RegraDaEtapa }, motivos, motivosSalvos }
//         (sem registro ou sem tabela: o padrão — nada obrigatório, 7 dias, motivos padrão)
//   PUT { stageId, camposObrigatorios, podeSerPulada, diasParado, orientacao } → { regra }

const SEM_TABELA = "As regras de etapa ainda não foram ativadas no banco (SQL 2026-10-20-regras-de-etapa.sql).";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const funil = await prisma.pipeline.findFirst({
    where: { id, orgId: ctx.orgId },
    select: { id: true, stages: { select: { id: true, type: true } } },
  });
  if (!funil) return erro("Funil não encontrado.", 404);

  const [{ regras, disponivel }, motivos] = await Promise.all([lerRegras(funil.stages), lerMotivos(funil.id)]);
  return NextResponse.json({
    disponivel: disponivel && motivos.disponivel,
    regras: Object.fromEntries(regras),
    motivos: motivos.motivos,
    motivosSalvos: motivos.salvos,
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const stageId = typeof body.stageId === "string" ? body.stageId : "";

  const etapa = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId: id, pipeline: { orgId: ctx.orgId } },
    select: { id: true, type: true, pipelineId: true },
  });
  if (!etapa) return erro("Etapa não encontrada neste funil.", 404);

  const defs = await carregarDefinicoes(ctx.orgId, "deal", etapa.pipelineId);
  const r = lerRegraDoCorpo(body, etapa.type, defs.map((d) => d.key));
  if (!r.ok) return erro(r.erro);

  const dados = {
    requiredFields: r.regra.camposObrigatorios,
    canBeSkipped: r.regra.podeSerPulada,
    rottingDays: r.regra.diasParado,
    guidance: r.regra.orientacao,
  };
  try {
    await prisma.pipelineStageRule.upsert({
      where: { stageId: etapa.id },
      create: { stageId: etapa.id, orgId: ctx.orgId, pipelineId: etapa.pipelineId, ...dados },
      update: dados,
    });
  } catch (e) {
    if (tabelaAusente(e)) return erro(SEM_TABELA, 503);
    return respostaDeErroDoPrisma(e);
  }
  return NextResponse.json({ regra: r.regra });
}
