import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { carregarDefinicoes } from "@/lib/server/custom-fields";
import { JSON_INVALIDO, erro, lerCorpo, respostaDeErroDoPrisma } from "@/lib/server/api-validacao";
import { erroDoLayout, normalizarLayout } from "@/lib/cartao-layout";
import { chavesDosCampos, lerLayoutDoFunil, tabelaAusente } from "@/lib/server/layout-do-cartao";

// O cartão e o painel como ESTA pessoa escolheu ver neste funil (quadro v4).
//   GET    → { layout, proprio, disponivel, doFunil }
//   PUT    { campos, previa, densidade, acoes, secoes } → { layout }
//   DELETE → volta ao layout do funil
// Cada pessoa só lê e grava o seu (userId da sessão, nunca do corpo).

const SEM_TABELA = "A personalização do cartão por pessoa ainda não foi ativada no banco.";

async function funilDaOrg(orgId: string, id: string) {
  return prisma.pipeline.findFirst({ where: { id, orgId }, select: { id: true } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const funil = await funilDaOrg(ctx.orgId, id);
  if (!funil) return erro("Funil não encontrado.", 404);
  const defs = await carregarDefinicoes(ctx.orgId, "deal", funil.id);
  const l = await lerLayoutDoFunil(funil.id, defs, ctx.userId);
  return NextResponse.json({ layout: l.layout, proprio: l.proprio, disponivel: l.disponivelPessoal, doFunil: l.doFunil });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const funil = await funilDaOrg(ctx.orgId, id);
  if (!funil) return erro("Funil não encontrado.", 404);

  const defs = await carregarDefinicoes(ctx.orgId, "deal", funil.id);
  const { chaves } = chavesDosCampos(defs);
  const problema = erroDoLayout(body, chaves);
  if (problema) return erro(problema);
  const layout = normalizarLayout(body, chaves);
  const json = layout as unknown as Prisma.InputJsonValue;
  try {
    await prisma.userCardLayout.upsert({
      where: { userId_pipelineId: { userId: ctx.userId, pipelineId: funil.id } },
      create: { orgId: ctx.orgId, userId: ctx.userId, pipelineId: funil.id, layout: json },
      update: { layout: json },
    });
  } catch (e) {
    if (tabelaAusente(e) || /eva_studio_user_card_layouts/.test(String((e as Error)?.message))) return erro(SEM_TABELA, 503);
    return respostaDeErroDoPrisma(e);
  }
  return NextResponse.json({ layout });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const funil = await funilDaOrg(ctx.orgId, id);
  if (!funil) return erro("Funil não encontrado.", 404);
  try {
    await prisma.userCardLayout.deleteMany({ where: { userId: ctx.userId, pipelineId: funil.id } });
  } catch (e) {
    if (tabelaAusente(e) || /eva_studio_user_card_layouts/.test(String((e as Error)?.message))) return erro(SEM_TABELA, 503);
    return respostaDeErroDoPrisma(e);
  }
  return NextResponse.json({ ok: true });
}
