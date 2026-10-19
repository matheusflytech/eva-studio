import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { conferirReferencias } from "@/lib/server/api-validacao";
import { aplicarValores, carregarDefinicoes } from "@/lib/server/custom-fields";
import { registrarMudancaDeEtapa, type OrigemDoMovimento } from "@/lib/server/stage-events";

// ---------------------------------------------------------------------------
// Ações de CRM (§24 do CHATBOT_ENGINE.md).
//
// Um lugar só para criar negócio, mover etapa, criar tarefa e registrar nota,
// porque essas ações têm TRÊS chamadores diferentes e não podem divergir:
//
//   1. Blocos do Builder (caminho determinístico — você decide)
//   2. Ferramentas do Agente de IA (caminho não determinístico — o modelo decide)
//   3. Telas de Negócios e Tarefas (a pessoa decide)
//
// Se cada um tivesse a própria lógica, "mover etapa" atualizaria a
// probabilidade em um caminho e não no outro.
// ---------------------------------------------------------------------------

/** Etapas do funil padrão, criadas na primeira vez que a org usa o CRM. */
const DEFAULT_STAGES: { name: string; probability: number; type: string }[] = [
  { name: "Novo", probability: 10, type: "open" },
  { name: "Qualificado", probability: 30, type: "open" },
  { name: "Proposta", probability: 60, type: "open" },
  { name: "Negociação", probability: 80, type: "open" },
  { name: "Ganho", probability: 100, type: "won" },
  { name: "Perdido", probability: 0, type: "lost" },
];

/**
 * Garante que a org tem pelo menos um funil. Chamado sob demanda em vez de no
 * cadastro da org: assim quem nunca usar o CRM não ganha tabela populada à toa,
 * e org antiga (criada antes disso existir) funciona sem migração.
 */
export async function ensureDefaultPipeline(orgId: string) {
  const existing = await primeiroFunil(prisma, orgId);
  if (existing) return existing;

  // Duas telas abertas ao mesmo tempo chegam aqui juntas e cada uma criaria
  // o seu "Vendas". A trava por org serializa; quem chega depois reencontra
  // o funil que o primeiro criou.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
    const criado = await primeiroFunil(tx, orgId);
    if (criado) return criado;
    return tx.pipeline.create({
      data: {
        orgId,
        name: "Vendas",
        isDefault: true,
        stages: { create: DEFAULT_STAGES.map((s, i) => ({ ...s, position: i })) },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    });
  });
}

function primeiroFunil(db: Prisma.TransactionClient, orgId: string) {
  return db.pipeline.findFirst({
    where: { orgId },
    include: { stages: { orderBy: { position: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });
}

/**
 * Erro de entrada nas ações de CRM (id de outra org, etapa de outro funil).
 * As rotas convertem em resposta HTTP; o motor do fluxo trata como falha do
 * bloco, como qualquer outro erro.
 */
export class ErroDeCrm extends Error {
  constructor(
    message: string,
    public status: 400 | 404 = 400
  ) {
    super(message);
    this.name = "ErroDeCrm";
  }
}

/** Status da mensagem de conferirReferencias: id malformado é 400, inexistente na org é 404. */
export function statusDaReferencia(mensagem: string): 400 | 404 {
  return mensagem.endsWith("inválido.") ? 400 : 404;
}

/** Tipos de tarefa que as telas e o Builder oferecem. */
export const TIPOS_DE_TAREFA = ["ligar", "email", "reuniao", "outro"] as const;

/**
 * Etapa onde um negócio novo entra, sempre dentro da org. Sem etapa, cai na
 * primeira aberta do funil informado (ou do padrão).
 */
export async function resolverEtapaDeEntrada(orgId: string, pipelineId?: string, stageId?: string) {
  if (!stageId) {
    let funilId = pipelineId;
    if (funilId) {
      const funil = await prisma.pipeline.findFirst({ where: { id: funilId, orgId }, select: { id: true } });
      if (!funil) throw new ErroDeCrm("Funil não encontrado.", 404);
    } else {
      funilId = (await ensureDefaultPipeline(orgId)).id;
    }
    const stages = await prisma.pipelineStage.findMany({
      where: { pipelineId: funilId },
      orderBy: { position: "asc" },
    });
    stageId = stages.find((s) => s.type === "open")?.id ?? stages[0]?.id;
  }
  if (!stageId) throw new ErroDeCrm("Funil sem etapas configuradas.");

  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId, pipeline: { orgId } } });
  if (!stage) throw new ErroDeCrm("Etapa não encontrada.", 404);
  if (pipelineId && stage.pipelineId !== pipelineId) throw new ErroDeCrm("Etapa de outro funil.");
  return stage;
}

