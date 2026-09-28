import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// CRM de contatos — a ficha da pessoa, no nível da organização.
//
// `Contact` é a PESSOA. `ContactChannel` é onde falar com ela (telefone no
// WhatsApp, igsid no Instagram, chat_id no Telegram). Essa separação é o que
// permite a mesma pessoa em dois canais ser uma ficha só, e é o que dá a
// Empresa e Negócio um lugar onde se pendurar sem ficarem presos a um agente.
//
// O bloco de Captura continua alimentando isso sozinho: variável cujo nome
// bate com CAPTURE_FIELD_MAP vira coluna, o resto vira campo livre.
// ---------------------------------------------------------------------------

const CAPTURE_FIELD_MAP: Record<string, "name" | "email" | "phone"> = {
  nome: "name",
  name: "name",
  nomecompleto: "name",
  fullname: "name",
  primeironome: "name",
  firstname: "name",
  cliente: "name",
  email: "email",
  mail: "email",
  emailcontato: "email",
  telefone: "phone",
  phone: "phone",
  celular: "phone",
  whatsapp: "phone",
  fone: "phone",
  numero: "phone",
  telefonecontato: "phone",
};

export function normalizeKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function mapCaptureField(key: string): "name" | "email" | "phone" | null {
  return CAPTURE_FIELD_MAP[normalizeKey(key)] ?? null;
}

function isInternalVar(key: string): boolean {
  return key.startsWith("__");
}

const PHONE_CHANNELS = new Set(["whatsapp_qr", "whatsapp_meta"]);

/** Só dígitos, sem o 55 do país, pra comparar "11 99999-8888" com "5511999998888". */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) return digits.slice(2);
  return digits;
}

export interface SyncContactInput {
  agentId: string;
  channel: string;
  externalId: string;
  conversationId: string;
  variables: Record<string, unknown>;
  isInbound: boolean;
}

/**
 * Cria ou atualiza a ficha a partir do estado da conversa e amarra a conversa
 * nela. Chamado no finish() do motor, toda rodada.
 *
 * A resolução tem três degraus, nessa ordem:
 *   1. Já existe um ContactChannel pra (agente, canal, id externo)? Usa.
 *   2. O fluxo capturou e-mail ou telefone que já existe na org? Reaproveita
 *      a ficha e só pendura o canal novo — é a deduplicação de verdade.
 *   3. Nada bateu: cria ficha e canal.
 *
 * Nunca apaga dado bom com vazio: o fluxo pode rodar de novo e passar por
 * uma captura que a pessoa pulou.
 */
export async function syncContactFromConversation(input: SyncContactInput): Promise<string | null> {
  const { agentId, channel, externalId, conversationId, variables, isInbound } = input;
  if (!externalId) return null;

  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { orgId: true } });
  if (!agent) return null;
  const orgId = agent.orgId;

  const fields: { name?: string; email?: string; phone?: string } = {};
  const custom: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(variables)) {
    if (isInternalVar(key)) continue;
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === "") continue;

    const mapped = mapCaptureField(key);
    if (mapped) fields[mapped] = String(value);
    else custom[key] = value;
  }

  if (!fields.phone && PHONE_CHANNELS.has(channel)) {
    const digits = externalId.replace(/\D/g, "");
    if (digits.length >= 10) fields.phone = digits;
  }

  const now = new Date();

  // 1) Canal já conhecido.
  const existingChannel = await prisma.contactChannel.findUnique({
    where: { agentId_channel_externalId: { agentId, channel, externalId } },
    include: { contact: true },
  });

  let contactId: string;

  if (existingChannel) {
    contactId = existingChannel.contactId;
    const current = existingChannel.contact;
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        name: fields.name || current.name,
        email: fields.email || current.email,
        phone: fields.phone || current.phone,
        customFields: {
          ...(current.customFields as Record<string, unknown>),
          ...custom,
        } as Prisma.InputJsonValue,
        lastSeenAt: isInbound ? now : current.lastSeenAt,
      },
    });
  } else {
    // 2) Mesma pessoa, canal novo: procura por e-mail ou telefone na org.
    const phoneKey = normalizePhone(fields.phone ?? "");
    const dedupe = await prisma.contact.findFirst({
      where: {
        orgId,
        OR: [
          ...(fields.email ? [{ email: { equals: fields.email, mode: "insensitive" as const } }] : []),
          ...(phoneKey.length >= 10 ? [{ phone: { contains: phoneKey } }] : []),
        ],
      },
    });

    if (dedupe) {
      contactId = dedupe.id;
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          name: fields.name || dedupe.name,
          email: fields.email || dedupe.email,
          phone: fields.phone || dedupe.phone,
          customFields: {
            ...(dedupe.customFields as Record<string, unknown>),
            ...custom,
          } as Prisma.InputJsonValue,
          lastSeenAt: isInbound ? now : dedupe.lastSeenAt,
        },
      });
    } else {
      // 3) Pessoa nova.
      const created = await prisma.contact.create({
        data: {
          orgId,
          name: fields.name ?? "",
          email: fields.email ?? "",
          phone: fields.phone ?? "",
          customFields: custom as Prisma.InputJsonValue,
          source: "conversa",
          lastSeenAt: now,
        },
      });
      contactId = created.id;
    }

    await prisma.contactChannel.create({ data: { contactId, agentId, channel, externalId } });
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { contactRecordId: contactId },
  });

  return contactId;
}

/**
 * Aplica uma etiqueta e, se ela for gatilho de sequência ativa, inscreve o
 * contato. É aqui que mora o auto-enrollment do drip, num lugar só, pra valer
 * igual seja a etiqueta aplicada pelo fluxo, pela tela ou pela API.
 */
export async function applyTag(contactId: string, tagId: string): Promise<void> {
  const existing = await prisma.contactTag.findUnique({
    where: { contactId_tagId: { contactId, tagId } },
  });
  if (existing) return;

  await prisma.contactTag.create({ data: { contactId, tagId } });

  const { enrollContactByTag } = await import("@/lib/server/sequences");
  await enrollContactByTag(contactId, tagId);
}

export async function removeTag(contactId: string, tagId: string): Promise<void> {
  await prisma.contactTag.deleteMany({ where: { contactId, tagId } });
}

export async function optOutContact(contactId: string): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: { optIn: false, optOutAt: new Date() },
  });
  await prisma.sequenceEnrollment.updateMany({
    where: { contactId, status: "active" },
    data: { status: "stopped", stoppedReason: "opt-out" },
  });
}
