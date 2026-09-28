import "server-only";
import { prisma } from "@/lib/db/prisma";
import { deliverToContact } from "@/lib/server/outbound";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";

// ---------------------------------------------------------------------------
// Sequências (drip) — régua de mensagens com espera entre elas.
//
// O contato entra sozinho quando ganha uma etiqueta (o gatilho mais usado),
// quando passa a bater com um segmento, ou à mão pela tela de Contatos. Daí
// em diante quem toca é o relógio: cada inscrição guarda `nextRunAt`, e quem
// varre as vencidas é o worker (processo sempre ligado) chamando
// /api/internal/scheduler — a Vercel no plano grátis só dá cron 1x por dia,
// o que não serve pra régua nenhuma.
//
// Duas travas importantes, que são a diferença entre follow-up e perseguição:
//   - stopOnReply: respondeu, sai da régua.
//   - optIn: quem pediu pra sair não recebe mais nada.
// ---------------------------------------------------------------------------

/** Janela de 24h da Meta: fora dela, WhatsApp oficial só aceita modelo aprovado. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

function isOutsideWindow(lastContactMessageAt: Date | null): boolean {
  if (!lastContactMessageAt) return true;
  return Date.now() - lastContactMessageAt.getTime() > WINDOW_MS;
}

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

/**
 * Inscreve um contato numa sequência, respeitando allowReentry.
 * Devolve o id da inscrição, ou null se não inscreveu.
 */
export async function enrollContact(sequenceId: string, contactId: string): Promise<string | null> {
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { order: "asc" }, take: 1 } },
  });
  if (!sequence || sequence.steps.length === 0) return null;

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || !contact.optIn) return null;

  const existing = await prisma.sequenceEnrollment.findUnique({
    where: { sequenceId_contactId: { sequenceId, contactId } },
  });
  if (existing && !sequence.allowReentry) return null;

  const nextRunAt = new Date(Date.now() + sequence.steps[0].delayMinutes * 60_000);

  if (existing) {
    await prisma.sequenceEnrollment.update({
      where: { id: existing.id },
      data: { currentStep: 0, nextRunAt, status: "active", stoppedReason: null },
    });
    return existing.id;
  }

  const created = await prisma.sequenceEnrollment.create({
    data: { sequenceId, contactId, currentStep: 0, nextRunAt, status: "active" },
  });
  return created.id;
}

/** Auto-enrollment por etiqueta — chamado por applyTag (src/lib/server/contacts.ts). */
export async function enrollContactByTag(contactId: string, tagId: string): Promise<void> {
  const sequences = await prisma.sequence.findMany({
    where: { active: true, trigger: "tag", triggerTagId: tagId },
    select: { id: true },
  });
  for (const s of sequences) {
    await enrollContact(s.id, contactId);
  }
}

/**
 * Tira o contato de toda régua que tem stopOnReply. Chamado pelo motor quando
 * chega mensagem de verdade do contato.
 */
export async function stopEnrollmentsOnReply(contactId: string): Promise<void> {
  await prisma.sequenceEnrollment.updateMany({
    where: { contactId, status: "active", sequence: { stopOnReply: true } },
    data: { status: "stopped", stoppedReason: "respondeu" },
  });
}

/**
 * Inscreve quem passou a bater com o segmento de uma sequência.
 *
 * Etiqueta tem um momento exato de aplicação, então o auto-enrollment dela é
 * por evento (applyTag). Segmento não tem: o contato passa a bater com a regra
 * quando um campo muda, quando o tempo passa, quando alguém importa uma
 * planilha. Não existe evento pra assinar — por isso aqui é varredura, rodando
 * junto do relógio das sequências.
 *
 * Só pega quem ainda não tem inscrição nessa régua (ou quem pode reentrar),
 * então rodar de minuto em minuto não reinscreve ninguém.
 */
export async function enrollBySegments(limitPerSequence = 200): Promise<number> {
  const sequences = await prisma.sequence.findMany({
    where: { active: true, trigger: "segment", triggerSegmentId: { not: null } },
    include: { triggerSegment: true, agent: { select: { orgId: true } } },
  });

  let enrolled = 0;
  for (const sequence of sequences) {
    const segment = sequence.triggerSegment;
    if (!segment) continue;

    const where = buildSegmentWhere(sequence.agent.orgId, segment.match, parseRules(segment.rules));
    const candidates = await prisma.contact.findMany({
      where: {
        AND: [
          where,
          { optIn: true },
          sequence.allowReentry
            ? { enrollments: { none: { sequenceId: sequence.id, status: "active" } } }
            : { enrollments: { none: { sequenceId: sequence.id } } },
        ],
      },
      select: { id: true },
      take: limitPerSequence,
    });

    for (const contact of candidates) {
      if (await enrollContact(sequence.id, contact.id)) enrolled += 1;
    }
  }
  return enrolled;
}

/**
 * Inscreve contatos cujo negócio entrou (ou está parado) na etapa gatilho.
 *
 * Mesma natureza do gatilho por segmento: não existe um evento para assinar,
 * porque "parado há 7 dias" acontece pela passagem do tempo, não por uma ação.
 * Por isso é varredura, junto do relógio.
 *
 * Com triggerStageDays = 0 a régua começa assim que o negócio chega na etapa;
 * com 7, só quando ele está esquecido ali há uma semana. São duas réguas
 * bem diferentes: a primeira é acompanhamento, a segunda é recuperação.
 */
