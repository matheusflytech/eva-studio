import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, Task } from "@/generated/prisma/client";
import { ctxPode, type SessionContext } from "@/lib/server/permissions";
import { noEscopo } from "@/lib/server/escopo-dados";
import { conferirReferencias } from "@/lib/server/api-validacao";
import { addNote, createTask, findOpenDealForContact } from "@/lib/server/crm";
import { tocarAtividadeDaTarefa } from "@/lib/server/atividade-do-negocio";
import { gravarDetalhes, lerDetalhes, type DetalheDaTarefa } from "@/lib/server/tarefas-detalhes";
import { ehDiaTodo, tarefaEstaAtrasada } from "@/lib/tarefas/agrupar";
import { calcularAdiamento, empurrarPrevisao, type OpcaoDeAdiar } from "@/lib/tarefas/adiar";
import { textoDoResultado, type PedidoDeConclusao } from "@/lib/tarefas/conclusao";
import { resolverVisao, responsaveisDaVisao, tarefaNoEscopo, type VisaoDeTarefas } from "@/lib/tarefas/escopo";
import { interpretarQuickAdd, type QuickAdd } from "@/lib/tarefas/quick-add";
import { diaEmSP, noDia, proximoDiaDaSemana } from "@/lib/tarefas/calendario";
import {
  DECISOES,
  ORIGENS,
  PRIORIDADES,
  RESULTADOS,
  duracaoPadrao,
  tipoParaExibir,
  type DecisaoDoProximoPasso,
  type OrigemDaTarefa,
  type Prioridade,
  type ResultadoDaTarefa,
} from "@/lib/tarefas/tipos";
import type { TarefaDaTela } from "@/lib/tarefas/tela";

// ---------------------------------------------------------------------------
// Tarefas no servidor: lista com Minhas/Equipe/Todas, conclusão com próximo
// passo obrigatório, adiar (com previsão do negócio), ações em massa e quick
// add. A parte pura (datas, grupos, score, parser) mora em src/lib/tarefas.
//
// Escopo: o teto é o escopo de NEGÓCIOS do papel (ver src/lib/tarefas/escopo.ts).
// Tarefa fora do escopo responde 404 (não confirma que existe).
// ---------------------------------------------------------------------------

export type CtxDeTarefas = Pick<SessionContext, "userId" | "orgId" | "escopo" | "role" | "permissoes">;

export class ErroDeTarefa extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 | 422 = 400,
    public codigo?: string
  ) {
    super(message);
  }
}

/** Colegas de equipe da pessoa neste contrato (ela não entra). */
export async function colegasDeEquipe(ctx: Pick<CtxDeTarefas, "orgId" | "userId">): Promise<string[]> {
  const linhas = await prisma.teamMember.findMany({
    where: { team: { orgId: ctx.orgId, members: { some: { userId: ctx.userId } } } },
    select: { userId: true },
  });
  return [...new Set(linhas.map((l) => l.userId))].filter((id) => id !== ctx.userId);
}

async function colegasSePrecisar(ctx: CtxDeTarefas): Promise<string[]> {
  return ctx.escopo?.negocios === "equipe" ? colegasDeEquipe(ctx) : [];
}

/** Tarefa do contrato e dentro do escopo; senão null. */
export async function carregarTarefaVisivel(ctx: CtxDeTarefas, id: string): Promise<Task | null> {
  const task = await prisma.task.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!task) return null;
  const escopo = ctx.escopo?.negocios;
  if (!escopo || escopo === "todos") return task;
  return tarefaNoEscopo(task.assignedToId, escopo, ctx.userId, await colegasSePrecisar(ctx)) ? task : null;
}

// ── Serialização ────────────────────────────────────────────────────────────

