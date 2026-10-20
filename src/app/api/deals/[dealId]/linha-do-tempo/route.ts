import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import type { ConversaDoNegocio, ItemDaLinhaDoTempo, LinhaDoTempo } from "@/components/crm/negocio/linha-do-tempo";

// Teto de itens devolvidos. Negócio com mais que isso é exceção, e a ficha
// mostra o mais recente primeiro: o que fica de fora é o mais antigo.
const LIMITE = 200;
const LIMITE_DE_CONVERSAS = 50;
const SELECT_DO_EVENTO = { id: true, fromStageId: true, toStageId: true, origem: true, at: true } as const;

/**
 * Tudo o que aconteceu com o negócio numa lista só: criação, mudanças de
 * etapa, notas, tarefas e conversas dos contatos vinculados. Antes cada coisa
 * morava numa tela, e "o que rolou com esse cliente?" exigia abrir quatro.
 *
 * Tudo filtrado pela org de novo em cada consulta (não só no negócio): nota,
 * tarefa ou conversa de outra org apontando para este id não vaza.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;
  const orgId = ctx.orgId;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true, createdAt: true, contacts: { select: { contactId: true } } },
  });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const contactIds = deal.contacts.map((c) => c.contactId);

  const [eventos, notas, tarefas, conversas] = await Promise.all([
    // Histórico de etapas é complemento: se a tabela falhar (migração
    // atrasada, por exemplo), a ficha abre com o resto em vez de dar erro.
    // Select explícito: a coluna `ignorouObrigatorios` só existe depois do SQL
    // das regras de etapa; sem ela, lê de novo sem a coluna.
    prisma.dealStageEvent
      .findMany({ where: { dealId, orgId }, orderBy: { at: "desc" }, take: LIMITE, select: { ...SELECT_DO_EVENTO, ignorouObrigatorios: true } })
      .catch(() =>
        prisma.dealStageEvent
          .findMany({ where: { dealId, orgId }, orderBy: { at: "desc" }, take: LIMITE, select: SELECT_DO_EVENTO })
          .then((l) => l.map((e) => ({ ...e, ignorouObrigatorios: false })))
      )
      .catch((e: unknown) => {
        console.error("[linha-do-tempo] histórico de etapas indisponível", e);
        return [];
      }),
    prisma.note.findMany({
      where: { dealId, orgId },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: { id: true, text: true, createdAt: true, author: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { dealId, orgId },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: { id: true, type: true, text: true, dueAt: true, doneAt: true, createdAt: true },
    }),
    contactIds.length === 0
      ? Promise.resolve([])
      : prisma.conversation.findMany({
          // Conversa não tem orgId: a org vem do agente. A ficha do contato
          // também tem de ser da org (contato de outra org com o mesmo id não
          // entra). Playground é teste interno, não atendimento.
          where: {
            contactRecordId: { in: contactIds },
            agent: { orgId },
            contact: { orgId },
            channel: { not: "playground" },
          },
          orderBy: { lastMessageAt: "desc" },
          take: LIMITE_DE_CONVERSAS,
          select: {
            id: true,
            channel: true,
            status: true,
            createdAt: true,
            lastMessageAt: true,
            lastMessageText: true,
            lastMessageRole: true,
            lastContactMessageAt: true,
            readAt: true,
            contact: { select: { id: true, name: true } },
            agent: { select: { name: true } },
          },
        }),
  ]);

  // Nomes das etapas. Sem FK no evento de propósito (etapa apagada não apaga a
  // história), então a etapa pode não existir mais.
  const idsDeEtapa = [...new Set(eventos.flatMap((e) => [e.fromStageId, e.toStageId]).filter((x): x is string => !!x))];
  const etapas =
    idsDeEtapa.length === 0
      ? []
      : await prisma.pipelineStage.findMany({
          where: { id: { in: idsDeEtapa }, pipeline: { orgId } },
          select: { id: true, name: true, type: true },
        });
  const etapa = new Map(etapas.map((s) => [s.id, s]));
  const nomeDaEtapa = (id: string) => etapa.get(id)?.name ?? "etapa removida";

  const itens: ItemDaLinhaDoTempo[] = [];

  // O evento sem etapa de origem é o nascimento do negócio: vira o próprio
  // "Negócio criado em X" em vez de aparecer duas vezes.
  const nascimento = eventos.find((e) => !e.fromStageId);
  itens.push({
    id: `criado-${deal.id}`,
    tipo: "criado",
    em: deal.createdAt.toISOString(),
    etapa: nascimento ? nomeDaEtapa(nascimento.toStageId) : null,
  });

  for (const e of eventos) {
    if (e === nascimento) continue;
    itens.push({
      id: `etapa-${e.id}`,
      tipo: "etapa",
      em: e.at.toISOString(),
      de: e.fromStageId ? nomeDaEtapa(e.fromStageId) : null,
      para: nomeDaEtapa(e.toStageId),
      paraTipo: etapa.get(e.toStageId)?.type ?? "open",
      origem: e.origem,
      ...(e.ignorouObrigatorios ? { ignorouObrigatorios: true } : {}),
    });
  }

  for (const n of notas) {
    itens.push({
      id: `nota-${n.id}`,
      tipo: "nota",
      em: n.createdAt.toISOString(),
      texto: n.text,
      autor: n.author?.name || null,
    });
  }

  for (const t of tarefas) {
    const base = { tarefaId: t.id, tipoTarefa: t.type, texto: t.text, prazo: t.dueAt?.toISOString() ?? null };
    itens.push({ id: `tarefa-${t.id}`, tipo: "tarefa_criada", em: t.createdAt.toISOString(), ...base });
    if (t.doneAt) itens.push({ id: `feita-${t.id}`, tipo: "tarefa_concluida", em: t.doneAt.toISOString(), ...base });
  }

  for (const c of conversas) {
    itens.push({
      id: `conversa-${c.id}`,
      tipo: "conversa",
      em: c.createdAt.toISOString(),
      conversaId: c.id,
      canal: c.channel,
      contato: c.contact?.name || null,
    });
  }

  // Desempate pelo id: dois itens no mesmo milissegundo (tarefa criada e
  // concluída por automação) ficam sempre na mesma ordem.
  itens.sort((a, b) => b.em.localeCompare(a.em) || a.id.localeCompare(b.id));

  const lista: ConversaDoNegocio[] = conversas.map((c) => ({
    id: c.id,
    canal: c.channel,
    status: c.status,
    ultimaMensagem: c.lastMessageText,
    ultimoAutor: c.lastMessageRole,
    ultimaMensagemEm: c.lastMessageAt.toISOString(),
    // Mesma regra do cartão do kanban: o cliente escreveu depois da última
    // vez que alguém da equipe abriu a conversa.
    naoLida: !!c.lastContactMessageAt && (!c.readAt || c.lastContactMessageAt > c.readAt),
    contato: c.contact ? { id: c.contact.id, name: c.contact.name } : null,
    agente: c.agent?.name ?? null,
  }));

  const corpo: LinhaDoTempo = { itens: itens.slice(0, LIMITE), conversas: lista };
  return NextResponse.json(corpo);
}
