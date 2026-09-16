import "server-only";
import { prisma } from "@/lib/db/prisma";

// Busca com ranking (sem vector DB nem embeddings): quebra os documentos em
// pedaços e pontua cada pedaço com o full-text search nativo do Postgres
// (to_tsvector/ts_rank_cd, dicionário "portuguese" — já lida com plural,
// conjugação etc. sem precisar de stemmer próprio). É o meio-termo pragmático
// entre "manda o documento inteiro" (o que o motor fazia antes) e montar uma
// infra de embeddings/vetor só pra isso — zero dependência nova, o Postgres
// que já usamos faz o trabalho.

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

function chunkText(content: string): string[] {
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

// Devolve os `topK` trechos mais relevantes pra `query` entre todos os
// documentos desse agente. Sem nenhum trecho relevante (score 0 em todos),
// cai pra devolver os primeiros pedaços em vez de nada — melhor dar algum
// contexto do que devolver vazio pro agente.
export async function searchKnowledgeBase(agentId: string, query: string, topK = 4): Promise<string[]> {
  const docs = await prisma.knowledgeDoc.findMany({ where: { agentId }, select: { fileName: true, content: true } });

  const chunks: { docLabel: string; text: string }[] = [];
  for (const doc of docs) {
    if (!doc.content.trim()) continue;
    for (const text of chunkText(doc.content)) chunks.push({ docLabel: doc.fileName, text });
  }
  if (chunks.length === 0) return [];
  if (!query.trim()) return chunks.slice(0, topK).map((c) => `# ${c.docLabel}\n${c.text}`);

  const texts = chunks.map((c) => c.text);
  // plainto_tsquery une os termos da pergunta com E (AND) — bom pra busca
  // exata, ruim pra ranking de relevância (um trecho só entra se tiver TODOS
  // os termos). Troca por OU (|) pra pontuar qualquer sobreposição parcial,
  // deixando o ts_rank_cd decidir o peso de cada trecho.
  const ranked = await prisma.$queryRaw<{ idx: number; score: number }[]>`
    SELECT (ordinality - 1)::int AS idx,
           ts_rank_cd(
             to_tsvector('portuguese', text),
             to_tsquery('portuguese', replace(plainto_tsquery('portuguese', ${query})::text, ' & ', ' | '))
           ) AS score
    FROM unnest(${texts}::text[]) WITH ORDINALITY AS t(text, ordinality)
    ORDER BY score DESC
  `;

  const relevant = ranked.filter((r) => r.score > 0).slice(0, topK);
  const picked = relevant.length > 0 ? relevant : ranked.slice(0, topK);
  return picked.map((r) => `# ${chunks[r.idx].docLabel}\n${chunks[r.idx].text}`);
}
