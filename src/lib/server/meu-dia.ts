import "server-only";
import { prisma } from "@/lib/db/prisma";
import { whereDeParadosDoContrato } from "@/lib/server/filtro-crm";
import { INCLUDE_DA_TELA, serializarTarefas, type CtxDeTarefas } from "@/lib/server/tarefas";
import { diaEmSP, noDia } from "@/lib/tarefas/calendario";
import { montarMeuDia, resumoDoDia, type ItemDoDia, type ItemPontuado } from "@/lib/tarefas/meu-dia";
import type { ContextoDoItem, ItemDoDiaDaTela, MeuDiaDaTela, TarefaDaTela } from "@/lib/tarefas/tela";

// ---------------------------------------------------------------------------
// "Meu dia" no servidor: junta as tarefas abertas da pessoa (atrasadas e de
// hoje) e os itens sintéticos, e entrega para montarMeuDia (puro). É também a
// fonte do resumo do dia — o digest das 8h por WhatsApp (item 20) e o alerta
// de SLA de lead (item 13) devem chamar carregarMeuDia, não refazer as contas.
//
// Sintéticos:
// - "Responder": conversa (WhatsApp/Instagram…) com atendente humano cuja
//   última mensagem é do cliente e ainda não foi lida — da pessoa, ou sem
//   atendente e com a ficha do contato sendo dela.
// - "Primeiro contato": lead novo (etapa "novo") da pessoa nos últimos 7 dias.
// - "Definir próximo passo": negócio aberto da pessoa, parado pelo prazo da
//   etapa e sem nenhuma tarefa aberta.
// ---------------------------------------------------------------------------

type ItemComContexto = ItemDoDia & { tarefa: TarefaDaTela | null; contexto: ContextoDoItem };

const LIMITE_TAREFAS = 300;
const LIMITE_SINTETICOS = 30;
const SEM_CONTEXTO: ContextoDoItem = { contato: null, conversaId: null, negocio: null, ultimaMensagem: null };

async function etapasDosNegocios(dealIds: string[], orgId: string) {
  if (dealIds.length === 0) return new Map<string, { etapa: string; progresso: number; pipelineId: string }>();
  const deals = await prisma.deal.findMany({
    where: { id: { in: dealIds }, orgId },
    select: { id: true, stageId: true, pipelineId: true, stage: { select: { name: true } } },
  });
  const funis = [...new Set(deals.map((d) => d.pipelineId))];
  const etapas = await prisma.pipelineStage.findMany({
    where: { pipelineId: { in: funis }, type: "open" },
    select: { id: true, pipelineId: true, position: true },
    orderBy: { position: "asc" },
  });
  const porFunil = new Map<string, string[]>();
  for (const e of etapas) porFunil.set(e.pipelineId, [...(porFunil.get(e.pipelineId) ?? []), e.id]);
  const mapa = new Map<string, { etapa: string; progresso: number; pipelineId: string }>();
  for (const d of deals) {
    const lista = porFunil.get(d.pipelineId) ?? [];
    const i = lista.indexOf(d.stageId);
    const progresso = i < 0 ? 0 : lista.length <= 1 ? 1 : i / (lista.length - 1);
    mapa.set(d.id, { etapa: d.stage?.name ?? "", progresso, pipelineId: d.pipelineId });
  }
  return mapa;
}

async function paradosEntre(orgId: string, dealIds: string[], agora: Date): Promise<Set<string>> {
  if (dealIds.length === 0) return new Set();
  try {
    const onde = await whereDeParadosDoContrato(orgId, agora);
    const linhas = await prisma.deal.findMany({ where: { AND: [{ id: { in: dealIds }, orgId, closedAt: null }, onde] }, select: { id: true } });
    return new Set(linhas.map((l) => l.id));
  } catch {
    return new Set();
  }
}