export const INCLUDE_DA_TELA = {
  contact: { select: { id: true, name: true, phone: true, email: true } },
  deal: { select: { id: true, name: true, amountCents: true, expectedClosingAt: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

export type TarefaComVinculos = Prisma.TaskGetPayload<{ include: typeof INCLUDE_DA_TELA }>;

/** Conversa de WhatsApp mais recente de cada contato (ação "Abrir conversa"). */
export async function conversasDeWhatsApp(orgId: string, contactIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const ids = [...new Set(contactIds.filter(Boolean))];
  if (ids.length === 0) return mapa;
  const conversas = await prisma.conversation.findMany({
    where: { contactRecordId: { in: ids }, agent: { orgId }, channel: { in: ["whatsapp_meta", "whatsapp_qr"] } },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, contactRecordId: true },
    take: 500,
  });
  for (const c of conversas) if (c.contactRecordId && !mapa.has(c.contactRecordId)) mapa.set(c.contactRecordId, c.id);
  return mapa;
}

function umDe<T extends string>(lista: readonly T[], v: unknown, padrao: T): T {
  return typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : padrao;
}

export function paraTela(t: TarefaComVinculos, d: DetalheDaTarefa | undefined, conversaId: string | null, agora: Date): TarefaDaTela {
  const diaTodo = ehDiaTodo(t.dueAt, d?.allDay);
  return {
    id: t.id,
    type: tipoParaExibir(t.type),
    text: t.text,
    dueAt: t.dueAt?.toISOString() ?? null,
    doneAt: t.doneAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    diaTodo,
    prioridade: umDe<Prioridade>(PRIORIDADES, d?.priority, "normal"),
    origem: umDe<OrigemDaTarefa>(ORIGENS, d?.origin, "manual"),
    duracaoMin: d?.durationMin ?? duracaoPadrao(t.type),
    resultado: d?.outcome ? umDe<ResultadoDaTarefa>(RESULTADOS, d.outcome, "outro") : null,
    nota: d?.outcomeNote ?? null,
    decisao: d?.nextStepDecision ? umDe<DecisaoDoProximoPasso>(DECISOES, d.nextStepDecision, "sem_proximo") : null,
    adiada: d?.snoozedCount ?? 0,
    overdue: tarefaEstaAtrasada({ dueAt: t.dueAt, doneAt: t.doneAt, diaTodo }, agora),
    contact: t.contact ? { id: t.contact.id, name: t.contact.name, phone: t.contact.phone, email: t.contact.email } : null,
    conversaId,
    deal: t.deal
      ? { id: t.deal.id, name: t.deal.name, amountCents: t.deal.amountCents, expectedClosingAt: t.deal.expectedClosingAt?.toISOString() ?? null }
      : null,
    assignedTo: t.assignedTo,
  };
}

/** Tarefas (com vínculos) → formato da tela, com detalhes e conversa do contato. */
export async function serializarTarefas(orgId: string, tarefas: TarefaComVinculos[], agora = new Date()): Promise<TarefaDaTela[]> {
  const [{ mapa }, conversas] = await Promise.all([
    lerDetalhes(tarefas.map((t) => t.id)),
    conversasDeWhatsApp(orgId, tarefas.map((t) => t.contactId ?? "")),
  ]);
  return tarefas.map((t) => paraTela(t, mapa.get(t.id), t.contactId ? conversas.get(t.contactId) ?? null : null, agora));
}

// ── Lista ───────────────────────────────────────────────────────────────────

export interface FiltroDaLista {
  visao?: string | null;
  status?: string | null;
  limite?: number;
}

export async function listarTarefas(ctx: CtxDeTarefas, filtro: FiltroDaLista): Promise<{ visao: VisaoDeTarefas; tarefas: TarefaDaTela[] }> {
  const visao = resolverVisao(filtro.visao, ctx.escopo?.negocios);
  const colegas = visao === "equipe" ? await colegasDeEquipe(ctx) : [];
  const responsaveis = responsaveisDaVisao(visao, ctx.userId, colegas);
  const where: Prisma.TaskWhereInput = { orgId: ctx.orgId };
  if (responsaveis) where.assignedToId = { in: responsaveis };
  const status = filtro.status ?? "abertas";
  if (status === "abertas") where.doneAt = null;
  if (status === "feitas") where.doneAt = { not: null };

  const tarefas = await prisma.task.findMany({
    where,
    include: INCLUDE_DA_TELA,
    // Em aberto primeiro; sem prazo no fim.
    orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: { sort: "asc", nulls: "last" } }],
    take: Math.min(Math.max(filtro.limite ?? 300, 1), 500),
  });
  return { visao, tarefas: await serializarTarefas(ctx.orgId, tarefas) };
}

// ── Conclusão ───────────────────────────────────────────────────────────────

export interface ResultadoDaConclusao {
  tarefaId: string;
  proximaId: string | null;
  detalhesGravados: boolean;
}

