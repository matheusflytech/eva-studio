import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
import { alteracoesDaFicha } from "@/lib/server/historico-leitura";
import type { ItemDaLinhaDoTempo, LinhaDoTempo } from "@/components/crm/negocio/linha-do-tempo";

// Teto de itens: o mais recente primeiro; o que fica de fora é o mais antigo.
const LIMITE = 300;
const LIMITE_DE_CONVERSAS = 50;

/**
 * Tudo o que aconteceu com o contato numa lista só: quando entrou, notas,
 * tarefas, conversas (com a última mensagem) e a história de cada negócio
 * dele (criação e mudanças de etapa, com o nome do negócio). Mesmo formato
 * da linha do tempo do negócio, para a tela ser a mesma.
 *
 * Cada consulta é presa à org de novo (e o contato ao escopo de quem vê).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const ctx = await requirePermission("contatos:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { contactId } = await params;
  const orgId = ctx.orgId;

  const contato = await prisma.contact.findFirst({
    where: { id: contactId, orgId, ...(await filtroDeEscopo(ctx, "contatos")) },
    select: { id: true, createdAt: true, source: true },
  });
  if (!contato) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const [vinculos, notas, tarefas, conversas, alteracoes] = await Promise.all([
    prisma.dealContact.findMany({
      where: { contactId, deal: { orgId } },
      select: { deal: { select: { id: true, name: true, createdAt: true } } },
    }),
    prisma.note.findMany({
      where: { contactId, orgId },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: { id: true, text: true, createdAt: true, author: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { contactId, orgId },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: { id: true, type: true, text: true, dueAt: true, doneAt: true, createdAt: true },
    }),
    prisma.conversation.findMany({
      // Conversa não tem orgId: a org vem do agente. Playground é teste interno.
      where: { contactRecordId: contactId, agent: { orgId }, channel: { not: "playground" } },
      orderBy: { lastMessageAt: "desc" },
      take: LIMITE_DE_CONVERSAS,
      select: { id: true, channel: true, createdAt: true, lastMessageText: true },
    }),
    alteracoesDaFicha(orgId, "contact", contactId).catch((e: unknown) => {
      console.error("[contato/linha-do-tempo] histórico de alterações indisponível", e);
      return [];
    }),
  ]);

  const negocios = vinculos.map((v) => v.deal);
  const nomeDoNegocio = new Map(negocios.map((d) => [d.id, d.name || "Negócio sem nome"]));

  // Histórico de etapas é complemento: se a tabela falhar, o resto abre.
  const eventos = negocios.length
    ? await prisma.dealStageEvent
        .findMany({
          where: { dealId: { in: negocios.map((d) => d.id) }, orgId },
          orderBy: { at: "desc" },
          take: LIMITE,
          select: { id: true, dealId: true, fromStageId: true, toStageId: true, origem: true, at: true },
        })
        .catch((e: unknown) => {
          console.error("[contato/linha-do-tempo] histórico de etapas indisponível", e);
          return [];
        })
    : [];

  const idsDeEtapa = [...new Set(eventos.flatMap((e) => [e.fromStageId, e.toStageId]).filter((x): x is string => !!x))];
  const etapas = idsDeEtapa.length
    ? await prisma.pipelineStage.findMany({ where: { id: { in: idsDeEtapa }, pipeline: { orgId } }, select: { id: true, name: true, type: true } })
    : [];
  const etapa = new Map(etapas.map((s) => [s.id, s]));
  const nomeDaEtapa = (id: string) => etapa.get(id)?.name ?? "etapa removida";

  const itens: ItemDaLinhaDoTempo[] = [
    { id: `contato-${contato.id}`, tipo: "contato_criado", em: contato.createdAt.toISOString(), origem: contato.source || null },
  ];

  for (const d of negocios) {
    // O evento sem etapa de origem é o nascimento do negócio.
    const nascimento = eventos.find((e) => e.dealId === d.id && !e.fromStageId);
    itens.push({
      id: `criado-${d.id}`,
      tipo: "criado",
      em: d.createdAt.toISOString(),
      etapa: nascimento ? nomeDaEtapa(nascimento.toStageId) : null,
      negocio: { id: d.id, nome: nomeDoNegocio.get(d.id)! },
    });
  }
  for (const e of eventos) {
    if (!e.fromStageId) continue;
    itens.push({
      id: `etapa-${e.id}`,
      tipo: "etapa",
      em: e.at.toISOString(),
      de: nomeDaEtapa(e.fromStageId),
      para: nomeDaEtapa(e.toStageId),
      paraTipo: etapa.get(e.toStageId)?.type ?? "open",
      origem: e.origem,
      negocio: { id: e.dealId, nome: nomeDoNegocio.get(e.dealId) ?? "Negócio" },
    });
  }
  for (const n of notas) {
    itens.push({ id: `nota-${n.id}`, tipo: "nota", em: n.createdAt.toISOString(), texto: n.text, autor: n.author?.name || null });
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
      contato: null,
      ultimaMensagem: c.lastMessageText || undefined,
    });
  }

  itens.push(...alteracoes);

  itens.sort((a, b) => b.em.localeCompare(a.em) || a.id.localeCompare(b.id));
  const corpo: LinhaDoTempo = { itens: itens.slice(0, LIMITE), conversas: [] };
  return NextResponse.json(corpo);
}