export interface CreateDealInput {
  orgId: string;
  name: string;
  pipelineId?: string;
  stageId?: string;
  contactId?: string | null;
  companyId?: string | null;
  ownerId?: string | null;
  amountCents?: number;
  currency?: string;
  description?: string;
  expectedClosingAt?: Date | null;
  /** Valores dos campos personalizados, por chave. Chave desconhecida ou valor inválido é descartado. */
  customFields?: Record<string, unknown>;
  /** Quem criou, para o histórico de etapas. Padrão: usuario. */
  origem?: OrigemDoMovimento;
}

/**
 * Cria um negócio. Sem funil/etapa informados, cai no funil padrão e na
 * primeira etapa aberta — é o que permite o bloco do Builder funcionar mesmo
 * antes de alguém ter configurado funil nenhum.
 *
 * A probabilidade é herdada da etapa: é o que faz sair previsão ponderada sem
 * ninguém digitar número.
 */
export async function createDeal(input: CreateDealInput) {
  // Tudo conferido contra a org aqui dentro, não só na rota: o motor do fluxo
  // também chama isto, com ids que vieram da configuração do bloco.
  const stage = await resolverEtapaDeEntrada(input.orgId, input.pipelineId, input.stageId);
  const stageId = stage.id;
  const erroRef = await conferirReferencias(input.orgId, {
    contactId: input.contactId,
    companyId: input.companyId,
    ownerId: input.ownerId,
  });
  if (erroRef) throw new ErroDeCrm(erroRef, statusDaReferencia(erroRef));

  // Campos personalizados: o que não bate com a definição é descartado em vez
  // de derrubar a criação. O motor do fluxo chama isto no meio de uma conversa
  // e não pode falhar porque o cliente digitou texto num campo de número.
  let customFields: Record<string, unknown> = {};
  if (input.customFields && Object.keys(input.customFields).length > 0) {
    const defs = await carregarDefinicoes(input.orgId, "deal", stage.pipelineId);
    for (const [k, v] of Object.entries(input.customFields)) {
      const r = aplicarValores(defs, customFields, { [k]: v });
      if (r.ok) customFields = r.valores;
    }
  }

  // Novo card entra no topo da coluna.
  const top = await prisma.deal.aggregate({
    where: { stageId },
    _min: { position: true },
  });

  const deal = await prisma.deal.create({
    data: {
      orgId: input.orgId,
      pipelineId: stage.pipelineId,
      stageId,
      name: input.name,
      description: input.description ?? "",
      amountCents: Math.max(0, Math.round(input.amountCents ?? 0)),
      currency: input.currency ?? "BRL",
      probability: stage.probability,
      stageSince: new Date(),
      companyId: input.companyId ?? null,
      ownerId: input.ownerId ?? null,
      expectedClosingAt: input.expectedClosingAt ?? null,
      closedAt: stage.type === "open" ? null : new Date(),
      customFields: customFields as object,
      position: (top._min.position ?? 0) - 1,
      contacts: input.contactId ? { create: { contactId: input.contactId } } : undefined,
    },
  });

  await registrarMudancaDeEtapa({
    orgId: deal.orgId,
    dealId: deal.id,
    pipelineId: deal.pipelineId,
    fromStageId: null,
    toStageId: deal.stageId,
    origem: input.origem,
  });

  return deal;
}

/**
 * Move um negócio de etapa. Atualiza probabilidade e, quando a etapa é de
 * fechamento, carimba `closedAt` — sem isso não existe tempo de ciclo nem
 * taxa de conversão.
 */
export async function moveDealStage(
  dealId: string,
  stageId: string,
  lostReason?: string,
  origem: OrigemDoMovimento = "usuario"
) {
  const antes = await prisma.deal.findUnique({ where: { id: dealId }, select: { stageId: true, orgId: true } });
  if (!antes) throw new ErroDeCrm("Negócio não encontrado.", 404);
  // Etapa de outra org nunca: o id pode vir do corpo da requisição ou da
  // configuração de um bloco.
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId, pipeline: { orgId: antes.orgId } } });
  if (!stage) throw new ErroDeCrm("Etapa não encontrada.", 404);

  const closing = stage.type === "won" || stage.type === "lost";

  const atualizado = await prisma.deal.update({
    where: { id: dealId },
    data: {
      stageId,
      pipelineId: stage.pipelineId,
      probability: stage.probability,
      // Zera o relógio da etapa: é isto que faz "parado há 7 dias" significar
      // alguma coisa. updatedAt não serve, porque qualquer edição no negócio
      // o move e a régua de recuperação nunca dispararia.
      stageSince: new Date(),
      closedAt: closing ? new Date() : null,
      lostReason: stage.type === "lost" ? lostReason ?? "" : "",
    },
  });

  await registrarMudancaDeEtapa({
    orgId: atualizado.orgId,
    dealId,
    pipelineId: atualizado.pipelineId,
    fromStageId: antes.stageId,
    toStageId: stageId,
    origem,
  });

  return atualizado;
}

