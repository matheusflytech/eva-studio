import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Leads = conversas do canal "website" — tanto as que vieram do widget de
// chat quanto as adicionadas na mão ou via API (mesmo canal, mesma tabela,
// só o prefixo do contactId muda: "web_" = widget, "manual_"/"api_" = as
// outras duas). Não é uma tabela nova, é uma leitura específica de
// Conversation. Ver docs/CHATBOT_ENGINE.md §13.
export async function GET() {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const rows = await prisma.conversation.findMany({
    where: { channel: "website", agent: { orgId } },
    include: {
      agent: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    leads: rows.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      agentName: c.agent.name,
      contactId: c.contactId,
      variables: c.variables,
      leadStage: c.leadStage ?? "novo",
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastMessage: c.messages[0] ? { text: c.messages[0].text, role: c.messages[0].role } : null,
    })),
  });
}

// Duas formas de entrar: (1) sessão normal — o botão "+ Novo lead" na
// própria página, o navegador manda o cookie de sempre; (2) header
// X-Internal-Secret — pra empurrar lead de fora (n8n, um formulário
// externo, etc.), mesmo segredo que o worker do WhatsApp já usa
// (INTERNAL_API_SECRET). Sem cookie de sessão pra saber o orgId nesse
// segundo caso, então quem chama precisa saber o agentId certo — o
// segredo em si já prova que pode agir em nome do app.
export async function POST(request: Request) {
  const secretHeader = request.headers.get("x-internal-secret");
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  const viaSecret = !!expectedSecret && secretHeader === expectedSecret;

  let orgId: string | null = null;
  if (!viaSecret) {
    orgId = await requireOrgId();
    if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { agentId, contactId, variables, leadStage } = await request.json();
  if (!agentId || !variables || typeof variables !== "object") {
    return NextResponse.json({ error: "agentId e variables são obrigatórios." }, { status: 400 });
  }

  const agent = viaSecret
    ? await prisma.agent.findUnique({ where: { id: agentId } })
    : await prisma.agent.findFirst({ where: { id: agentId, orgId: orgId! } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const finalContactId = contactId?.trim() || `${viaSecret ? "api" : "manual"}_${randomUUID().slice(0, 12)}`;

  const conversation = await prisma.conversation.create({
    data: {
      agentId,
      channel: "website",
      contactId: finalContactId,
      variables,
      leadStage: leadStage || "novo",
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "bot",
      text: viaSecret ? "Lead recebido via API." : "Lead adicionado manualmente.",
    },
  });

  return NextResponse.json({ id: conversation.id });
}
