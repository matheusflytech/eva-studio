import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Última atividade do negócio — o relógio do "parado" (skill
// crm-pipeline-kanban: tarefa concluída, nota, mensagem entrando ou saindo,
// edição de campo zeram o relógio). Guardada em eva_studio_deal_activity, uma
// linha por negócio, sempre puxada para frente (GREATEST).
//
// Nunca derruba quem chamou: sem a tabela (SQL ainda não aplicado) ou com o
// banco ocupado, a atividade se perde e o negócio só parece parado antes da
// hora — o mesmo comportamento de antes das regras de etapa.
// ---------------------------------------------------------------------------

/** Marca atividade agora (ou em `quando`) nos negócios informados. */
export async function tocarAtividade(dealIds: string | string[], quando: Date = new Date()): Promise<void> {
  const ids = [...new Set((Array.isArray(dealIds) ? dealIds : [dealIds]).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await prisma.$executeRaw`
      INSERT INTO "eva_studio_deal_activity" ("dealId", "orgId", "lastActivityAt")
      SELECT d."id", d."orgId", (${quando.toISOString()}::timestamptz AT TIME ZONE 'UTC') FROM "eva_studio_deals" d WHERE d."id" IN (${Prisma.join(ids)})
      ON CONFLICT ("dealId") DO UPDATE
        SET "lastActivityAt" = GREATEST("eva_studio_deal_activity"."lastActivityAt", EXCLUDED."lastActivityAt")`;
  } catch (e) {
    console.warn("[atividade] não foi possível marcar a atividade do negócio", e instanceof Error ? e.message : e);
  }
}

/**
 * Atividade nos negócios ABERTOS dos contatos (nota só do contato, mensagem
 * numa conversa dele). Uma instrução só: acha os negócios e grava.
 */
export async function tocarAtividadeDosContatos(contactIds: string | string[], quando: Date = new Date()): Promise<void> {
  const ids = [...new Set((Array.isArray(contactIds) ? contactIds : [contactIds]).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await prisma.$executeRaw`
      INSERT INTO "eva_studio_deal_activity" ("dealId", "orgId", "lastActivityAt")
      SELECT DISTINCT d."id", d."orgId", (${quando.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        FROM "eva_studio_deal_contacts" dc
        JOIN "eva_studio_deals" d ON d."id" = dc."dealId"
       WHERE dc."contactId" IN (${Prisma.join(ids)}) AND d."closedAt" IS NULL AND d."archivedAt" IS NULL
      ON CONFLICT ("dealId") DO UPDATE
        SET "lastActivityAt" = GREATEST("eva_studio_deal_activity"."lastActivityAt", EXCLUDED."lastActivityAt")`;
  } catch (e) {
    console.warn("[atividade] não foi possível marcar a atividade pelos contatos", e instanceof Error ? e.message : e);
  }
}

/** Tarefa concluída: o negócio dela, ou os negócios abertos do contato dela. */
export async function tocarAtividadeDaTarefa(t: { dealId: string | null; contactId: string | null }, quando: Date = new Date()): Promise<void> {
  if (t.dealId) await tocarAtividade(t.dealId, quando);
  else if (t.contactId) await tocarAtividadeDosContatos(t.contactId, quando);
}

/** Mensagem entrou ou saiu numa conversa: atividade nos negócios abertos do contato dela. */
export async function tocarAtividadeDaConversa(conversationId: string, quando: Date = new Date()): Promise<void> {
  try {
    const c = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { contactRecordId: true, channel: true } });
    // Playground é teste interno, não atendimento.
    if (!c?.contactRecordId || c.channel === "playground") return;
    await tocarAtividadeDosContatos(c.contactRecordId, quando);
  } catch (e) {
    console.warn("[atividade] conversa sem negócio para marcar", e instanceof Error ? e.message : e);
  }
}

/** Última atividade de cada negócio (para o cartão). Sem a tabela: mapa vazio. */
export async function ultimaAtividadePorNegocio(dealIds: string[]): Promise<Map<string, Date>> {
  const mapa = new Map<string, Date>();
  if (dealIds.length === 0) return mapa;
  try {
    const linhas = await prisma.dealActivity.findMany({ where: { dealId: { in: dealIds } }, select: { dealId: true, lastActivityAt: true } });
    for (const l of linhas) mapa.set(l.dealId, l.lastActivityAt);
  } catch {
    // tabela ainda não existe: o relógio fica só na entrada da etapa
  }
  return mapa;
}

let tabelaConfirmada: boolean | null = null;

/** A tabela de atividade existe? (consultado uma vez por processo quando dá certo.) */
export async function atividadeDisponivel(): Promise<boolean> {
  if (tabelaConfirmada) return true;
  try {
    await prisma.dealActivity.findFirst({ select: { dealId: true } });
    tabelaConfirmada = true;
    return true;
  } catch {
    return false;
  }
}