/**
 * Conclui com resultado + nota + decisão do próximo passo (obrigatória,
 * validada antes em validarConclusao). Numa transação: marca feita (só se
 * ainda aberta — duas abas não concluem duas vezes), cria a próxima atividade
 * (mesmo negócio/contato, mesmo responsável) e registra resultado e nota como
 * nota do negócio/contato (é o que a timeline e a ficha do contato mostram).
 */
export async function concluirTarefa(ctx: CtxDeTarefas, task: Task, pedido: PedidoDeConclusao, agora = new Date()): Promise<ResultadoDaConclusao> {
  const textoDaNota = textoDoResultado(task.type, pedido.resultado, pedido.nota);
  const { proximaId, nota } = await prisma.$transaction(async (tx) => {
    const marcadas = await tx.task.updateMany({ where: { id: task.id, orgId: ctx.orgId, doneAt: null }, data: { doneAt: agora } });
    if (marcadas.count === 0) throw new ErroDeTarefa("Esta tarefa já foi concluída.", 409, "ja_concluida");
    let proximaId: string | null = null;
    if (pedido.proximo.decisao === "agendou") {
      const p = pedido.proximo.tarefa;
      const nova = await tx.task.create({
        data: {
          orgId: ctx.orgId,
          text: p.texto,
          type: p.tipo,
          contactId: task.contactId,
          dealId: task.dealId,
          assignedToId: task.assignedToId ?? ctx.userId,
          dueAt: p.diaTodo ? noDia(diaEmSP(p.dueAt), 23, 59) : p.dueAt,
        },
      });
      proximaId = nova.id;
    }
    const nota =
      task.dealId || task.contactId
        ? await tx.note.create({
            data: { orgId: ctx.orgId, text: `Tarefa concluída: ${task.text}\n${textoDaNota}`, contactId: task.contactId, dealId: task.dealId, authorId: ctx.userId },
          })
        : null;
    return { proximaId, nota };
  });

  // Fora da transação: tabela de detalhes pode não existir (e uma falha
  // dentro abortaria a transação inteira no Postgres).
  const detalhesGravados = await gravarDetalhes(task, {
    outcome: pedido.resultado,
    outcomeNote: pedido.nota || null,
    nextStepDecision: pedido.proximo.decisao,
    nextTaskId: proximaId,
    completedById: ctx.userId,
  });
  if (proximaId && pedido.proximo.decisao === "agendou" && pedido.proximo.tarefa.diaTodo) {
    await gravarDetalhes({ id: proximaId, orgId: ctx.orgId }, { allDay: true });
  }
  await tocarAtividadeDaTarefa(task, nota?.createdAt ?? agora);
  return { tarefaId: task.id, proximaId, detalhesGravados };
}

// ── Adiar ───────────────────────────────────────────────────────────────────

export interface PedidoDeAdiar {
  opcao: OpcaoDeAdiar;
  data?: Date | null;
  diaTodo?: boolean;
  empurrarPrevisao?: boolean;
}

export interface ResultadoDoAdiamento {
  dueAt: string;
  diaTodo: boolean;
  /** Nova previsão do negócio (quando pedida e permitida). */
  previsao: string | null;
  aviso?: string;
}

export async function adiarTarefa(ctx: CtxDeTarefas, task: Task, pedido: PedidoDeAdiar, agora = new Date()): Promise<ResultadoDoAdiamento> {
  if (task.doneAt) throw new ErroDeTarefa("Tarefa concluída não se adia. Reabra antes.", 409, "ja_concluida");
  const novo = calcularAdiamento(pedido.opcao, agora, pedido.data ? { dueAt: pedido.data, diaTodo: pedido.diaTodo } : null);
  if (!novo) throw new ErroDeTarefa("Escolha a nova data.", 400, "data_obrigatoria");
  const dueAt = novo.diaTodo ? noDia(diaEmSP(novo.dueAt), 23, 59) : novo.dueAt;

  let previsao: string | null = null;
  let aviso: string | undefined;
  if (pedido.empurrarPrevisao && task.dealId) {
    const deal = await prisma.deal.findFirst({ where: { id: task.dealId, orgId: ctx.orgId }, select: { id: true, ownerId: true, expectedClosingAt: true, closedAt: true } });
    if (!deal || deal.closedAt) {
      aviso = "O negócio está fechado: a previsão não mudou.";
    } else if (!ctxPode(ctx, "negocios:editar") || !(await noEscopo(ctx, "negocios", deal.ownerId))) {
      aviso = "Você não pode editar este negócio: a previsão não mudou.";
    } else {
      const nova = empurrarPrevisao(deal.expectedClosingAt, task.dueAt, dueAt, agora);
      if (!nova) aviso = "O negócio não tem previsão de fechamento.";
      else if (nova.getTime() !== deal.expectedClosingAt?.getTime()) {
        await prisma.deal.update({ where: { id: deal.id }, data: { expectedClosingAt: nova } });
        previsao = nova.toISOString();
      } else previsao = nova.toISOString();
    }
  }

  await prisma.task.update({ where: { id: task.id }, data: { dueAt } });
  await gravarDetalhes(task, { allDay: novo.diaTodo }, { contarAdiamento: true });
  return { dueAt: dueAt.toISOString(), diaTodo: novo.diaTodo, previsao, ...(aviso ? { aviso } : {}) };
}

