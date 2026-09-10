import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Envio pro WhatsApp oficial (Meta) é síncrono aqui mesmo (a Vercel consegue
// chamar a Graph API direto) — capado num tamanho razoável de lista pra não
// estourar o tempo de execução da função serverless numa campanha grande.
const MAX_META_RECIPIENTS = 200;

async function sendMetaTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  name: string,
  languageCode: string,
  parameters: string[]
) {
  await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: languageCode },
        components: parameters.length > 0 ? [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }] : undefined,
      },
    }),
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId },
    include: { whatsappConnection: true, metaConnection: true },
  });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const broadcasts = await prisma.broadcast.findMany({ where: { agentId }, orderBy: { createdAt: "desc" }, take: 30 });

  return NextResponse.json({
    channels: {
      whatsapp_qr: agent.whatsappConnection?.status === "connected",
      whatsapp_meta: !!agent.metaConnection,
    },
    broadcasts: broadcasts.map((b) => ({
      id: b.id,
      channel: b.channel,
      text: b.text,
      totalCount: b.totalCount,
      sentCount: b.sentCount,
      failedCount: b.failedCount,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, include: { metaConnection: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { channel, contactIds, text, templateId, variableValues } = await request.json();
  const recipients: string[] = Array.isArray(contactIds) ? contactIds.map(String).map((c) => c.trim()).filter(Boolean) : [];

  if (channel !== "whatsapp_qr" && channel !== "whatsapp_meta") {
    return NextResponse.json({ error: "channel inválido." }, { status: 400 });
  }
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Informe pelo menos um contato." }, { status: 400 });
  }

  if (channel === "whatsapp_meta") {
    if (!agent.metaConnection) return NextResponse.json({ error: "Agente sem conexão Meta configurada." }, { status: 400 });
    if (!templateId) {
      return NextResponse.json({ error: "Fora da janela de 24h, disparo pro WhatsApp oficial precisa de um modelo aprovado." }, { status: 400 });
    }
    if (recipients.length > MAX_META_RECIPIENTS) {
      return NextResponse.json({ error: `Máximo de ${MAX_META_RECIPIENTS} contatos por disparo no canal oficial.` }, { status: 400 });
    }

    const template = await prisma.messageTemplate.findFirst({ where: { id: templateId, agentId } });
    if (!template || !template.metaTemplateName) {
      return NextResponse.json({ error: "Modelo inválido ou sem nome cadastrado na Meta." }, { status: 400 });
    }
    const order = (template.variableOrder as unknown as string[]) ?? [];
    const values = (variableValues ?? {}) as Record<string, string>;
    const parameters = order.map((name) => values[name] ?? "");

    const broadcast = await prisma.broadcast.create({
      data: { agentId, channel, text: template.bodyText, templateId, totalCount: recipients.length, status: "sending" },
    });

    let sentCount = 0;
    let failedCount = 0;
    for (const to of recipients) {
      try {
        await sendMetaTemplate(agent.metaConnection.phoneNumberId, agent.metaConnection.accessToken, to, template.metaTemplateName, template.metaLanguageCode, parameters);
        sentCount += 1;
      } catch {
        failedCount += 1;
      }
    }
    await prisma.broadcast.update({ where: { id: broadcast.id }, data: { sentCount, failedCount, status: "done" } });

    return NextResponse.json({ ok: true, broadcastId: broadcast.id });
  }

  // whatsapp_qr: texto livre, entregue pelo worker via fila (não é a API
  // oficial, não tem restrição de janela de 24h).
  const trimmedText = typeof text === "string" ? text.trim() : "";
  if (!trimmedText) return NextResponse.json({ error: "text é obrigatório pro canal whatsapp_qr." }, { status: 400 });

  const broadcast = await prisma.broadcast.create({
    data: { agentId, channel, text: trimmedText, totalCount: recipients.length, status: "sending" },
  });
  await prisma.outboundQueueItem.createMany({
    data: recipients.map((contactId) => ({ agentId, contactId, text: trimmedText, broadcastId: broadcast.id })),
  });

  return NextResponse.json({ ok: true, broadcastId: broadcast.id });
}