export async function carregarItensDoDia(ctx: CtxDeTarefas, agora = new Date()): Promise<ItemComContexto[]> {
  const fimDeHoje = noDia(diaEmSP(agora), 23, 59);
  const fimDeHojeMais = new Date(fimDeHoje.getTime() + 59_999);

  const [tarefas, conversas, leads, semPasso] = await Promise.all([
    prisma.task.findMany({
      where: { orgId: ctx.orgId, assignedToId: ctx.userId, doneAt: null, dueAt: { lte: fimDeHojeMais } },
      include: INCLUDE_DA_TELA,
      orderBy: { dueAt: "asc" },
      take: LIMITE_TAREFAS,
    }),
    prisma.conversation.findMany({
      where: {
        agent: { orgId: ctx.orgId },
        status: { in: ["waiting_human", "human"] },
        lastMessageRole: "contact",
        channel: { notIn: ["playground", "builder_preview"] },
        OR: [{ assignedToId: ctx.userId }, { assignedToId: null, contact: { ownerId: ctx.userId } }],
      },
      orderBy: { lastMessageAt: "asc" },
      take: LIMITE_SINTETICOS * 2,
      select: {
        id: true,
        readAt: true,
        lastMessageAt: true,
        lastMessageText: true,
        lastContactMessageAt: true,
        contact: { select: { id: true, name: true, phone: true, email: true } },
        contactId: true,
      },
    }),
    prisma.contact
      .findMany({
        where: { orgId: ctx.orgId, ownerId: ctx.userId, leadStage: "novo", leadAt: { gte: new Date(agora.getTime() - 7 * 86_400_000) } },
        orderBy: { leadAt: "asc" },
        take: LIMITE_SINTETICOS,
        select: { id: true, name: true, phone: true, email: true, leadAt: true, createdAt: true },
      })
      // Colunas de lead podem não existir num banco antigo: sem leads.
      .catch(() => []),
    (async () => {
      try {
        const onde = await whereDeParadosDoContrato(ctx.orgId, agora);
        return await prisma.deal.findMany({
          where: { AND: [{ orgId: ctx.orgId, ownerId: ctx.userId, closedAt: null, archivedAt: null, tasks: { none: { doneAt: null } } }, onde] },
          orderBy: { stageSince: "asc" },
          take: LIMITE_SINTETICOS,
          select: { id: true, name: true, amountCents: true, expectedClosingAt: true, createdAt: true },
        });
      } catch {
        return [];
      }
    })(),
  ]);

  const tela = await serializarTarefas(ctx.orgId, tarefas, agora);
  const dealIds = [...new Set([...tarefas.map((t) => t.dealId).filter((x): x is string => !!x), ...semPasso.map((d) => d.id)])];
  const [etapas, parados] = await Promise.all([etapasDosNegocios(dealIds, ctx.orgId), paradosEntre(ctx.orgId, dealIds, agora)]);

  const itens: ItemComContexto[] = [];

  tela.forEach((t, i) => {
    const bruto = tarefas[i];
    const etapa = t.deal ? etapas.get(t.deal.id) : undefined;
    itens.push({
      id: t.id,
      fonte: "tarefa",
      tipo: t.type,
      titulo: t.text,
      dueAt: bruto.dueAt,
      diaTodo: t.diaTodo,
      prioridade: t.prioridade,
      criadoEm: bruto.createdAt,
      duracaoMin: t.duracaoMin,
      valorCents: t.deal?.amountCents ?? null,
      etapaProgresso: etapa?.progresso ?? null,
      risco: t.deal && parados.has(t.deal.id) ? 1 : 0,
      tarefa: t,
      contexto: {
        contato: t.contact ? { id: t.contact.id, nome: t.contact.name, telefone: t.contact.phone, email: t.contact.email } : null,
        conversaId: t.conversaId,
        negocio: t.deal
          ? { id: t.deal.id, nome: t.deal.name, valorCents: t.deal.amountCents, etapa: etapa?.etapa ?? null, previsao: t.deal.expectedClosingAt }
          : null,
        ultimaMensagem: null,
      },
    });
  });

  let responder = 0;
  for (const c of conversas) {
    if (responder >= LIMITE_SINTETICOS) break;
    // Não lida = mensagem do cliente depois da última abertura.
    const doCliente = c.lastContactMessageAt ?? c.lastMessageAt;
    if (c.readAt && c.readAt.getTime() >= doCliente.getTime()) continue;
    responder++;
    const nome = c.contact?.name || c.contact?.phone || c.contactId;
    itens.push({
      id: `responder:${c.id}`,
      fonte: "responder",
      tipo: "whatsapp",
      titulo: `Responder ${nome}`,
      dueAt: null,
      prioridade: "normal",
      criadoEm: doCliente,
      esperandoDesde: doCliente,
      tarefa: null,
      contexto: {
        ...SEM_CONTEXTO,
        contato: c.contact ? { id: c.contact.id, nome: c.contact.name, telefone: c.contact.phone, email: c.contact.email } : null,
        conversaId: c.id,
        ultimaMensagem: { texto: c.lastMessageText, em: c.lastMessageAt.toISOString() },
      },
    });
  }

  for (const l of leads) {
    itens.push({
      id: `lead:${l.id}`,
      fonte: "primeiro_contato",
      tipo: "whatsapp",
      titulo: `Primeiro contato: ${l.name || l.phone || "lead novo"}`,
      dueAt: null,
      prioridade: "normal",
      criadoEm: l.createdAt,
      leadDesde: l.leadAt ?? l.createdAt,
      tarefa: null,
      contexto: { ...SEM_CONTEXTO, contato: { id: l.id, nome: l.name, telefone: l.phone, email: l.email } },
    });
  }

  for (const d of semPasso) {
    const etapa = etapas.get(d.id);
    itens.push({
      id: `passo:${d.id}`,
      fonte: "proximo_passo",
      tipo: "afazer",
      titulo: `Definir próximo passo: ${d.name}`,
      dueAt: null,
      prioridade: "normal",
      criadoEm: d.createdAt,
      duracaoMin: 5,
      valorCents: d.amountCents,
      etapaProgresso: etapa?.progresso ?? null,
      risco: 1,
      tarefa: null,
      contexto: {
        ...SEM_CONTEXTO,
        negocio: { id: d.id, nome: d.name, valorCents: d.amountCents, etapa: etapa?.etapa ?? null, previsao: d.expectedClosingAt?.toISOString() ?? null },
      },
    });
  }

  return itens;
}