// ── Ações em massa ──────────────────────────────────────────────────────────

export type AcaoEmMassa =
  | { acao: "reagendar"; para: "mais_1d" | "segunda" }
  | { acao: "reatribuir"; responsavelId: string | null }
  | { acao: "concluir"; resultado: ResultadoDaTarefa; nota: string };

/** Novo prazo do "reagendar" em massa: +1 dia mantendo a hora (sem prazo: amanhã 9h) ou próxima segunda 9h. */
export function novoPrazoEmMassa(para: "mais_1d" | "segunda", dueAt: Date | null, agora: Date): Date {
  const hoje = diaEmSP(agora);
  if (para === "segunda") return noDia(proximoDiaDaSemana(hoje, 1), 9);
  if (!dueAt) return calcularAdiamento("amanha", agora)!.dueAt;
  return new Date(dueAt.getTime() + 86_400_000);
}

export async function aplicarEmMassa(ctx: CtxDeTarefas, ids: string[], acao: AcaoEmMassa, agora = new Date()): Promise<{ alteradas: number; ignoradas: number }> {
  const unicos = [...new Set(ids)].slice(0, 500);
  const encontradas = await prisma.task.findMany({ where: { id: { in: unicos }, orgId: ctx.orgId } });
  const escopo = ctx.escopo?.negocios;
  const colegas = await colegasSePrecisar(ctx);
  const visiveis = encontradas.filter((t) => tarefaNoEscopo(t.assignedToId, escopo, ctx.userId, colegas));
  const ignoradas = unicos.length - visiveis.length;

  if (acao.acao === "reagendar") {
    const abertas = visiveis.filter((t) => !t.doneAt);
    await prisma.$transaction(abertas.map((t) => prisma.task.update({ where: { id: t.id }, data: { dueAt: novoPrazoEmMassa(acao.para, t.dueAt, agora) } })));
    for (const t of abertas) await gravarDetalhes(t, { allDay: false }, { contarAdiamento: true });
    return { alteradas: abertas.length, ignoradas: ignoradas + visiveis.length - abertas.length };
  }

  if (acao.acao === "reatribuir") {
    const erroRef = await conferirReferencias(ctx.orgId, { assignedToId: acao.responsavelId });
    if (erroRef) throw new ErroDeTarefa(erroRef, erroRef.endsWith("inválido.") ? 400 : 404);
    // Escopo "só os meus"/"equipe": não dá para passar tarefa para fora do teto.
    if (escopo && escopo !== "todos" && !tarefaNoEscopo(acao.responsavelId, escopo, ctx.userId, colegas)) {
      throw new ErroDeTarefa("Você só pode atribuir tarefas a quem está no seu escopo.", 403, "fora_do_escopo");
    }
    const r = await prisma.task.updateMany({ where: { id: { in: visiveis.map((t) => t.id) }, orgId: ctx.orgId }, data: { assignedToId: acao.responsavelId } });
    return { alteradas: r.count, ignoradas };
  }

  // Concluir em massa: a decisão "Sem próximo passo" vale para todas
  // (agendar uma próxima por tarefa é coisa do concluir uma a uma).
  const abertas = visiveis.filter((t) => !t.doneAt);
  const r = await prisma.task.updateMany({ where: { id: { in: abertas.map((t) => t.id) }, orgId: ctx.orgId, doneAt: null }, data: { doneAt: agora } });
  for (const t of abertas) {
    await gravarDetalhes(t, { outcome: acao.resultado, outcomeNote: acao.nota || null, nextStepDecision: "sem_proximo", completedById: ctx.userId });
    if (acao.nota && (t.dealId || t.contactId)) {
      await addNote({ orgId: ctx.orgId, text: `Tarefa concluída: ${t.text}\n${textoDoResultado(t.type, acao.resultado, acao.nota)}`, contactId: t.contactId, dealId: t.dealId, authorId: ctx.userId });
    }
    await tocarAtividadeDaTarefa(t, agora);
  }
  return { alteradas: r.count, ignoradas: ignoradas + visiveis.length - abertas.length };
}

