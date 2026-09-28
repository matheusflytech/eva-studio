import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { getProvider } from "@/lib/llm-providers";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";
import { validateFlow } from "@/components/agent-studio/builder/block-validation";
import { lerEstadoWorker } from "@/lib/server/heartbeat";

// ---------------------------------------------------------------------------
// Painel de operação dos agentes.
//
// A tela de agentes mostrava nome, descrição e data. Isso responde "quais
// agentes existem" e nenhuma das perguntas que se faz de verdade: está
// atendendo? em que canal? alguém está esperando resposta humana? o fluxo tem
// bloco quebrado? deu erro nas últimas horas?
//
// Tudo aqui é agregado em consultas por grupo, nunca uma consulta por agente:
// com 50 agentes, o laço ingênuo faria centenas de idas ao banco.
//
// Não toca em Contact, Deal nem nas outras tabelas de CRM de propósito, pra
// esta tela continuar de pé mesmo antes da migração do CRM ser aplicada.
// ---------------------------------------------------------------------------

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;
const UM_DIA = 24 * 60 * 60 * 1000;

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const agents = await prisma.agent.findMany({
    where: { orgId: ctx.orgId },
    include: {
      flow: true,
      whatsappConnection: { select: { status: true, phoneNumber: true } },
      metaConnection: { select: { displayPhone: true } },
      instagramConnection: { select: { username: true } },
      telegramConnection: { select: { botUsername: true, webhookSet: true } },
      messengerConnection: { select: { pageName: true } },
      tiktokConnection: { select: { displayName: true } },
      _count: { select: { knowledgeBase: true, messageTemplates: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const ids = agents.map((a) => a.id);
  const desde7 = new Date(Date.now() - SETE_DIAS);
  const desde1 = new Date(Date.now() - UM_DIA);

  const [worker, conversas, aguardando, mensagens, erros, execucoes] = await Promise.all([
    lerEstadoWorker(),
    prisma.conversation.groupBy({
      by: ["agentId"],
      where: { agentId: { in: ids }, updatedAt: { gte: desde7 } },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ["agentId"],
      where: { agentId: { in: ids }, status: "waiting_human" },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["role"],
      where: { createdAt: { gte: desde7 }, conversation: { agentId: { in: ids } } },
      _count: { _all: true },
    }),
    prisma.flowExecution.groupBy({
      by: ["agentId"],
      where: { agentId: { in: ids }, status: "error", createdAt: { gte: desde1 } },
      _count: { _all: true },
    }),
    prisma.flowExecution.groupBy({
      by: ["agentId"],
      where: { agentId: { in: ids }, createdAt: { gte: desde1 } },
      _count: { _all: true },
    }),
  ]);

  const porAgente = (linhas: { agentId: string; _count: { _all: number } }[]) =>
    new Map(linhas.map((l) => [l.agentId, l._count._all]));

  const nConversas = porAgente(conversas);
  const nAguardando = porAgente(aguardando);
  const nErros = porAgente(erros);
  const nExecucoes = porAgente(execucoes);

  const lista = agents.map((agent) => {
    // Canais ligados de verdade. O QR só conta como ligado quando a sessão
    // está conectada: linha existir no banco não significa telefone pareado.
    const canais: { id: string; label: string; detalhe: string }[] = [];
    if (agent.whatsappConnection?.status === "connected") {
      canais.push({ id: "whatsapp_qr", label: "WhatsApp", detalhe: agent.whatsappConnection.phoneNumber ?? "via QR" });
    }
    if (agent.metaConnection) {
      canais.push({ id: "whatsapp_meta", label: "WhatsApp oficial", detalhe: agent.metaConnection.displayPhone ?? "" });
    }
    if (agent.instagramConnection) {
      canais.push({ id: "instagram", label: "Instagram", detalhe: agent.instagramConnection.username ?? "" });
    }
    if (agent.telegramConnection) {
      canais.push({
        id: "telegram",
        label: "Telegram",
        detalhe: agent.telegramConnection.webhookSet
          ? `@${agent.telegramConnection.botUsername}`
          : "webhook pendente",
      });
    }
    if (agent.messengerConnection) {
      canais.push({ id: "messenger", label: "Messenger", detalhe: agent.messengerConnection.pageName });
    }
    if (agent.tiktokConnection) {
      canais.push({ id: "tiktok", label: "TikTok", detalhe: agent.tiktokConnection.displayName });
    }
    if (agent.widgetEnabled) canais.push({ id: "website", label: "Site", detalhe: "widget" });

    // Saúde do fluxo pela mesma validação que o Builder usa, pra não existir
    // duas noções de "incompleto" que possam divergir.
    let blocos = 0;
    let pendencias = 0;
    let temFluxo = false;
    const modelos = new Set<string>();

    if (agent.flow) {
      temFluxo = true;
      const nodes = (agent.flow.nodes as unknown as Node<FlowNodeData>[]) ?? [];
      const edges = (agent.flow.edges as unknown as Edge[]) ?? [];
      blocos = nodes.length;
      pendencias = validateFlow(nodes, edges).length;
      for (const n of nodes) {
        if (n.data?.iconKey === "ai-agent") {
          const p = getProvider(n.data.aiProvider);
          modelos.add(`${p.label} · ${n.data.aiModel || p.models[0].id}`);
        }
      }
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      updatedAt: agent.updatedAt.toISOString(),
      canais,
      // Agente sem canal e sem fluxo ainda está em rascunho, mesmo marcado
      // como ativo. É a distinção que a tela antiga não fazia.
      emRascunho: canais.length === 0 || !temFluxo,
      conversas7d: nConversas.get(agent.id) ?? 0,
      aguardandoHumano: nAguardando.get(agent.id) ?? 0,
      execucoes24h: nExecucoes.get(agent.id) ?? 0,
      erros24h: nErros.get(agent.id) ?? 0,
      blocos,
      pendencias,
      temFluxo,
      modelos: [...modelos],
      buscaSemantica: !!agent.embeddingModel,
      documentos: agent._count.knowledgeBase,
      modelosMensagem: agent._count.messageTemplates,
    };
  });

  const doContato = mensagens.find((m) => m.role === "contact")?._count._all ?? 0;
  const doBot = mensagens.reduce(
    (soma, m) => soma + (m.role === "bot" || m.role === "human" ? m._count._all : 0),
    0
  );

  return NextResponse.json({
    agents: lista,
    worker,
    resumo: {
      total: lista.length,
      ativos: lista.filter((a) => a.status === "active" && !a.emRascunho).length,
      rascunhos: lista.filter((a) => a.emRascunho).length,
      conversas7d: lista.reduce((s, a) => s + a.conversas7d, 0),
      aguardandoHumano: lista.reduce((s, a) => s + a.aguardandoHumano, 0),
      erros24h: lista.reduce((s, a) => s + a.erros24h, 0),
      pendencias: lista.reduce((s, a) => s + a.pendencias, 0),
      mensagensContato7d: doContato,
      mensagensAgente7d: doBot,
    },
  });
}
