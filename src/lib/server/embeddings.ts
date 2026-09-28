import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getCredentialSecret } from "@/lib/server/credentials";

// ---------------------------------------------------------------------------
// Busca semântica na base de conhecimento (§19 do CHATBOT_ENGINE.md).
//
// Até aqui a base era full-text do Postgres: casa palavra, não sentido. Quem
// pergunta "vocês parcelam?" não encontra um documento que só diz "aceitamos
// pagamento em até 12x", porque não há palavra em comum. Embedding resolve
// isso — os dois textos viram vetores próximos.
//
// Decisões que valem saber:
//   - Dimensão fixa em 1536 pra um índice HNSW servir a todos os provedores.
//     Modelo que não é 1536 nativo recebe o pedido de dimensão reduzida.
//   - Embedding é OPCIONAL por agente. Sem provedor configurado, a busca cai
//     no full-text de antes, sem perder nada.
//   - Busca é híbrida: junta o resultado do vetor com o do full-text por
//     fusão de posição (RRF). Vetor sozinho erra em nome próprio, código de
//     produto e número — coisas que o full-text acerta de olhos fechados.
// ---------------------------------------------------------------------------

export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingModelInfo {
  id: string;
  label: string;
  provider: "openai" | "google";
  /** Precisa pedir a dimensão explicitamente (não é 1536 por natureza). */
  needsDimensionParam: boolean;
}

export const EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  { id: "text-embedding-3-small", label: "OpenAI · text-embedding-3-small (barato)", provider: "openai", needsDimensionParam: false },
  { id: "text-embedding-3-large", label: "OpenAI · text-embedding-3-large (melhor)", provider: "openai", needsDimensionParam: true },
  { id: "gemini-embedding-001", label: "Google · gemini-embedding-001", provider: "google", needsDimensionParam: true },
];

export function getEmbeddingModel(id: string | undefined): EmbeddingModelInfo | null {
  return EMBEDDING_MODELS.find((m) => m.id === id) ?? null;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

export function chunkText(content: string): string[] {
  const clean = content.replace(/\r\n/g, "\n").trim();
  if (clean.length <= CHUNK_SIZE) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Geração de vetores
// ---------------------------------------------------------------------------

async function embedOpenAi(apiKey: string, model: EmbeddingModelInfo, texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.id,
      input: texts,
      ...(model.needsDimensionParam ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.data as { embedding: number[] }[]).map((d) => d.embedding);
}

async function embedGoogle(apiKey: string, model: EmbeddingModelInfo, texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:batchEmbedContents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${model.id}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      }),
    }
  );
  if (!res.ok) throw new Error(`Google embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.embeddings as { values: number[] }[]).map((e) => e.values);
}

/** Lote de textos → lote de vetores, pelo provedor configurado no agente. */
export async function embedTexts(
  agentId: string,
  texts: string[]
): Promise<{ vectors: number[][]; model: string } | null> {
  if (texts.length === 0) return { vectors: [], model: "" };

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { embeddingModel: true, embeddingCredentialId: true },
  });
  const model = getEmbeddingModel(agent?.embeddingModel);
  if (!model || !agent?.embeddingCredentialId) return null;

  const apiKey = await getCredentialSecret(agent.embeddingCredentialId);
  if (!apiKey) return null;

  const vectors =
    model.provider === "openai"
      ? await embedOpenAi(apiKey, model, texts)
      : await embedGoogle(apiKey, model, texts);

  return { vectors, model: model.id };
}

// ---------------------------------------------------------------------------
// Indexação
// ---------------------------------------------------------------------------

function toVectorLiteral(vector: number[]): string {
  // pgvector aceita o literal no formato "[0.1,0.2,...]".
  return `[${vector.join(",")}]`;
}

/**
 * Gera e grava os vetores de um documento. Silenciosamente não faz nada se o
 * agente não tem embeddings configurados — indexar é opcional, e um upload
 * não deve falhar porque a chave da OpenAI não foi cadastrada.
 *
 * Devolve quantos pedaços foram indexados.
 */
export async function indexDocument(agentId: string, docId: string, content: string): Promise<number> {
  const chunks = chunkText(content);
  if (chunks.length === 0) return 0;

  const embedded = await embedTexts(agentId, chunks);
  if (!embedded) return 0;

  // Reindexar substitui: apaga o que havia desse documento antes de gravar.
  await prisma.knowledgeChunk.deleteMany({ where: { docId } });

  for (let i = 0; i < chunks.length; i += 1) {
    const vector = embedded.vectors[i];
    if (!vector || vector.length !== EMBEDDING_DIMENSIONS) continue;
    // SQL cru: o Prisma não escreve em coluna do tipo vector.
    await prisma.$executeRaw`
      INSERT INTO eva_studio_knowledge_chunks (id, "agentId", "docId", "chunkIndex", text, embedding, model, "createdAt")
      VALUES (gen_random_uuid(), ${agentId}, ${docId}, ${i}, ${chunks[i]}, ${toVectorLiteral(vector)}::vector, ${embedded.model}, now())
    `;
  }

  return chunks.length;
}

/** Reindexa todos os documentos do agente (usado ao trocar de modelo). */
export async function reindexAgent(agentId: string): Promise<{ docs: number; chunks: number }> {
  const docs = await prisma.knowledgeDoc.findMany({ where: { agentId }, select: { id: true, content: true } });
  let chunks = 0;
  for (const doc of docs) {
    chunks += await indexDocument(agentId, doc.id, doc.content);
  }
  return { docs: docs.length, chunks };
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

export interface SearchHit {
  docLabel: string;
  text: string;
}

/**
 * Busca por proximidade de vetor. Devolve [] quando o agente não tem
 * embeddings configurados ou ainda não indexou nada — quem chama decide se
 * cai pro full-text.
 */
export async function semanticSearch(agentId: string, query: string, topK: number): Promise<SearchHit[]> {
  if (!query.trim()) return [];

  const embedded = await embedTexts(agentId, [query]);
  if (!embedded || embedded.vectors.length === 0) return [];

  const literal = toVectorLiteral(embedded.vectors[0]);

  // `<=>` é distância de cosseno no pgvector: menor = mais parecido.
  // Filtra por modelo pra nunca comparar vetor gerado por modelo diferente,
  // que produziria um ranking sem sentido em vez de um erro visível.
  const rows = await prisma.$queryRaw<{ text: string; fileName: string }[]>`
    SELECT c.text, d."fileName"
    FROM eva_studio_knowledge_chunks c
    JOIN eva_studio_knowledge_docs d ON d.id = c."docId"
    WHERE c."agentId" = ${agentId}
      AND c.model = ${embedded.model}
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${topK}
  `;

  return rows.map((r) => ({ docLabel: r.fileName, text: r.text }));
}

/** O agente tem busca semântica ligada e com conteúdo indexado? */
export async function hasSemanticIndex(agentId: string): Promise<boolean> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { embeddingModel: true, embeddingCredentialId: true },
  });
  if (!agent?.embeddingModel || !agent.embeddingCredentialId) return false;
  const count = await prisma.knowledgeChunk.count({ where: { agentId } });
  return count > 0;
}
