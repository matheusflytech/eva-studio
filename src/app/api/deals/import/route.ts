import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { erro, JSON_INVALIDO, lerCorpo } from "@/lib/server/api-validacao";
import { carregarDefinicoes } from "@/lib/server/custom-fields";
import { linhasDoCsv, processarLinha } from "@/lib/server/api-v1/linhas";
import { paraErroApi } from "@/lib/server/api-v1/http";

/** Linhas por importação pela tela (síncrona). Mais que isso: API v1 em lote. */
const MAX_LINHAS = 1000;
const MAX_ERROS = 20;

// POST /api/deals/import { csv, pipelineId, stageId? } — importação de
// negócios pela tela. Reaproveita a importação em lote da API v1 (mesmo
// dicionário de colunas: nome/valor/etapa_id/previsao/contato_email/
// contato_telefone..., coluna desconhecida = campo personalizado; contato
// achado por id externo, e-mail ou telefone, e criado se não existir).
// Sem pipeline_id/stage_id na linha, entra no funil (e etapa) escolhido na tela.
// Resposta: { created, updated, unchanged, failed, errors: [{ row, message }] }.
export async function POST(request: Request) {
  const ctx = await requirePermission("negocios:criar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const corpo = await lerCorpo(request);
  if (!corpo) return erro(JSON_INVALIDO);
  const csv = typeof corpo.csv === "string" ? corpo.csv : "";
  if (!csv.trim()) return erro("Envie o arquivo CSV.");
  const pipelineId = typeof corpo.pipelineId === "string" ? corpo.pipelineId.trim() : "";
  const stageId = typeof corpo.stageId === "string" && corpo.stageId.trim() ? corpo.stageId.trim() : undefined;

  const funil = pipelineId
    ? await prisma.pipeline.findFirst({ where: { id: pipelineId, orgId: ctx.orgId }, select: { id: true, stages: { select: { id: true } } } })
    : null;
  if (!funil) return erro("Funil não encontrado.", 404);
  if (stageId && !funil.stages.some((s) => s.id === stageId)) return erro("Etapa não é deste funil.");

  let linhas;
  try {
    linhas = linhasDoCsv("deals", csv, await carregarDefinicoes(ctx.orgId, "deal", funil.id));
  } catch (e) {
    return erro(paraErroApi(e).message);
  }
  if (linhas.length > MAX_LINHAS) {
    return erro(`O arquivo tem ${linhas.length} linhas; pela tela o limite é ${MAX_LINHAS}. Divida o arquivo ou use a importação em lote da API.`);
  }

  const cont = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  const errors: { row: number; message: string }[] = [];
  // Uma linha por vez: cada uma é o mesmo upsert da API (com contato).
  for (const linha of linhas) {
    try {
      const r = await processarLinha(ctx.orgId, "deals", linha, { modo: "upsert", simular: false, pipelineId: funil.id, stageId });
      cont[r.result] += 1;
    } catch (e) {
      cont.failed += 1;
      if (errors.length < MAX_ERROS) errors.push({ row: linha.row, message: paraErroApi(e).message });
    }
  }
  return NextResponse.json({ ...cont, errors });
}
