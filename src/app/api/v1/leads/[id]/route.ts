import { NextResponse } from "next/server";
import { requireApiKeyOrgId } from "@/lib/server/api-keys";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { prisma } from "@/lib/db/prisma";

const VALID_STAGES = ["novo", "contatado", "qualificado", "ganho", "perdido"];

function serializeLead(c: {
  id: string; agentId: string; contactId: string; variables: unknown; leadStage: string | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: c.id,
    agentId: c.agentId,
    contactId: c.contactId,
    stage: c.leadStage ?? "novo",
    fields: c.variables,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireApiKeyOrgId(request);
  if (!orgId) return NextResponse.json({ error: "Chave de API inválida ou ausente." }, { status: 401 });

  const rate = await checkRateLimit(`apikey:${orgId}`, 120, 60);
  if (!rate.allowed) return NextResponse.json({ error: "Limite de requisições excedido. Tente de novo em instantes." }, { status: 429 });

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({ where: { id, channel: "website", agent: { orgId } } });
  if (!conversation) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  return NextResponse.json({ data: serializeLead(conversation) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireApiKeyOrgId(request);
  if (!orgId) return NextResponse.json({ error: "Chave de API inválida ou ausente." }, { status: 401 });

  const rate = await checkRateLimit(`apikey:${orgId}`, 120, 60);
  if (!rate.allowed) return NextResponse.json({ error: "Limite de requisições excedido. Tente de novo em instantes." }, { status: 429 });

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({ where: { id, channel: "website", agent: { orgId } } });
  if (!conversation) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const { stage, fields } = await request.json();
  if (stage && !VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: `stage precisa ser um de: ${VALID_STAGES.join(", ")}.` }, { status: 400 });
  }
  if (fields !== undefined && typeof fields !== "object") {
    return NextResponse.json({ error: "fields precisa ser um objeto." }, { status: 400 });
  }

  const updated = await prisma.conversation.update({
    where: { id },
    data: {
      ...(stage ? { leadStage: stage } : {}),
      ...(fields !== undefined ? { variables: { ...(conversation.variables as object), ...fields } } : {}),
    },
  });

  return NextResponse.json({ data: serializeLead(updated) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireApiKeyOrgId(request);
  if (!orgId) return NextResponse.json({ error: "Chave de API inválida ou ausente." }, { status: 401 });

  const rate = await checkRateLimit(`apikey:${orgId}`, 120, 60);
  if (!rate.allowed) return NextResponse.json({ error: "Limite de requisições excedido. Tente de novo em instantes." }, { status: 429 });

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({ where: { id, channel: "website", agent: { orgId } } });
  if (!conversation) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ data: { deleted: true } });
}
