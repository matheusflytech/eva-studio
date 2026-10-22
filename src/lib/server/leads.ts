import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { normalizarCapturados } from "@/lib/server/custom-fields";
import { validarEmail, validarNome, normalizarTelefoneBR } from "@/lib/capture-validation";
import { mapCaptureField, normalizePhone } from "@/lib/server/contacts";
import { publicarEvento } from "@/lib/server/eventos/barramento";

// Lead = Contact com leadStage. Todo lugar que lê ou grava lead (tela, API
// pública, motor) passa por aqui, pra regra ser uma só.

export const LEAD_STAGES = ["novo", "contatado", "qualificado", "ganho", "perdido"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const isLeadStage = (s: unknown): s is LeadStage => typeof s === "string" && (LEAD_STAGES as readonly string[]).includes(s);

export async function marcarComoLead(contactId: string, origem: { agentId: string; channel: string }): Promise<void> {
  const r = await prisma.contact.updateMany({
    where: { id: contactId, leadStage: null },
    data: { leadStage: "novo", leadAt: new Date(), leadAgentId: origem.agentId, leadChannel: origem.channel },
  });
  if (r.count === 0) return;
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { orgId: true } });
  if (c) await publicarEvento({ orgId: c.orgId, tipo: "lead.captured", objeto: "contact", objetoId: contactId, dados: { agent_id: origem.agentId, channel: origem.channel } });
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
  /** Canal da última conversa (pode diferir de `channel`, que é a origem do lead). */
  conversationChannel: string | null;
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
    conversationChannel: conv?.channel ?? null,
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

export type ErroLead = { error: string; status: 400 | 404; fieldErrors?: Record<string, string> };
export type ResultadoLead = { contactId: string } | ErroLead;

const ERRO_STAGE = `stage precisa ser um de: ${LEAD_STAGES.join(", ")}.`;

/** Objeto simples (não array, não null). */
export function ehObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

type CamposValidados = { base: { name?: string; email?: string; phone?: string }; custom: Record<string, unknown> };

/**
 * Separa nome/e-mail/telefone (validados e normalizados) do resto, que vira
 * campo livre. Chave "__x", null, undefined e "" são ignorados.
 */
export function validarCamposDeLead(fields: Record<string, unknown>): CamposValidados | ErroLead {
  const base: CamposValidados["base"] = {};
  const custom: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};

  for (const [key, bruto] of Object.entries(fields ?? {})) {
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
  if (Object.keys(fieldErrors).length > 0) return { error: "Dados inválidos.", status: 400, fieldErrors };
  return { base, custom };
}

/**
 * Contato da org com o mesmo e-mail ou o mesmo telefone. O telefone é
 * comparado inteiro (DDD + número, sem o 55) — antes era `contains` dos 10
 * últimos dígitos, que juntava "11977776666" com "21977776666". Como o banco
 * guarda telefone em formatos diferentes ("+5511…", "5511…", "(11) 9…"), a
 * consulta só pré-filtra pelos 4 últimos dígitos e a comparação exata é aqui.
 */
