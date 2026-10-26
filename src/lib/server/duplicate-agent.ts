import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Duplicar agente: o novo nasce pausado, com cadastro, fluxo, variáveis,
// gatilhos e base de conhecimento (inclusive os vetores da busca semântica).
// Não vão: conexões de canal, modelos aprovados da Meta e automações de
// comentário (são da conta/canal de origem), conversas e execuções.

export async function duplicateAgent(orgId: string, agentId: string): Promise<{ id: string } | null> {
  const origem = await prisma.agent.findFirst({
    where: { id: agentId, orgId },
    include: { flow: true, subflows: true, variables: true, triggers: true, knowledgeBase: true },
  });
  if (!origem) return null;

  return prisma.$transaction(async (tx) => {
    const novo = await tx.agent.create({
      data: {
        orgId,
        name: `${origem.name} (cópia)`.slice(0, 200),
        description: origem.description,
        tone: origem.tone,
        language: origem.language,
        primaryChannel: origem.primaryChannel,
        instructions: origem.instructions,
        guidelines: origem.guidelines,
        skills: origem.skills as Prisma.InputJsonValue,
        tools: origem.tools as Prisma.InputJsonValue,
        outboundUrl: origem.outboundUrl,
        status: "paused",
        widgetEnabled: false,
        embeddingProvider: origem.embeddingProvider,
        embeddingCredentialId: origem.embeddingCredentialId,
        embeddingModel: origem.embeddingModel,
      },
      select: { id: true },
    });

    // Fluxos extras ganham id novo; o "Ir para fluxo" de todos passa a apontar para as cópias.
    const novoId = new Map(origem.subflows.map((s) => [s.id, crypto.randomUUID()]));
    const remapear = (nodes: unknown) =>
      (Array.isArray(nodes) ? nodes : []).map((n: { data?: { iconKey?: string; targetFlowId?: string } }) =>
        n?.data?.iconKey === "go-to-flow" && n.data.targetFlowId && novoId.has(n.data.targetFlowId)
          ? { ...n, data: { ...n.data, targetFlowId: novoId.get(n.data.targetFlowId) } }
          : n
      ) as Prisma.InputJsonValue;
    if (origem.flow) {
      await tx.agentFlow.create({
        data: { agentId: novo.id, nodes: remapear(origem.flow.nodes), edges: origem.flow.edges as Prisma.InputJsonValue },
      });
    }
    if (origem.subflows.length) {
      await tx.agentSubflow.createMany({
        data: origem.subflows.map((s) => ({
          id: novoId.get(s.id)!,
          agentId: novo.id,
          name: s.name,
          keywords: s.keywords,
          position: s.position,
          nodes: remapear(s.nodes),
          edges: s.edges as Prisma.InputJsonValue,
        })),
      });
    }
    if (origem.variables.length) {
      await tx.agentVariable.createMany({ data: origem.variables.map((v) => ({ agentId: novo.id, name: v.name, unit: v.unit })) });
    }
    if (origem.triggers.length) {
      await tx.agentTrigger.createMany({
        data: origem.triggers.map((t) => ({
          agentId: novo.id,
          name: t.name,
          kind: t.kind,
          channels: t.channels,
          matchMode: t.matchMode,
          keywords: t.keywords,
          storyId: t.storyId,
          includeReactions: t.includeReactions,
          replyText: t.replyText,
          targetNodeId: t.targetNodeId, // os nós do fluxo copiado mantêm os mesmos ids
          priority: t.priority,
          active: t.active,
        })),
      });
    }
    for (const doc of origem.knowledgeBase) {
      const copia = await tx.knowledgeDoc.create({
        data: { agentId: novo.id, fileName: doc.fileName, sizeBytes: doc.sizeBytes, mimeType: doc.mimeType, content: doc.content },
        select: { id: true },
      });
      // O vetor (pgvector) não passa pelo Prisma: copia direto no banco.
      await tx.$executeRaw`
        insert into eva_studio_knowledge_chunks (id, "agentId", "docId", "chunkIndex", text, embedding, model, "createdAt")
        select gen_random_uuid()::text, ${novo.id}, ${copia.id}, "chunkIndex", text, embedding, model, now()
          from eva_studio_knowledge_chunks where "docId" = ${doc.id}`;
    }
    return novo;
  });
}