/** Negócio aberto mais recente do contato — usado pelos blocos que agem "no negócio da conversa". */
export async function findOpenDealForContact(contactId: string) {
  return prisma.deal.findFirst({
    where: {
      contacts: { some: { contactId } },
      closedAt: null,
      archivedAt: null,
    },
    include: { stage: true, pipeline: true },
    orderBy: { updatedAt: "desc" },
  });
}

export interface CreateTaskInput {
  orgId: string;
  text: string;
  type?: string;
  contactId?: string | null;
  dealId?: string | null;
  assignedToId?: string | null;
  dueAt?: Date | null;
}

export async function createTask(input: CreateTaskInput) {
  return prisma.task.create({
    data: {
      orgId: input.orgId,
      text: input.text,
      type: input.type ?? "ligar",
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      assignedToId: input.assignedToId ?? null,
      dueAt: input.dueAt ?? null,
    },
  });
}

export async function addNote(input: {
  orgId: string;
  text: string;
  contactId?: string | null;
  dealId?: string | null;
  authorId?: string | null;
}) {
  return prisma.note.create({
    data: {
      orgId: input.orgId,
      text: input.text,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      authorId: input.authorId ?? null,
    },
  });
}

/**
 * Converte prazo relativo em data. O bloco do Builder pede "+2 dias" porque
 * numa automação a data absoluta nunca serve: o fluxo roda hoje, amanhã e no
 * mês que vem.
 *
 * Aceita "2d", "3h", "30m", "2 dias", "3 horas", "30 minutos".
 */
export function parseRelativeDue(expression: string): Date | null {
  const raw = (expression ?? "").trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/^\+?\s*(\d+)\s*(m|min|minuto|minutos|h|hora|horas|d|dia|dias)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2] ?? "d";
  const ms =
    unit.startsWith("m") && unit !== "mes"
      ? amount * 60_000
      : unit.startsWith("h")
        ? amount * 3_600_000
        : amount * 86_400_000;

  return new Date(Date.now() + ms);
}

/** Resumo do CRM de um contato — alimenta o bloco "Buscar no CRM". */
export async function lookupCrmForContact(contactId: string) {
  const [contact, deal, openTasks] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      include: { company: true, tags: { include: { tag: true } } },
    }),
    findOpenDealForContact(contactId),
    prisma.task.count({ where: { contactId, doneAt: null } }),
  ]);

  return {
    contact,
    deal,
    openTasks,
  };
}

/**
 * Preenche campos personalizados do negócio. Tolerante de propósito: valor que
 * não bate com o tipo do campo é descartado e devolvido em `erros`, nunca
 * lançado. É chamado no meio de uma conversa, e o cliente digitar "bastante"
 * num campo de número não pode derrubar o atendimento.
 */
export async function preencherCamposDoNegocio(orgId: string, dealId: string, entrada: Record<string, unknown>) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId }, select: { pipelineId: true, customFields: true } });
  if (!deal) return { aplicados: 0, erros: ["Negócio não encontrado."] };
  const defs = await carregarDefinicoes(orgId, "deal", deal.pipelineId);
  return gravarCampos(defs, (deal.customFields ?? {}) as Record<string, unknown>, entrada, (valores) =>
    prisma.deal.update({ where: { id: dealId }, data: { customFields: valores as object } })
  );
}

export async function preencherCamposDoContato(orgId: string, contactId: string, entrada: Record<string, unknown>) {
  const contato = await prisma.contact.findFirst({ where: { id: contactId, orgId }, select: { customFields: true } });
  if (!contato) return { aplicados: 0, erros: ["Contato não encontrado."] };
  const defs = await carregarDefinicoes(orgId, "contact");
  return gravarCampos(defs, (contato.customFields ?? {}) as Record<string, unknown>, entrada, (valores) =>
    prisma.contact.update({ where: { id: contactId }, data: { customFields: valores as object } })
  );
}

async function gravarCampos(
  defs: Awaited<ReturnType<typeof carregarDefinicoes>>,
  atuais: Record<string, unknown>,
  entrada: Record<string, unknown>,
  gravar: (valores: Record<string, unknown>) => Promise<unknown>
) {
  let valores = atuais;
  let aplicados = 0;
  const erros: string[] = [];
  const conhecidas = new Set(defs.map((d) => d.key));
  for (const [chave, bruto] of Object.entries(entrada)) {
    if (!conhecidas.has(chave)) continue;
    const r = aplicarValores(defs, valores, { [chave]: bruto });
    if (r.ok) {
      valores = r.valores;
      aplicados += 1;
    } else erros.push(...r.erros);
  }
  if (aplicados > 0) await gravar(valores);
  return { aplicados, erros };
}
