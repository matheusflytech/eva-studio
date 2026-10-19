import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { carregarDefinicoes } from "@/lib/server/custom-fields";
import { JSON_INVALIDO, erro, lerCorpo, respostaDeErroDoPrisma } from "@/lib/server/api-validacao";
import { erroDoLayout, normalizarLayout } from "@/lib/cartao-layout";
import { chavesDosCampos, lerLayoutDoFunil, tabelaAusente } from "@/lib/server/layout-do-cartao";

// Como o cartão do negócio aparece neste funil.
//   GET → { layout, salvo, disponivel, padrao }  (sem registro ou sem tabela: o padrão)
//   PUT { campos, previa, densidade } → { layout }  (quem configura funil)

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const funil = await prisma.pipeline.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
  if (!funil) return erro("Funil não encontrado.", 404);

  const defs = await carregarDefinicoes(ctx.orgId, "deal", funil.id);
  return NextResponse.json(await lerLayoutDoFunil(funil.id, defs));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);

  const funil = await prisma.pipeline.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
  if (!funil) return erro("Funil não encontrado.", 404);

  const defs = await carregarDefinicoes(ctx.orgId, "deal", funil.id);
  const { chaves } = chavesDosCampos(defs);
  const problema = erroDoLayout(body, chaves);
  if (problema) return erro(problema);

  // Normalizado de novo: tira repetidos e qualquer chave extra do corpo.
  const layout = normalizarLayout(body, chaves);
  const json = layout as unknown as Prisma.InputJsonValue;
  try {
    await prisma.pipelineCardLayout.upsert({
      where: { pipelineId: funil.id },
      create: { orgId: ctx.orgId, pipelineId: funil.id, layout: json },
      update: { layout: json },
    });
  } catch (e) {
    if (tabelaAusente(e)) return erro("A personalização do cartão ainda não foi ativada no banco.", 503);
    return respostaDeErroDoPrisma(e);
  }
  return NextResponse.json({ layout });
}
