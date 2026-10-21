import "server-only";
import { prisma } from "@/lib/db/prisma";
import { deliverToContact } from "@/lib/server/outbound";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import { decidirEnvio } from "@/lib/whatsapp/janela";
import { rodarDisparoDeEmail } from "@/lib/server/email/disparo";

// ---------------------------------------------------------------------------
// Execução de um disparo.
//
// Vale pro disparo imediato (rota de Disparos chama na hora) e pro agendado
// (o worker chama /api/internal/scheduler, que chama isto). Mesmo caminho nos
// dois casos, então um agendado não é um bicho diferente que pode divergir.
//
// Público (audience):
//   manual  → lista de ids colada à mão (comportamento antigo)
//   tags    → contatos que têm QUALQUER uma das etiquetas
//   segment → contatos que batem com as regras do segmento
//
// Em tags/segment, só entra quem tem optIn — a lista manual não filtra,
// porque ali quem digitou assumiu a responsabilidade por cada número.
// ---------------------------------------------------------------------------

export interface RunResult {
  totalCount: number;
  sentCount: number;
  failedCount: number;
  /** Foram pra fila do worker (WhatsApp QR) e ainda não saíram. */
  queuedCount: number;
  errors: string[];
}

interface Recipient {
  externalId: string;
  values: Record<string, unknown>;
}

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Sorteio ponderado. Sem variantes, devolve null (usa o texto do disparo). */
function pickVariant<T extends { weight: number }>(variants: T[]): T | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((sum, v) => sum + Math.max(0, v.weight), 0);
  if (total <= 0) return variants[0];
  let ticket = Math.random() * total;
  for (const variant of variants) {
    ticket -= Math.max(0, variant.weight);
    if (ticket <= 0) return variant;
  }
  return variants[variants.length - 1];
}

async function resolveRecipients(broadcast: {
  agentId: string;
  orgId: string;
  channel: string;
  audience: string;
  segmentId: string | null;
  tagIds: unknown;
  manualRecipients: unknown;
}): Promise<Recipient[]> {
  if (broadcast.audience === "manual") {
    const ids = Array.isArray(broadcast.manualRecipients) ? (broadcast.manualRecipients as string[]) : [];
    // Mesmo na lista manual vale a pena puxar a ficha, quando ela existe: é o
    // que permite personalizar {nome} em vez de mandar texto igual pra todos.
    const known = await prisma.contactChannel.findMany({
      where: { agentId: broadcast.agentId, channel: broadcast.channel, externalId: { in: ids } },
      include: { contact: true },
    });
    const byId = new Map(known.map((ch) => [ch.externalId, ch.contact]));
    return ids.map((externalId) => {
      const c = byId.get(externalId);
      return { externalId, values: c ? contactValues(c) : {} };
    });
  }

  const where =
    broadcast.audience === "segment" && broadcast.segmentId
      ? await (async () => {
          const segment = await prisma.segment.findUnique({ where: { id: broadcast.segmentId! } });
          if (!segment) return { orgId: broadcast.orgId };
          return buildSegmentWhere(broadcast.orgId, segment.match, parseRules(segment.rules));
        })()
      : {
          orgId: broadcast.orgId,
          tags: { some: { tagId: { in: (broadcast.tagIds as string[]) ?? [] } } },
        };

  // Só entra quem é ALCANÇÁVEL por este agente neste canal. Um contato da org
  // sem ContactChannel do agente que está disparando não tem para onde
  // receber, e incluí-lo só geraria falha de envio.
  const contacts = await prisma.contact.findMany({
    where: {
      AND: [
        where,
        { optIn: true },
        { channels: { some: { agentId: broadcast.agentId, channel: broadcast.channel } } },
      ],
    },
    include: {
      channels: { where: { agentId: broadcast.agentId, channel: broadcast.channel }, take: 1 },
    },
    take: 5000,
  });

  return contacts.map((c) => ({
    externalId: c.channels[0].externalId,
    values: contactValues(c),
  }));
}

