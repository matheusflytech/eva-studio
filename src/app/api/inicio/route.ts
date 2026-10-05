import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { lerEstadoWorker } from "@/lib/server/heartbeat";
import { validateFlow } from "@/components/agent-studio/builder/block-validation";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";

// ---------------------------------------------------------------------------
// A tela de início.
//
// Antes ela respondia "quantos agentes você tem", que a pessoa já sabe, e
// completava com um número inventado de conversas. Agora responde a única
// pergunta que uma home precisa responder: o que precisa de mim agora.
//
// Tudo aqui é pendência de verdade, com link pro lugar de resolver. Quando não
// há nenhuma, a resposta é "nada" — e isso é uma resposta legítima, não um
// motivo pra encher a tela de cartão vazio.
// ---------------------------------------------------------------------------

const DIA = 24 * 60 * 60 * 1000;
/** Depois disso, negócio parado na mesma etapa vira esquecimento. */
const DIAS_PARADO = 7;

export interface Pendencia {
  id: string;
  tipo: "urgente" | "atencao" | "config";
  titulo: string;
  detalhe: string;
  href: string;
  quantidade?: number;
}

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const agora = new Date();
  const fimDoDia = new Date(agora);
  fimDoDia.setHours(23, 59, 59, 999);
  const corteParado = new Date(agora.getTime() - DIAS_PARADO * DIA);

  const [esperando, atrasadas, hoje, parados, agentes, worker, conversas7d] = await Promise.all([
    prisma.conversation.count({
      where: { agent: { orgId: ctx.orgId }, status: "waiting_human" },
    }),
    prisma.task.count({
      where: { orgId: ctx.orgId, doneAt: null, dueAt: { lt: agora } },
    }),
    prisma.task.count({
      where: { orgId: ctx.orgId, doneAt: null, dueAt: { gte: agora, lte: fimDoDia } },
    }),
    prisma.deal.count({
      where: {
        orgId: ctx.orgId,
        closedAt: null,
        archivedAt: null,
        stageSince: { lte: corteParado },
      },
    }),
    prisma.agent.findMany({
      where: { orgId: ctx.orgId },
      include: { flow: true },
      orderBy: { updatedAt: "desc" },
    }),
    lerEstadoWorker(),
    prisma.conversation.count({
      where: {
        agent: { orgId: ctx.orgId },
        updatedAt: { gte: new Date(agora.getTime() - 7 * DIA) },
        channel: { notIn: ["playground", "builder_preview"] },
      },
    }),
  ]);

  const pendencias: Pendencia[] = [];

  // Ordem = quem perde mais se for ignorado. Gente esperando resposta vem
  // antes de qualquer número.
  if (esperando > 0) {
    pendencias.push({
      id: "esperando",
      tipo: "urgente",
      titulo: esperando === 1 ? "Uma pessoa esperando atendimento" : `${esperando} pessoas esperando atendimento`,
      detalhe: "O agente passou a conversa pra um humano e ela está parada.",
      href: "/conversas",
      quantidade: esperando,
    });
  }

  if (atrasadas > 0) {
    pendencias.push({
      id: "atrasadas",
      tipo: "urgente",
      titulo: `${atrasadas} ${atrasadas === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`,
      detalhe: "O prazo já passou.",
      href: "/tarefas",
      quantidade: atrasadas,
    });
  }

  if (hoje > 0) {
    pendencias.push({
      id: "hoje",
      tipo: "atencao",
      titulo: `${hoje} ${hoje === 1 ? "tarefa vence hoje" : "tarefas vencem hoje"}`,
      detalhe: "Ainda dá tempo.",
      href: "/tarefas",
      quantidade: hoje,
    });
  }

  if (parados > 0) {
    pendencias.push({
      id: "parados",
      tipo: "atencao",
      titulo: `${parados} ${parados === 1 ? "negócio parado" : "negócios parados"} há mais de ${DIAS_PARADO} dias`,
      detalhe: "Mesma etapa desde então. Ou avança, ou fecha como perdido.",
      href: "/negocios",
      quantidade: parados,
    });
  }

  // Configuração: não é urgente, mas trava o agente de funcionar.
  for (const agente of agentes) {
    if (!agente.flow) {
      pendencias.push({
        id: `sem-fluxo-${agente.id}`,
        tipo: "config",
        titulo: `${agente.name} não tem fluxo`,
        detalhe: "Sem fluxo o agente não responde nada.",
        href: `/agent-studio/${agente.id}/builder`,
      });
      continue;
    }
    const nodes = (agente.flow.nodes as unknown as Node<FlowNodeData>[]) ?? [];
    const edges = (agente.flow.edges as unknown as Edge[]) ?? [];
    const problemas = validateFlow(nodes, edges).length;
    if (problemas > 0) {
      pendencias.push({
        id: `blocos-${agente.id}`,
        tipo: "config",
        titulo: `${agente.name}: ${problemas} ${problemas === 1 ? "bloco incompleto" : "blocos incompletos"}`,
        detalhe: "O fluxo trava quando chegar neles.",
        href: `/agent-studio/${agente.id}/builder`,
        quantidade: problemas,
      });
    }
  }

  if (!worker.saudavel) {
    pendencias.push({
      id: "relogio",
      tipo: "urgente",
      titulo: "O relógio do produto está parado",
      detalhe: "Passo de sequência vencido e disparo agendado não estão sendo entregues.",
      href: "/agent-studio",
    });
  }

  // Configuração inicial: some assim que a pessoa escolhe um pacote, pula, ou
  // a conta já tem negócios (quem importou dados não precisa de assistente).
  const [org, negociosTotal] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { onboardedAt: true } }),
    prisma.deal.count({ where: { orgId: ctx.orgId } }),
  ]);
  const onboardingPendente = !org?.onboardedAt && negociosTotal === 0 && agentes.length === 0;

  return NextResponse.json({
    onboardingPendente,
    pendencias,
    resumo: {
      agentes: agentes.length,
      conversas7d,
      // Quando não há pendência, a home diz isso — e dizer "tudo em dia" com
      // segurança exige ter olhado tudo, que é o que acabou de acontecer.
      tudoEmDia: pendencias.length === 0,
    },
    agentes: agentes.slice(0, 4).map((a) => ({
      id: a.id,
      nome: a.name,
      status: a.status,
      temFluxo: !!a.flow,
      atualizadoEm: a.updatedAt.toISOString(),
    })),
  });
}
