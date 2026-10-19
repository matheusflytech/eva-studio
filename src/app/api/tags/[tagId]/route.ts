import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { erro, JSON_INVALIDO, lerCorpo, respostaDeErroDoPrisma } from "@/lib/server/api-validacao";

export async function PATCH(request: Request, { params }: { params: Promise<{ tagId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { tagId } = await params;

  const tag = await prisma.tag.findFirst({ where: { id: tagId, orgId: ctx.orgId } });
  if (!tag) return NextResponse.json({ error: "Etiqueta não encontrada." }, { status: 404 });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : tag.name;

  if (name !== tag.name) {
    const outra = await prisma.tag.findUnique({ where: { orgId_name: { orgId: ctx.orgId, name } } });
    if (outra && outra.id !== tag.id) return erro("Já existe uma etiqueta com esse nome.", 409);
  }

  try {
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: {
        name,
        color: typeof body.color === "string" ? body.color : tag.color,
      },
    });
    return NextResponse.json({ tag: { id: updated.id, name: updated.name, color: updated.color } });
  } catch (e) {
    return respostaDeErroDoPrisma(e);
  }
}

// Apagar etiqueta solta os contatos dela (cascade na tabela de junção) e zera
// o gatilho das sequências que a usavam (`onDelete: SetNull` em
// Sequence.triggerTagId). A régua continua existindo, só para de receber
// gente sozinha, o que é melhor do que sumir com ela inteira.
export async function DELETE(_request: Request, { params }: { params: Promise<{ tagId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { tagId } = await params;

  const tag = await prisma.tag.findFirst({ where: { id: tagId, orgId: ctx.orgId } });
  if (!tag) return NextResponse.json({ error: "Etiqueta não encontrada." }, { status: 404 });

  await prisma.tag.delete({ where: { id: tag.id } });
  return NextResponse.json({ ok: true });
}
