// Histórico inicial dos negócios que já existiam antes do registro de etapas:
// para cada negócio SEM nenhum evento, grava "nasceu na etapa atual" na data
// de criação. É uma aproximação (a história real anterior não existe) e a tela
// avisa disso. Simulação por padrão; --aplicar grava, tudo numa transação.
//
//   node scripts/backfill-stage-events.mjs            # só conta
//   node scripts/backfill-stage-events.mjs --aplicar  # grava
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const aplicar = process.argv.includes("--aplicar");
const client = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  const alvo = await client.query(`
    SELECT d.id, d."orgId", d."pipelineId", d."stageId", d."createdAt"
      FROM eva_studio_deals d
     WHERE NOT EXISTS (SELECT 1 FROM eva_studio_deal_stage_events e WHERE e."dealId" = d.id)`);
  console.log({ negociosSemHistorico: alvo.rowCount, modo: aplicar ? "APLICAR" : "simulação" });
  if (aplicar) {
    for (const d of alvo.rows) {
      await client.query(
        `INSERT INTO eva_studio_deal_stage_events (id, "orgId", "dealId", "pipelineId", "fromStageId", "toStageId", origem, at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, NULL, $4, 'backfill', $5)`,
        [d.orgId, d.id, d.pipelineId, d.stageId, d.createdAt]
      );
    }
  }
  await client.query(aplicar ? "COMMIT" : "ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
