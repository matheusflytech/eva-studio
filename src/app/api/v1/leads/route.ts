import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiKeyOrgId } from "@/lib/server/api-keys";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { prisma } from "@/lib/db/prisma";

// API pública de Leads — /api/v1/leads. Autenticada por "Authorization: Bearer
// evs_live_...", uma chave por org (ver Integrações → API). Mesmo dado que a
// tela de Leads mostra (Conversation onde channel="website"), só que pra
// consumo por fora — igual a API de Contacts do HubSpot/Salesforce.

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

export async function GET(request: Request) {
  const orgId = await requireApiKeyOrgId(request);
  if (!orgId) return NextResponse.json({ error: "Chave de API inválida ou ausente." }, { status: 401 });

  const rate = await checkRateLimit(`apikey:${orgId}`, 120, 60);
  if (!rate.allowed) return NextResponse.json({ error: "Limite de requisições excedido. Tente de novo em instantes." }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const stage = searchParams.get("stage");

  const rows = await prisma.conversation.findMany({
    where: { channel: "website", agent: { orgId }, ...(stage ? { leadStage: stage } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ data: rows.map(serializeLead) });
}

export async function POST(request: Request) {
  const orgId = await requireApiKeyOrgId(request);
  if (!orgId) return NextResponse.json({ error: "Chave de API inválida ou ausente." }, { status: 401 });

  const rate = await checkRateLimit(`apikey:${orgId}`, 120, 60);
  if (!rate.allowed) return NextResponse.json({ error: "Limite de requisições excedido. Tente de novo em instantes." }, { status: 429 });

  const { agentId, contactId, fields, stage } = await request.json();
  if (!agentId || !fields || typeof fields !== "object") {
    return NextResponse.json({ error: "agentId e fields são obrigatórios." }, { status: 400 });
  }
  if (stage && !VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: `stage precisa ser um de: ${VALID_STAGES.join(", ")}.` }, { status: 400 });
  }

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "agentId não encontrado nessa organização." }, { status: 404 });

  const conversation = await prisma.conversation.create({
    data: {
      agentId,
      channel: "website",
      contactId: contactId?.trim() || `api_${randomUUID().slice(0, 12)}`,
      variables: fields,
      leadStage: stage || "novo",
    },
  });
  await prisma.message.create({ data: { conversationId: conversation.id, role: "bot", text: "Lead recebido via API pública." } });

  return NextResponse.json({ data: serializeLead(conversation) }, { status: 201 });
}