async function acharContatoDuplicado(orgId: string, email: string | undefined, telefone: string) {
  if (email) {
    const porEmail = await prisma.contact.findFirst({ where: { orgId, email: { equals: email, mode: "insensitive" } } });
    if (porEmail) return porEmail;
  }
  if (telefone.length < 10) return null;
  const candidatos = await prisma.contact.findMany({
    where: { orgId, phone: { contains: telefone.slice(-4) } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return (candidatos ?? []).find((c) => normalizePhone(c.phone) === telefone) ?? null;
}

/**
 * Lead que chega de fora do fluxo (tela, API pública, n8n): valida, deduplica
 * por e-mail/telefone na org e marca como lead. `fields` aceita nome/email/
 * telefone (e sinônimos) e qualquer outro campo, que vira campo livre.
 */
export async function salvarLeadExterno(
  orgId: string,
  input: { agentId: unknown; fields: unknown; stage?: unknown },
  source: "api" | "manual"
): Promise<ResultadoLead> {
  if (typeof input.agentId !== "string" || !input.agentId.trim()) return { error: "agentId é obrigatório.", status: 400 };
  if (!ehObjeto(input.fields)) return { error: "fields precisa ser um objeto.", status: 400 };
  if (input.stage !== undefined && !isLeadStage(input.stage)) return { error: ERRO_STAGE, status: 400 };
  const agentId = input.agentId;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true } });
  if (!agent) return { error: "agentId não encontrado nessa organização.", status: 404 };

  const validados = validarCamposDeLead(input.fields);
  if ("error" in validados) return validados;
  const { base, custom } = validados;

  await normalizarCapturados(orgId, custom);
  const stage: LeadStage = isLeadStage(input.stage) ? input.stage : "novo";
  const telefone = normalizePhone(base.phone ?? "");
  const existente = await acharContatoDuplicado(orgId, base.email, telefone);

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
          : { leadStage: stage, leadAt: new Date(), leadAgentId: agentId, leadChannel: source }),
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
      leadAgentId: agentId,
      leadChannel: source,
    },
  });
  await publicarEvento({ orgId, tipo: "contact.created", objeto: "contact", objetoId: criado.id, dados: { source } });
  await publicarEvento({ orgId, tipo: "lead.captured", objeto: "contact", objetoId: criado.id, dados: { channel: source } });
  return { contactId: criado.id };
}

/**
 * Muda etapa e/ou mescla campos de um lead que já existe. `fields` passa pela
 * mesma validação da criação (nome/e-mail/telefone vão para as colunas, o
 * resto para customFields).
 */
export async function atualizarLead(
  orgId: string,
  contactId: string,
  input: { fields?: unknown; stage?: unknown }
): Promise<ResultadoLead> {
  if (input.stage === undefined && input.fields === undefined) {
    return { error: "Envie stage e/ou fields para atualizar.", status: 400 };
  }
  if (input.stage !== undefined && !isLeadStage(input.stage)) return { error: ERRO_STAGE, status: 400 };
  if (input.fields !== undefined && !ehObjeto(input.fields)) return { error: "fields precisa ser um objeto.", status: 400 };

  const atual = await prisma.contact.findFirst({ where: { id: contactId, orgId, leadStage: { not: null } } });
  if (!atual) return { error: "Lead não encontrado.", status: 404 };

  const data: Prisma.ContactUpdateInput = {};
  if (isLeadStage(input.stage)) data.leadStage = input.stage;
  if (ehObjeto(input.fields)) {
    const validados = validarCamposDeLead(input.fields);
    if ("error" in validados) return validados;
    const { base, custom } = validados;
    if (base.name) data.name = base.name;
    if (base.email) data.email = base.email;
    if (base.phone) data.phone = base.phone;
    if (Object.keys(custom).length > 0) {
      await normalizarCapturados(orgId, custom);
      data.customFields = { ...((atual.customFields ?? {}) as Record<string, unknown>), ...custom } as Prisma.InputJsonValue;
    }
  }

  await prisma.contact.update({ where: { id: atual.id }, data });
  return { contactId: atual.id };
}

/** Tira o contato da lista de leads. Contato, conversas e negócios continuam. */
export async function removerDosLeads(orgId: string, contactId: string): Promise<boolean> {
  const r = await prisma.contact.updateMany({
    where: { id: contactId, orgId, leadStage: { not: null } },
    data: { leadStage: null },
  });
  return r.count > 0;
}

/**
 * Formato da API pública /api/v1/leads. Mantém as chaves de antes da Fase 2
 * (id, agentId, contactId, stage, fields, createdAt, updatedAt) — `id` agora
 * é o id do contato e `contactId` é o identificador externo da última
 * conversa (ex. "site-123", número do WhatsApp; null se não houver) — e
 * acrescenta name/email/phone/channel/conversationId.
 */
export function serializarLeadPublico(l: LeadDto) {
  return {
    id: l.id,
    agentId: l.agentId,
    contactId: l.externalId,
    stage: l.stage,
    fields: l.fields,
    name: l.name,
    email: l.email,
    phone: l.phone,
    channel: l.channel,
    conversationId: l.conversationId,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}