/** Campos disponíveis para interpolar {nome}, {email}, ... na mensagem. */
function contactValues(contact: {
  name: string;
  email: string;
  phone: string;
  customFields: unknown;
}): Record<string, unknown> {
  return {
    ...((contact.customFields as Record<string, unknown>) ?? {}),
    nome: contact.name,
    name: contact.name,
    email: contact.email,
    telefone: contact.phone,
    phone: contact.phone,
  };
}

/**
 * Entrega um disparo já criado. Idempotência é por status: só roda o que
 * está em "scheduled" ou "sending"; um disparo "done" é ignorado, então uma
 * varredura repetida do worker não reenvia nada.
 *
 * Agendado vira "sending" de forma atômica (updateMany com status no where):
 * se duas batidas do relógio chegarem juntas, só uma entrega.
 *
 * Contagem: sentCount só recebe o que SAIU aqui (envio direto). Item que foi
 * pra fila do WhatsApp QR é somado pelo worker quando ele manda de verdade —
 * antes os dois somavam e o placar chegava ao dobro (e fechava "done" cedo).
 */
export async function runBroadcast(broadcastId: string): Promise<RunResult> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { variants: true, agent: { select: { orgId: true } } },
  });
  const result: RunResult = { totalCount: 0, sentCount: 0, failedCount: 0, queuedCount: 0, errors: [] };
  if (!broadcast) return result;

  if (broadcast.status === "scheduled") {
    const claim = await prisma.broadcast.updateMany({
      where: { id: broadcastId, status: "scheduled" },
      data: { status: "sending" },
    });
    if (claim.count === 0) return result; // outra batida pegou, ou foi cancelado agora
  } else if (broadcast.status !== "sending") {
    return result; // done | canceled
  }

  // E-mail sai em lotes (ver email/disparo.ts): cada chamada manda uma parte
  // e o relógio continua enquanto o disparo estiver "sending".
  if (broadcast.channel === "email") {
    const rodada = await rodarDisparoDeEmail({ ...broadcast, orgId: broadcast.agent.orgId });
    const erro = rodada.errors[0] ?? null;
    const terminou = rodada.faltam === 0 || rodada.parouPorContrato;
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        totalCount: rodada.totalCount,
        sentCount: { increment: rodada.sentCount },
        failedCount: { increment: rodada.failedCount },
        ...(erro ? { lastError: erro.slice(0, 300) } : {}),
        ...(terminou ? { status: rodada.parouPorContrato ? "canceled" : "done" } : {}),
      },
    });
    return rodada;
  }

  const recipients = await resolveRecipients({ ...broadcast, orgId: broadcast.agent.orgId });
  result.totalCount = recipients.length;

  // Modelos aprovados usados pelas variantes/pelo disparo, carregados de uma
  // vez pra não bater no banco por destinatário.
  const templateIds = [broadcast.templateId, ...broadcast.variants.map((v) => v.templateId)].filter(
    (id): id is string => !!id
  );
  const templates = templateIds.length
    ? await prisma.messageTemplate.findMany({ where: { id: { in: templateIds } } })
    : [];
  const templateById = new Map(templates.map((t) => [t.id, t]));

  for (const recipient of recipients) {
    const variant = pickVariant(broadcast.variants);
    const rawText = variant?.text ?? broadcast.text;
    const templateId = variant?.templateId ?? broadcast.templateId;
    const template = templateId ? templateById.get(templateId) : undefined;

    const text = interpolate(rawText, recipient.values);
    const templatePayload =
      template && template.metaTemplateName
        ? {
            name: template.metaTemplateName,
            languageCode: template.metaLanguageCode,
            parameters: ((template.variableOrder as unknown as string[]) ?? []).map((n) =>
              String(recipient.values[n] ?? "")
            ),
          }
        : undefined;

    // WhatsApp oficial sem modelo (ou mensagem avulsa): texto livre só com a
    // janela de 24h aberta AGORA. Avulsa com modelo sai sempre como modelo.
    let usarModelo = !!templatePayload;
    if (broadcast.channel === "whatsapp_meta" && (broadcast.kind === "single" || !templatePayload)) {
      const conversa = await prisma.conversation.findUnique({
        where: {
          agentId_channel_contactId: {
            agentId: broadcast.agentId,
            channel: broadcast.channel,
            contactId: recipient.externalId,
          },
        },
        select: { lastContactMessageAt: true },
      });
      const decisao = decidirEnvio({
        channel: broadcast.channel,
        lastContactMessageAt: conversa?.lastContactMessageAt ?? null,
        quando: new Date(),
        temTexto: !templatePayload && text.trim().length > 0,
        temModelo: !!templatePayload,
      });
      if (!decisao.ok) {
        result.failedCount += 1;
        if (result.errors.length < 5) result.errors.push(decisao.erro);
        if (variant) {
          await prisma.broadcastVariant.update({ where: { id: variant.id }, data: { failedCount: { increment: 1 } } });
        }
        continue;
      }
      usarModelo = decisao.usarModelo;
    }

    const delivery = await deliverToContact({
      agentId: broadcast.agentId,
      channel: broadcast.channel,
      to: recipient.externalId,
      text,
      template: broadcast.channel === "whatsapp_meta" && usarModelo ? templatePayload : undefined,
      broadcastId: broadcast.id,
      variantId: variant?.id,
    });

    if (delivery.ok && delivery.queued) {
      // Ainda não saiu: o worker soma no disparo e na variante quando mandar.
      result.queuedCount += 1;
    } else if (delivery.ok) {
      result.sentCount += 1;
      if (variant) {
        await prisma.broadcastVariant.update({
          where: { id: variant.id },
          data: { sentCount: { increment: 1 } },
        });
      }
    } else {
      result.failedCount += 1;
      if (result.errors.length < 5 && delivery.error) result.errors.push(delivery.error);
      if (variant) {
        await prisma.broadcastVariant.update({
          where: { id: variant.id },
          data: { failedCount: { increment: 1 } },
        });
      }
    }
  }

  // Uma instrução só: soma o que saiu aqui e decide o status com os números
  // já somados (os do worker inclusive). Se ainda há itens na fila, fica
  // "sending" e o worker fecha quando o último sair; se o worker já mandou
  // tudo antes desta linha, ela mesma fecha.
  const lastError = result.errors[0] ?? null;
  await prisma.$executeRaw`
    UPDATE "eva_studio_broadcasts" SET
      "totalCount" = ${result.totalCount},
      "sentCount" = "sentCount" + ${result.sentCount},
      "failedCount" = "failedCount" + ${result.failedCount},
      "lastError" = COALESCE(${lastError}::text, "lastError"),
      "status" = CASE
        WHEN "status" = 'canceled' THEN 'canceled'
        WHEN "sentCount" + ${result.sentCount} + "failedCount" + ${result.failedCount} >= ${result.totalCount} THEN 'done'
        ELSE 'sending'
      END
    WHERE "id" = ${broadcastId}`;

  return result;
}

/** Disparos agendados cuja hora chegou. Chamado pelo scheduler. */
export async function runDueBroadcasts(limit = 10): Promise<{ ran: number; results: RunResult[] }> {
  const due = await prisma.broadcast.findMany({
    // Disparo de e-mail em andamento também entra: ele sai em lotes, uma
    // parte por batida do relógio.
    where: {
      OR: [
        { status: "scheduled", scheduledAt: { lte: new Date() } },
        { status: "sending", channel: "email" },
      ],
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  const results: RunResult[] = [];
  for (const b of due) {
    results.push(await runBroadcast(b.id));
  }
  return { ran: due.length, results };
}
