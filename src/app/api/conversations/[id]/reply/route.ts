import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Resposta manual de um atendente numa conversa parada em waiting_human. Não
// passa pelo motor de fluxo (advanceConversation) — é canal direto: grava na
// transcrição (role "human", pra diferenciar de "bot") e manda de verdade
// pro canal certo. Playground/prévia do Builder não têm destinatário real,
// então só ficam registradas.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, agent: { orgId } },
    include: { agent: { include: { metaConnection: true } } },
  });
  if (!conversation) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const { text } = await request.json();
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return NextResponse.json({ error: "text é obrigatório." }, { status: 400 });

  await prisma.message.create({ data: { conversationId: conversation.id, role: "human", text: trimmed } });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  if (conversation.channel === "whatsapp_meta") {
    const conn = conversation.agent.metaConnection;
    if (!conn) return NextResponse.json({ error: "Agente sem conexão Meta configurada." }, { status: 400 });
    try {
      await fetch(`https://graph.facebook.com/v21.0/${conn.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${conn.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: conversation.contactId,
          type: "text",
          text: { body: trimmed },
        }),
      });
    } catch {
      return NextResponse.json({ error: "Mensagem registrada, mas falhou ao enviar pra Meta." }, { status: 502 });
    }
  } else if (conversation.channel === "whatsapp_qr") {
    // O app não segura o socket do Baileys (fica no worker) — grava na fila
    // e o worker manda de verdade por polling. Ver worker/index.js.
    await prisma.outboundQueueItem.create({
      data: { agentId: conversation.agentId, contactId: conversation.contactId, text: trimmed },
    });
  }

  return NextResponse.json({ ok: true });
}
