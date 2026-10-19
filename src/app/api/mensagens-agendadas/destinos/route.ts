import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { CANAIS_AGENDAVEIS } from "@/lib/whatsapp/janela";

// Para onde dá para agendar uma mensagem a este contato: os canais em que ele
// já falou com algum agente (ContactChannel), só os que aceitam agendamento,
// com a última mensagem dele — que é o que diz se a janela de 24h está aberta.
// GET ?contactId=
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const contactId = new URL(request.url).searchParams.get("contactId") ?? "";
  if (!contactId) return NextResponse.json({ error: "Informe o contato." }, { status: 400 });

  const contato = await prisma.contact.findFirst({
    where: { id: contactId, orgId: ctx.orgId },
    select: {
      id: true,
      name: true,
      channels: {
        where: { channel: { in: [...CANAIS_AGENDAVEIS] } },
        select: { agentId: true, channel: true, externalId: true, agent: { select: { name: true } } },
      },
    },
  });
  if (!contato) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const conversas = contato.channels.length
    ? await prisma.conversation.findMany({
        where: {
          OR: contato.channels.map((c) => ({ agentId: c.agentId, channel: c.channel, contactId: c.externalId })),
        },
        select: { agentId: true, channel: true, contactId: true, lastContactMessageAt: true },
      })
    : [];
  const ultima = new Map(
    conversas.map((c) => [`${c.agentId}|${c.channel}|${c.contactId}`, c.lastContactMessageAt?.toISOString() ?? null])
  );

  return NextResponse.json({
    contato: { id: contato.id, name: contato.name },
    destinos: contato.channels.map((c) => ({
      agentId: c.agentId,
      agentName: c.agent.name,
      channel: c.channel,
      to: c.externalId,
      lastContactMessageAt: ultima.get(`${c.agentId}|${c.channel}|${c.externalId}`) ?? null,
    })),
  });
}
