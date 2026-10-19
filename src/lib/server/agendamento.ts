import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CANAIS_AGENDAVEIS, decidirEnvio } from "@/lib/whatsapp/janela";
import type { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Mensagem avulsa agendada ("mandar amanhã 9h") e cancelar/reagendar.
//
// A avulsa é um Broadcast com kind = "single" e um destinatário só: mesmo
// relógio (runDueBroadcasts), mesma fila do QR, mesmo envio de modelo. Assim
// não existe um segundo agendador que pode divergir do primeiro.
// ---------------------------------------------------------------------------

const MINUTO = 60 * 1000;
const MAX_DIAS = 90;

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string; status: 400 | 404 | 409 };

/** null = horário bom. Senão, o motivo. */
export function validarHorario(quando: Date, agora: Date = new Date()): string | null {
  if (!(quando instanceof Date) || Number.isNaN(quando.getTime())) return "Data e hora inválidas.";
  if (quando.getTime() < agora.getTime() + MINUTO) return "Escolha um horário no futuro (pelo menos 1 minuto à frente).";
  if (quando.getTime() > agora.getTime() + MAX_DIAS * 24 * 60 * MINUTO) return `Dá para agendar até ${MAX_DIAS} dias à frente.`;
  return null;
}

async function ultimaMensagemDoContato(agentId: string, channel: string, contactId: string): Promise<Date | null> {
  const conversa = await prisma.conversation.findUnique({
    where: { agentId_channel_contactId: { agentId, channel, contactId } },
    select: { lastContactMessageAt: true },
  });
  return conversa?.lastContactMessageAt ?? null;
}

export interface NovaMensagemAgendada {
  orgId: string;
  userId: string;
  agentId: string;
  channel: string;
  /** Mesmo valor de Conversation.contactId / ContactChannel.externalId. */
  to: string;
  contactRecordId?: string | null;
  dealId?: string | null;
  text: string;
  templateId?: string | null;
  quando: Date;
}

export async function criarMensagemAgendada(
  input: NovaMensagemAgendada
): Promise<Resultado<{ broadcast: { id: string; scheduledAt: Date | null } }>> {
  const { orgId, agentId, channel } = input;
  const to = input.to?.trim();
  const text = input.text?.trim() ?? "";

  if (!CANAIS_AGENDAVEIS.has(channel)) {
    return { ok: false, status: 400, erro: "Este canal não aceita mensagem agendada." };
  }
  if (!to) return { ok: false, status: 400, erro: "Falta o destinatário." };
  const problemaHorario = validarHorario(input.quando);
  if (problemaHorario) return { ok: false, status: 400, erro: problemaHorario };

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId },
    include: { metaConnection: true, telegramConnection: true },
  });
  if (!agent) return { ok: false, status: 404, erro: "Agente não encontrado." };
  if (channel === "whatsapp_meta" && !agent.metaConnection) {
    return { ok: false, status: 400, erro: "Agente sem conexão WhatsApp oficial." };
  }
  if (channel === "telegram" && !agent.telegramConnection) {
    return { ok: false, status: 400, erro: "Agente sem bot do Telegram configurado." };
  }

  let template: { id: string; metaTemplateName: string; bodyText: string } | null = null;
  if (input.templateId) {
    template = await prisma.messageTemplate.findFirst({
      where: { id: input.templateId, agentId },
      select: { id: true, metaTemplateName: true, bodyText: true },
    });
    if (!template) return { ok: false, status: 404, erro: "Modelo não encontrado." };
    if (channel === "whatsapp_meta" && !template.metaTemplateName) {
      return { ok: false, status: 400, erro: "Esse modelo não está ligado a um template aprovado da Meta." };
    }
  }

  if (!text && !template) return { ok: false, status: 400, erro: "Escreva a mensagem ou escolha um modelo." };

  if (channel === "whatsapp_meta") {
    const decisao = decidirEnvio({
      channel,
      lastContactMessageAt: await ultimaMensagemDoContato(agentId, channel, to),
      quando: input.quando,
      // Avulsa com modelo sai como modelo; ver runBroadcast.
      temTexto: !template && !!text,
      temModelo: !!template,
    });
    if (!decisao.ok) return { ok: false, status: 400, erro: decisao.erro };
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      agentId,
      channel,
      kind: "single",
      audience: "manual",
      manualRecipients: [to] as unknown as Prisma.InputJsonValue,
      totalCount: 1,
      status: "scheduled",
      scheduledAt: input.quando,
      text: text || template?.bodyText || "",
      templateId: template?.id ?? null,
      contactRecordId: input.contactRecordId ?? null,
      dealId: input.dealId ?? null,
      createdById: input.userId,
    },
  });
  return { ok: true, broadcast };
}

