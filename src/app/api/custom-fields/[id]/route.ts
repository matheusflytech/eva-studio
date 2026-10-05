import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { prepararOpcoes, serializarDefinicao } from "@/lib/server/custom-fields";
import { TIPO_POR_ID, type TipoDeCampo } from "@/lib/custom-fields";

// Edita ou apaga um campo. A chave e o tipo nunca mudam: os valores já gravados
// nos negócios e contatos estão guardados por chave, no formato do tipo.

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const campo = await prisma.customField.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!campo) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Prisma.CustomFieldUpdateInput = {};

  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 60);
    if (!label) return NextResponse.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
    data.label = label;
  }
  if (body.required !== undefined) data.required = body.required === true;
  if (body.helpText !== undefined) data.helpText = String(body.helpText).slice(0, 200);
  if (body.showOnCard !== undefined) data.showOnCard = campo.entity === "deal" && body.showOnCard === true;

  if (body.options !== undefined) {
    const info = TIPO_POR_ID.get(campo.type as TipoDeCampo);
    if (!info?.comOpcoes) return NextResponse.json({ error: "Este tipo de campo não tem opções." }, { status: 400 });
    const opcoes = prepararOpcoes(body.options);
    if (opcoes.length === 0) return NextResponse.json({ error: "Deixe pelo menos uma opção." }, { status: 400 });
    data.options = opcoes as unknown as Prisma.InputJsonValue;
  }

  if (body.pipelineId !== undefined && campo.entity === "deal") {
    if (!body.pipelineId) {
      data.pipeline = { disconnect: true };
    } else {
      const funil = await prisma.pipeline.findFirst({ where: { id: String(body.pipelineId), orgId: ctx.orgId } });
      if (!funil) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });
      data.pipeline = { connect: { id: funil.id } };
    }
  }

  const atualizado = await prisma.customField.update({ where: { id }, data });
  return NextResponse.json({ field: serializarDefinicao(atualizado) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const campo = await prisma.customField.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!campo) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });

  // ?limpar=1 também apaga os valores já gravados. Sem isso o valor fica no
  // JSON, invisível, e volta se alguém recriar um campo com a mesma chave.
  const limpar = new URL(request.url).searchParams.get("limpar") === "1";
  let apagados = 0;
  if (limpar) {
    const tabela = campo.entity === "contact" ? Prisma.raw("eva_studio_contacts") : Prisma.raw("eva_studio_deals");
    apagados = await prisma.$executeRaw`
      UPDATE ${tabela}
      SET "customFields" = "customFields" - ${campo.key}
      WHERE "orgId" = ${ctx.orgId} AND "customFields" ? ${campo.key}`;
  }

  await prisma.customField.delete({ where: { id } });
  return NextResponse.json({ ok: true, apagados });
}
