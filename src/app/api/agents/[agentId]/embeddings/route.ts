import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { EMBEDDING_MODELS, getEmbeddingModel, reindexAgent } from "@/lib/server/embeddings";

// Configuração da busca semântica do agente + ação de reindexar.
export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId: ctx.orgId },
    select: { embeddingModel: true, embeddingCredentialId: true, embeddingProvider: true },
  });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const [chunkCount, docCount] = await Promise.all([
    prisma.knowledgeChunk.count({ where: { agentId } }),
    prisma.knowledgeDoc.count({ where: { agentId } }),
  ]);

  // Documento carregado antes de ligar a busca semântica (ou depois de trocar
  // de modelo) fica sem vetor. É o caso que mais confunde, então a tela avisa.
  const indexedDocs = await prisma.knowledgeChunk.groupBy({ by: ["docId"], where: { agentId } });

  return NextResponse.json({
    models: EMBEDDING_MODELS,
    embeddingModel: agent.embeddingModel,
    embeddingCredentialId: agent.embeddingCredentialId,
    embeddingProvider: agent.embeddingProvider,
    chunkCount,
    docCount,
    indexedDocCount: indexedDocs.length,
    needsReindex: !!agent.embeddingModel && indexedDocs.length < docCount,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const body = await request.json();
  const modelId = String(body.embeddingModel ?? "");
  const credentialId = String(body.embeddingCredentialId ?? "");

  if (modelId) {
    const model = getEmbeddingModel(modelId);
    if (!model) return NextResponse.json({ error: "Modelo de embedding desconhecido." }, { status: 400 });
    if (!credentialId) {
      return NextResponse.json({ error: "Escolha a credencial do provedor de embedding." }, { status: 400 });
    }
    await prisma.agent.update({
      where: { id: agentId },
      data: { embeddingModel: modelId, embeddingCredentialId: credentialId, embeddingProvider: model.provider },
    });
  } else {
    // Desligar: limpa a configuração e os vetores. A base continua
    // funcionando pelo full-text, que nunca dependeu disso.
    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({ where: { agentId } }),
      prisma.agent.update({
        where: { id: agentId },
        data: { embeddingModel: "", embeddingCredentialId: "", embeddingProvider: "" },
      }),
    ]);
    return NextResponse.json({ ok: true, disabled: true });
  }

  // Trocar de modelo invalida todo vetor anterior (vetores de modelos
  // diferentes não são comparáveis), então reindexa na hora.
  try {
    const result = await reindexAgent(agentId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao indexar." },
      { status: 502 }
    );
  }
}
