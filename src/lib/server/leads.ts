import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { normalizarCapturados } from "@/lib/server/custom-fields";
import { validarEmail, validarNome, normalizarTelefoneBR } from "@/lib/capture-validation";
import { mapCaptureField, normalizePhone } from "@/lib/server/contacts";

// Lead = Contact com leadStage. Todo lugar que lê ou grava lead (tela, API
// pública, motor) passa por aqui, pra regra ser uma só.

export const LEAD_STAGES = ["novo", "contatado", "qualificado", "ganho", "perdido"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const isLeadStage = (s: unknown): s is LeadStage => typeof s === "string" && (LEAD_STAGES as readonly string[]).includes(s);

export async function marcarComoLead(contactId: string, origem: { agentId: string; channel: string }): Promise<void> {
  await prisma.contact.updateMany({
    where: { id: contactId, leadStage: null },
    data: { leadStage: "novo", leadAt: new Date(), leadAgentId: origem.agentId, leadChannel: origem.channel },
  });
}

interface ContatoComConversa {
  id: string;
  name: string;
  email: string;
  phone: string;
  customFields: unknown;
  leadStage: string | null;
  leadAt: Date | null;
  leadAgentId: string | null;
  leadChannel: string | null;
  updatedAt: Date;
  conversations: {
    id: string;
    agentId: string;
    channel: string;
    contactId: string;
    agent: { name: string };
    messages: { text: string; role: string }[];
  }[];
}

export interface LeadDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage: string;
  agentId: string | null;
  agentName: string | null;
  channel: string | null;
  externalId: string | null;
  conversationId: string | null;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastMessage: { text: string; role: string } | null;
}

export const INCLUDE_LEAD = {
  conversations: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
    include: { agent: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" as const }, take: 1 } },
  },
};

export function serializarLead(c: ContatoComConversa): LeadDto {
  const conv = c.conversations[0];
  const custom = (c.customFields ?? {}) as Record<string, unknown>;
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    stage: c.leadStage ?? "novo",
    agentId: c.leadAgentId ?? conv?.agentId ?? null,
    agentName: conv?.agent.name ?? null,
    channel: c.leadChannel ?? conv?.channel ?? null,
    externalId: conv?.contactId ?? null,
    conversationId: conv?.id ?? null,
    fields: {
      ...(c.name ? { nome: c.name } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.phone ? { telefone: c.phone } : {}),
      ...custom,
    },
    createdAt: (c.leadAt ?? c.updatedAt).toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lastMessage: conv?.messages[0] ? { text: conv.messages[0].text, role: conv.messages[0].role } : null,
  };
}

export async function listarLeads(orgId: string, opts: { stage?: string | null; limit?: number } = {}): Promise<LeadDto[]> {
  const rows = await prisma.contact.findMany({
    where: { orgId, leadStage: opts.stage && isLeadStage(opts.stage) ? opts.stage : { not: null } },
    include: INCLUDE_LEAD,
    orderBy: { leadAt: "desc" },
    take: Math.min(Math.max(opts.limit ?? 200, 1), 500),
  });
  return rows.map((r) => serializarLead(r as unknown as ContatoComConversa));
}

export async function buscarLead(orgId: string, contactId: string): Promise<LeadDto | null> {
  const row = await prisma.contact.findFirst({ where: { id: contactId, orgId, leadStage: { not: null } }, include: INCLUDE_LEAD });
  return row ? serializarLead(row as unknown as ContatoComConversa) : null;
}

/** id de contato, ou id antigo de conversa (API v1 antes da Fase 2) → id do contato. */
export async function resolverIdDoLead(orgId: string, id: string): Promise<string | null> {
  const contato = await prisma.contact.findFirst({ where: { id, orgId }, select: { id: true } });
  if (contato) return contato.id;
  const conversa = await prisma.conversation.findFirst({
    where: { id, agent: { orgId } },
    select: { contactRecordId: true },
  });
  return conversa?.contactRecordId ?? null;
}

export type ResultadoLead = { contactId: string } | { error: string; fieldErrors?: Record<string, string> };

/**
 * Lead que chega de fora do fluxo (tela, API pública, n8n): valida, deduplica
 * por e-mail/telefone na org e marca como lead. `fields` aceita nome/email/
 * telefone (e sinônimos) e qualquer outro campo, que vira campo livre.
 */
export async function salvarLeadExterno(
  orgId: string,
  input: { agentId: string; fields: Record<string, unknown>; stage?: unknown },
  source: "api" | "manual"
): Promise<ResultadoLead> {
  if (input.stage !== undefined && !isLeadStage(input.stage)) {
    return { error: `stage precisa ser um de: ${LEAD_STAGES.join(", ")}.` };
  }
  const agent = await prisma.agent.findFirst({ where: { id: input.agentId, orgId }, select: { id: true } });
  if (!agent) return { error: "agentId não encontrado nessa organização." };

  const base: { name?: string; email?: string; phone?: string } = {};
  const custom: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};

  for (const [key, bruto] of Object.entries(input.fields ?? {})) {
    if (key.startsWith("__") || bruto === undefined || bruto === null || bruto === "") continue;
    const alvo = mapCaptureField(key);
    const texto = String(bruto);
    if (alvo === "name") {
      const v = validarNome(texto);
      if (v) base.name = v;
      else fieldErrors[key] = "Nome inválido.";
    } else if (alvo === "email") {
      const v = validarEmail(texto);
      if (v) base.email = v;
      else fieldErrors[key] = "E-mail inválido.";
    } else if (alvo === "phone") {
      const v = normalizarTelefoneBR(texto);
      if (v) base.phone = v;
      else fieldErrors[key] = "Telefone inválido.";
    } else {
      custom[key] = bruto;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { error: "Dados inválidos.", fieldErrors };

  await normalizarCapturados(orgId, custom);
  const stage = (input.stage as string | undefined) ?? "novo";
  const telefone = normalizePhone(base.phone ?? "");

  const existente =
    base.email || telefone.length >= 10
      ? await prisma.contact.findFirst({
          where: {
            orgId,
            OR: [
              ...(base.email ? [{ email: { equals: base.email, mode: "insensitive" as const } }] : []),
              ...(telefone.length >= 10 ? [{ phone: { contains: telefone.slice(-10) } }] : []),
            ],
          },
        })
      : null;

  if (existente) {
    await prisma.contact.update({
      where: { id: existente.id },
      data: {
        name: base.name || existente.name,
        email: base.email || existente.email,
        phone: base.phone || existente.phone,
        customFields: { ...((existente.customFields ?? {}) as Record<string, unknown>), ...custom } as Prisma.InputJsonValue,
        ...(existente.leadStage
          ? input.stage !== undefined
            ? { leadStage: stage }
            : {}
          : { leadStage: stage, leadAt: new Date(), leadAgentId: input.agentId, leadChannel: source }),
      },
    });
    return { contactId: existente.id };
  }

  const criado = await prisma.contact.create({
    data: {
      orgId,
      name: base.name ?? "",
      email: base.email ?? "",
      phone: base.phone ?? "",
      customFields: custom as Prisma.InputJsonValue,
      source,
      leadStage: stage,
      leadAt: new Date(),
      leadAgentId: input.agentId,
      leadChannel: source,
    },
  });
  return { contactId: criado.id };
}
