import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

const VALID_STAGES = ["novo", "contatado", "qualificado", "ganho", "perdido"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({ where: { id, channel: "website", agent: { orgId } } });
  if (!conversation) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const { leadStage } = await request.json();
  if (!VALID_STAGES.includes(leadStage)) {
    return NextResponse.json({ error: "leadStage inválido." }, { status: 400 });
  }

  await prisma.conversation.update({ where: { id }, data: { leadStage } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({ where: { id, channel: "website", agent: { orgId } } });
  if (!conversation) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
