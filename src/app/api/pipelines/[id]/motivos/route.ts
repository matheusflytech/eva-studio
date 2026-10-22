import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo, respostaDeErroDoPrisma } from "@/lib/server/api-validacao";
import { tabelaAusente } from "@/lib/server/layout-do-cartao";
import { lerMotivos } from "@/lib/server/regras-de-etapa";
import { lerMotivosDoCorpo } from "@/lib/regras-de-etapa";

// Motivos de perda do funil (lista ordenável).
//   PUT { motivos: [{ id?, rotulo, exigeNota }] } → { motivos }
// A lista enviada é a lista inteira, na ordem: motivo que sumiu é arquivado
// (perdas antigas continuam com o rótulo); renomear atualiza as perdas que
// apontam para ele, para relatório e dashboard continuarem agrupando junto.

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const r = lerMotivosDoCorpo(body.motivos);
  if (!r.ok) return erro(r.erro);

  const funil = await prisma.pipeline.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
  if (!funil) return erro("Funil não encontrado.", 404);

  try {
    await prisma.$transaction(async (tx) => {
      const atuais = await tx.pipelineLostReason.findMany({ where: { pipelineId: funil.id, archivedAt: null }, select: { id: true, label: true } });
      const porId = new Map(atuais.map((m) => [m.id, m]));
      const mantidos = new Set<string>();
      for (const [position, m] of r.motivos.entries()) {
        const existente = m.id ? porId.get(m.id) : undefined;
        if (!existente) {
          await tx.pipelineLostReason.create({ data: { orgId: ctx.orgId, pipelineId: funil.id, label: m.rotulo, requiresNote: m.exigeNota, position } });
          continue;
        }
        mantidos.add(existente.id);
        await tx.pipelineLostReason.update({ where: { id: existente.id }, data: { label: m.rotulo, requiresNote: m.exigeNota, position } });
        if (existente.label !== m.rotulo) {
          await tx.dealLoss.updateMany({ where: { reasonId: existente.id }, data: { reasonLabel: m.rotulo } });
          await tx.deal.updateMany({ where: { orgId: ctx.orgId, loss: { is: { reasonId: existente.id } } }, data: { lostReason: m.rotulo } });
        }
      }
      const sairam = atuais.filter((m) => !mantidos.has(m.id)).map((m) => m.id);
      if (sairam.length) await tx.pipelineLostReason.updateMany({ where: { id: { in: sairam } }, data: { archivedAt: new Date() } });
    });
  } catch (e) {
    if (tabelaAusente(e)) return erro("Os motivos de perda ainda não foram ativados no banco (SQL 2026-10-20-regras-de-etapa.sql).", 503);
    return respostaDeErroDoPrisma(e);
  }
  const { motivos } = await lerMotivos(funil.id);
  return NextResponse.json({ motivos });
}