function paraTela(p: ItemPontuado<ItemComContexto>): ItemDoDiaDaTela {
  const i = p.item;
  return {
    id: i.id,
    fonte: i.fonte,
    tipo: i.tipo,
    titulo: i.titulo,
    dueAt: i.dueAt?.toISOString() ?? null,
    diaTodo: !!i.diaTodo,
    prioridade: i.prioridade,
    score: p.score,
    duracaoMin: p.duracaoMin,
    tarefa: i.tarefa,
    contexto: i.contexto,
  };
}

/** O dia pronto para a tela (e para o digest: use `resumo`). */
export async function carregarMeuDia(ctx: CtxDeTarefas, agora = new Date()): Promise<MeuDiaDaTela> {
  const itens = await carregarItensDoDia(ctx, agora);
  const dia = montarMeuDia(itens, agora);
  const r = resumoDoDia(dia, agora);
  return {
    fixos: dia.fixos.map(paraTela),
    agora: dia.agora.map(paraTela),
    provavelmenteAmanha: dia.provavelmenteAmanha.map(paraTela),
    capacidade: dia.capacidade,
    filas: dia.filas,
    resumo: {
      texto: r.texto,
      reunioes: r.reunioes,
      tarefas: r.tarefas,
      atrasadas: r.atrasadas,
      aguardandoResposta: r.aguardandoResposta,
      leadsNovos: r.leadsNovos,
      negociosEmRisco: r.negociosEmRisco,
    },
  };
}
