import "server-only";
import { prisma } from "@/lib/db/prisma";
import { chunkText, semanticSearch, hasSemanticIndex, type SearchHit } from "@/lib/server/embeddings";

// Busca na base de conhecimento do agente.
//
// Dois motores, combinados quando os dois existem:
//
//   full-text (Postgres to_tsvector/ts_rank_cd, dicionário "portuguese")
//       casa PALAVRA. Imbatível em nome próprio, código de produto, número
//       de artigo, sigla — coisas que embedding erra com frequência.
//
//   semântico (pgvector, §19)  — opcional, ligado por agente
//       casa SENTIDO. "vocês parcelam?" encontra "aceitamos em até 12x",
//       que não tem uma palavra em comum.
//
// Quando os dois estão disponíveis, o resultado é fundido por RRF (Reciprocal
// Rank Fusion): cada trecho ganha 1/(k+posição) em cada lista e os pontos
// somam. É o método padrão pra juntar rankings de escalas diferentes sem ter
// que normalizar score de cosseno contra score de ts_rank, que não são
// comparáveis entre si.

const RRF_K = 60;

async function fullTextSearch(agentId: string, query: string, topK: number): Promise<SearchHit[]> {
  const docs = await prisma.knowledgeDoc.findMany({
    where: { agentId },
    select: { fileName: true, content: true },
  });

  const chunks: SearchHit[] = [];
  for (const doc of docs) {
    if (!doc.content.trim()) continue;
    for (const text of chunkText(doc.content)) chunks.push({ docLabel: doc.fileName, text });
  }
  if (chunks.length === 0) return [];
  if (!query.trim()) return chunks.slice(0, topK);

  const texts = chunks.map((c) => c.text);
  // plainto_tsquery une os termos com E (AND) — bom pra busca exata, ruim pra
  // ranking (um trecho só entra se tiver TODOS os termos). Troca por OU (|)
  // e deixa o ts_rank_cd decidir o peso.
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
  return picked.map((r) => chunks[r.idx]);
}

function fuse(lists: SearchHit[][], topK: number): SearchHit[] {
  const scores = new Map<string, { hit: SearchHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, position) => {
      // Chaveia pelo texto: o mesmo trecho pode aparecer nas duas listas e
      // precisa somar, não duplicar.
      const key = hit.text;
      const current = scores.get(key) ?? { hit, score: 0 };
      current.score += 1 / (RRF_K + position + 1);
      scores.set(key, current);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.hit);
}

/**
 * Devolve os `topK` trechos mais relevantes, já formatados com o nome do
 * arquivo de origem (o modelo cita melhor quando sabe de onde veio).
 */
export async function searchKnowledgeBase(agentId: string, query: string, topK = 4): Promise<string[]> {
  const semanticOn = await hasSemanticIndex(agentId);

  // Puxa um pouco mais de cada motor do que o necessário: a fusão só tem o
  // que escolher se cada lista trouxer candidatos além do corte final.
  const perEngine = semanticOn ? topK * 2 : topK;

  const [textHits, vectorHits] = await Promise.all([
    fullTextSearch(agentId, query, perEngine),
    semanticOn ? semanticSearch(agentId, query, perEngine) : Promise.resolve([] as SearchHit[]),
  ]);

  const picked = vectorHits.length > 0 ? fuse([vectorHits, textHits], topK) : textHits.slice(0, topK);
  return picked.map((h) => `# ${h.docLabel}\n${h.text}`);
}
