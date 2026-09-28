import { config } from "dotenv";
config({ path: ".env.local" });
import pg from "pg";

// ---------------------------------------------------------------------------
// O que o Prisma não sabe fazer, e precisa rodar depois de todo `db push`.
//
// O índice vetorial é HNSW sobre uma coluna `vector(1536)`, e nem o tipo nem o
// índice existem no vocabulário do schema.prisma: a coluna é `Unsupported` e o
// índice não é expressável. Resultado: **todo `prisma db push` recria a tabela
// de chunks e leva o índice junto**, em silêncio. Já aconteceu uma vez, e a
// busca semântica continua respondendo, só que varrendo a tabela inteira em
// vez de usar vizinho mais próximo — o tipo de falha que ninguém percebe até a
// base crescer.
//
// Por isso `npm run db:push` roda `prisma db push` e este arquivo em seguida,
// e não há caminho normal que aplique o schema sem passar por aqui.
//
// HNSW e não IVFFlat: IVFFlat precisa ser treinado sobre dados existentes, e
// numa tabela vazia geraria um índice ruim de forma permanente.
// ---------------------------------------------------------------------------

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não encontrada. Rode a partir da raiz do projeto, com .env.local presente.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  await client.query("CREATE EXTENSION IF NOT EXISTS vector");

  await client.query(`
    CREATE INDEX IF NOT EXISTS eva_studio_knowledge_chunks_embedding_idx
    ON eva_studio_knowledge_chunks
    USING hnsw (embedding vector_cosine_ops)
  `);

  const { rows } = await client.query(
    `SELECT indexname FROM pg_indexes
      WHERE tablename = 'eva_studio_knowledge_chunks'
        AND indexname = 'eva_studio_knowledge_chunks_embedding_idx'`
  );

  if (rows.length === 0) {
    console.error("pós-migração: o índice vetorial NÃO foi criado. A busca semântica vai varrer a tabela inteira.");
    process.exit(1);
  }

  console.log("pós-migração ok: pgvector instalado e índice HNSW no lugar.");
} catch (error) {
  console.error("pós-migração falhou:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