/** Cancela um disparo/avulsa enquanto ainda está só agendado. */
export async function cancelarAgendado(id: string, orgId: string, kind?: "campaign" | "single"): Promise<Resultado> {
  const r = await prisma.broadcast.updateMany({
    where: { id, status: "scheduled", agent: { orgId }, kind },
    data: { status: "canceled" },
  });
  if (r.count === 1) return { ok: true };

  const atual = await prisma.broadcast.findFirst({ where: { id, agent: { orgId }, kind }, select: { status: true } });
  if (!atual) return { ok: false, status: 404, erro: "Agendamento não encontrado." };
  if (atual.status === "canceled") return { ok: true };
  return { ok: false, status: 409, erro: "Esse envio já começou (ou já saiu) e não dá mais para cancelar." };
}

/** Muda a hora enquanto ainda está agendado. Avulsa no oficial: confere a janela na hora nova. */
export async function reagendar(
  id: string,
  orgId: string,
  quando: Date,
  kind?: "campaign" | "single"
): Promise<Resultado> {
  const problemaHorario = validarHorario(quando);
  if (problemaHorario) return { ok: false, status: 400, erro: problemaHorario };

  const atual = await prisma.broadcast.findFirst({
    where: { id, agent: { orgId }, kind },
    select: { id: true, status: true, kind: true, channel: true, templateId: true, agentId: true, manualRecipients: true },
  });
  if (!atual) return { ok: false, status: 404, erro: "Agendamento não encontrado." };
  if (atual.status !== "scheduled") {
    return { ok: false, status: 409, erro: "Esse envio já começou (ou foi cancelado) e não dá mais para mudar a hora." };
  }

  if (atual.kind === "single" && atual.channel === "whatsapp_meta") {
    const to = (Array.isArray(atual.manualRecipients) ? (atual.manualRecipients as string[]) : [])[0] ?? "";
    const decisao = decidirEnvio({
      channel: atual.channel,
      lastContactMessageAt: await ultimaMensagemDoContato(atual.agentId, atual.channel, to),
      quando,
      temTexto: !atual.templateId,
      temModelo: !!atual.templateId,
    });
    if (!decisao.ok) return { ok: false, status: 400, erro: decisao.erro };
  }

  const r = await prisma.broadcast.updateMany({
    where: { id, status: "scheduled", agent: { orgId }, kind },
    data: { scheduledAt: quando },
  });
  if (r.count === 0) return { ok: false, status: 409, erro: "Esse envio acabou de começar e não dá mais para mudar a hora." };
  return { ok: true };
}

export interface FiltroDeAgendadas {
  orgId: string;
  contactRecordId?: string | null;
  dealId?: string | null;
  agentId?: string | null;
  channel?: string | null;
  to?: string | null;
}

/** Avulsas de um contato/negócio/conversa: as próximas e as últimas que saíram. */
export async function listarAgendadas(f: FiltroDeAgendadas) {
  const ou: Prisma.BroadcastWhereInput[] = [];
  if (f.contactRecordId) ou.push({ contactRecordId: f.contactRecordId });
  if (f.dealId) ou.push({ dealId: f.dealId });
  if (f.agentId && f.channel && f.to) {
    ou.push({ agentId: f.agentId, channel: f.channel, manualRecipients: { array_contains: [f.to] } });
  }
  if (ou.length === 0) return [];

  const linhas = await prisma.broadcast.findMany({
    where: { kind: "single", agent: { orgId: f.orgId }, OR: ou },
    include: { agent: { select: { name: true } } },
    orderBy: [{ scheduledAt: "desc" }],
    take: 30,
  });

  return linhas.map((b) => ({
    id: b.id,
    agentId: b.agentId,
    agentName: b.agent.name,
    channel: b.channel,
    to: (Array.isArray(b.manualRecipients) ? (b.manualRecipients as string[]) : [])[0] ?? "",
    text: b.text,
    templateId: b.templateId,
    status: b.status,
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    sentCount: b.sentCount,
    failedCount: b.failedCount,
    lastError: b.lastError,
    createdAt: b.createdAt.toISOString(),
  }));
}