export async function enrollByDealStage(limitPerSequence = 200): Promise<number> {
  const sequences = await prisma.sequence.findMany({
    where: { active: true, trigger: "stage", triggerStageId: { not: null } },
  });

  let enrolled = 0;
  for (const sequence of sequences) {
    const corte = new Date(Date.now() - sequence.triggerStageDays * 86_400_000);

    const deals = await prisma.deal.findMany({
      where: {
        stageId: sequence.triggerStageId!,
        closedAt: null,
        archivedAt: null,
        stageSince: { lte: corte },
      },
      select: { contacts: { select: { contactId: true } } },
      take: limitPerSequence,
    });

    // Um negócio pode ter vários contatos; a régua vale para todos eles.
    const contatos = [...new Set(deals.flatMap((d) => d.contacts.map((c) => c.contactId)))];
    for (const contactId of contatos) {
      if (await enrollContact(sequence.id, contactId)) enrolled += 1;
    }
  }
  return enrolled;
}

export interface ProcessResult {
  processed: number;
  delivered: number;
  stopped: number;
  errors: string[];
}

/**
 * Entrega o próximo passo de toda inscrição vencida. Idempotente por rodada:
 * só avança `currentStep` depois que a entrega deu certo (ou foi pra fila do
 * worker), então uma falha de rede faz o passo ser tentado de novo na próxima
 * varredura em vez de ser pulado.
 */
export async function processDueEnrollments(limit = 50): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, delivered: 0, stopped: 0, errors: [] };

  const due = await prisma.sequenceEnrollment.findMany({
    where: { status: "active", nextRunAt: { lte: new Date() } },
    include: {
      contact: true,
      sequence: { include: { steps: { orderBy: { order: "asc" } } } },
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });

  for (const enrollment of due) {
    result.processed += 1;
    const { sequence, contact } = enrollment;

    if (!sequence.active) {
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "stopped", stoppedReason: "manual" },
      });
      result.stopped += 1;
      continue;
    }

    if (!contact.optIn) {
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "stopped", stoppedReason: "opt-out" },
      });
      result.stopped += 1;
      continue;
    }

    const step = sequence.steps.find((s) => s.order === enrollment.currentStep + 1);
    if (!step) {
      await prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "done" } });
      continue;
    }

    // Janela de 24h: no WhatsApp oficial, texto livre fora dela é rejeitado
    // pela Meta. Em vez de gastar a chamada e registrar um erro cru, para a
    // régua com um motivo legível.
    let template: { name: string; languageCode: string; parameters: string[] } | undefined;
    if (sequence.channel === "whatsapp_meta") {
      const conversation = await prisma.conversation.findFirst({
        where: { agentId: sequence.agentId, channel: "whatsapp_meta", contactRecordId: contact.id },
        select: { lastContactMessageAt: true },
      });
      if (isOutsideWindow(conversation?.lastContactMessageAt ?? null)) {
        if (!step.templateId) {
          await prisma.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "stopped", stoppedReason: "fora da janela de 24h e o passo não tem modelo aprovado" },
          });
          result.stopped += 1;
          continue;
        }
        const tpl = await prisma.messageTemplate.findFirst({
          where: { id: step.templateId, agentId: sequence.agentId },
        });
        if (tpl?.metaTemplateName) {
          const order = (tpl.variableOrder as unknown as string[]) ?? [];
          const values = contactValues(contact);
          template = {
            name: tpl.metaTemplateName,
            languageCode: tpl.metaLanguageCode,
            parameters: order.map((n) => String(values[n] ?? "")),
          };
        }
      }
    }

    // Onde entregar: o canal desta pessoa NESTE agente. Sem isso a régua
    // não tem endereço, e parar com motivo legível é melhor do que tentar
    // enviar para um id que não existe neste canal.
    const target = await prisma.contactChannel.findFirst({
      where: { contactId: contact.id, agentId: sequence.agentId, channel: sequence.channel },
    });
    if (!target) {
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "stopped", stoppedReason: `contato sem canal ${sequence.channel} neste agente` },
      });
      result.stopped += 1;
      continue;
    }

    const text = interpolate(step.text, contactValues(contact));
    const delivery = await deliverToContact({
      agentId: sequence.agentId,
      channel: sequence.channel,
      to: target.externalId,
      text,
      template,
      enrollmentId: enrollment.id,
    });

    if (!delivery.ok) {
      result.errors.push(`${sequence.name} passo ${step.order}: ${delivery.error}`);
      // Não avança: tenta de novo na próxima varredura.
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { nextRunAt: new Date(Date.now() + 15 * 60_000) },
      });
      continue;
    }

    result.delivered += 1;

    if (step.applyTagId) {
      const { applyTag } = await import("@/lib/server/contacts");
      await applyTag(contact.id, step.applyTagId);
    }

    const nextStep = sequence.steps.find((s) => s.order === step.order + 1);
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: nextStep
        ? { currentStep: step.order, nextRunAt: new Date(Date.now() + nextStep.delayMinutes * 60_000) }
        : { currentStep: step.order, status: "done" },
    });
  }

  return result;
}

/** Campos da ficha disponíveis pra interpolar {nome}, {email}, ... no passo. */
function contactValues(contact: {
  name: string;
  email: string;
  phone: string;
  customFields: unknown;
}): Record<string, unknown> {
  const custom = (contact.customFields as Record<string, unknown>) ?? {};
  return {
    ...custom,
    nome: contact.name,
    name: contact.name,
    email: contact.email,
    telefone: contact.phone,
    phone: contact.phone,
  };
}