// ── Quick add ───────────────────────────────────────────────────────────────

export interface ResultadoDoQuickAdd {
  tarefaId: string;
  interpretado: { titulo: string; tipo: string; dueAt: string | null; diaTodo: boolean; prioridade: Prioridade; pessoa: string | null };
  contato: { id: string; nome: string } | null;
  negocio: { id: string; nome: string } | null;
  /** Mais de um contato com esse nome: ficou sem vínculo. */
  ambiguo: boolean;
}

/**
 * "ligar João amanhã 14h" → tarefa. A pessoa do texto vira vínculo quando bate
 * com UM contato do contrato (no escopo de contatos); o negócio aberto mais
 * recente desse contato entra junto. Vínculo explícito (contactId/dealId da
 * tela) ganha do nome.
 */
export async function quickAdd(
  ctx: CtxDeTarefas,
  texto: string,
  vinculo: { contactId?: string | null; dealId?: string | null } = {},
  agora = new Date()
): Promise<ResultadoDoQuickAdd> {
  const q: QuickAdd = interpretarQuickAdd(texto, agora);
  if (!q.titulo) throw new ErroDeTarefa("Escreva o que fazer.", 400);

  let contato: { id: string; nome: string } | null = null;
  let negocio: { id: string; nome: string } | null = null;
  let ambiguo = false;

  if (vinculo.contactId || vinculo.dealId) {
    const erroRef = await conferirReferencias(ctx.orgId, { contactId: vinculo.contactId, dealId: vinculo.dealId });
    if (erroRef) throw new ErroDeTarefa(erroRef, erroRef.endsWith("inválido.") ? 400 : 404);
    if (vinculo.contactId) {
      const c = await prisma.contact.findFirst({ where: { id: vinculo.contactId, orgId: ctx.orgId }, select: { id: true, name: true } });
      contato = c ? { id: c.id, nome: c.name } : null;
    }
    if (vinculo.dealId) {
      const d = await prisma.deal.findFirst({ where: { id: vinculo.dealId, orgId: ctx.orgId }, select: { id: true, name: true } });
      negocio = d ? { id: d.id, nome: d.name } : null;
    }
  } else if (q.pessoa) {
    const escopo = ctx.escopo?.contatos;
    const donos =
      !escopo || escopo === "todos" ? null : escopo === "proprios" ? [ctx.userId] : [ctx.userId, ...(await colegasDeEquipe(ctx))];
    const achados = await prisma.contact.findMany({
      where: { orgId: ctx.orgId, name: { startsWith: q.pessoa, mode: "insensitive" }, ...(donos ? { ownerId: { in: donos } } : {}) },
      select: { id: true, name: true },
      orderBy: { lastSeenAt: "desc" },
      take: 2,
    });
    if (achados.length === 1) {
      contato = { id: achados[0].id, nome: achados[0].name };
      const d = await findOpenDealForContact(achados[0].id);
      if (d && d.orgId === ctx.orgId) negocio = { id: d.id, nome: d.name };
    } else if (achados.length > 1) ambiguo = true;
  }

  const task = await createTask({
    orgId: ctx.orgId,
    text: q.titulo,
    type: q.tipo,
    contactId: contato?.id ?? null,
    dealId: negocio?.id ?? null,
    assignedToId: ctx.userId,
    dueAt: q.dueAt,
    origem: "manual",
    diaTodo: q.diaTodo,
    prioridade: q.prioridade,
  });

  return {
    tarefaId: task.id,
    interpretado: { titulo: q.titulo, tipo: q.tipo, dueAt: q.dueAt?.toISOString() ?? null, diaTodo: q.diaTodo, prioridade: q.prioridade, pessoa: q.pessoa },
    contato,
    negocio,
    ambiguo,
  };
}
