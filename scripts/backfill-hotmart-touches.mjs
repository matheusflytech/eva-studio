// Origem das vendas da Hotmart que já estavam em eva_studio_sales antes da M1
// de Marketing: para cada contato com src/sck numa venda, grava UM toque
// `hotmart` por par (src, sck) na data do pedido mais antigo, e o negócio da
// venda que ainda não tem origem recebe esse toque. Simulação por padrão;
// --aplicar grava, tudo numa transação. Rodar só depois do
// prisma/sql/2026-11-05-marketing.sql e com OK.
//
//   node scripts/backfill-hotmart-touches.mjs            # só conta
//   node scripts/backfill-hotmart-touches.mjs --aplicar  # grava
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const aplicar = process.argv.includes("--aplicar");
// Mesma regra de normalizeUtm (src/lib/marketing/touch.ts).
const utm = (v) => {
  const s = typeof v === "string" ? v.trim().toLowerCase().slice(0, 200) : "";
  return s || null;
};

const client = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  const vendas = await client.query(`
    SELECT s."orgId", s."contactId", s."dealId", s.src, s.sck, COALESCE(s."orderedAt", s."approvedAt", s."createdAt") AS at
      FROM eva_studio_sales s
      JOIN eva_studio_contacts c ON c.id = s."contactId"
     WHERE s.platform = 'hotmart' AND (NULLIF(trim(s.src), '') IS NOT NULL OR NULLIF(trim(s.sck), '') IS NOT NULL)
     ORDER BY at ASC`);

  // Um toque por contato + par, na venda mais antiga.
  const pares = new Map();
  for (const v of vendas.rows) {
    const src = utm(v.src);
    const sck = utm(v.sck);
    const chave = `${v.contactId}|${src}|${sck}`;
    const atual = pares.get(chave);
    if (atual) atual.deals.add(v.dealId);
    else pares.set(chave, { orgId: v.orgId, contactId: v.contactId, src, sck, at: v.at, deals: new Set([v.dealId]) });
  }

  let toques = 0;
  let origens = 0;
  for (const p of pares.values()) {
    const existe = await client.query(
      `SELECT id FROM eva_studio_touchpoints WHERE "contactId" = $1 AND channel = 'hotmart' AND "utmSource" IS NOT DISTINCT FROM $2 AND "utmCampaign" IS NOT DISTINCT FROM $3 LIMIT 1`,
      [p.contactId, p.src, p.sck]
    );
    let id = existe.rows[0]?.id;
    if (!id) {
      toques++;
      if (aplicar) {
        const r = await client.query(
          `INSERT INTO eva_studio_touchpoints (id, "orgId", "contactId", at, channel, paid, "utmSource", "utmCampaign", raw)
           VALUES (gen_random_uuid()::text, $1, $2, $3, 'hotmart', false, $4, $5, '{"backfill":true}') RETURNING id`,
          [p.orgId, p.contactId, p.at, p.src, p.sck]
        );
        id = r.rows[0].id;
      }
    }
    for (const dealId of p.deals) {
      if (!dealId) continue;
      const tem = await client.query(`SELECT 1 FROM eva_studio_deal_origins WHERE "dealId" = $1`, [dealId]);
      if (tem.rowCount) continue;
      origens++;
      if (aplicar) {
        await client.query(
          `INSERT INTO eva_studio_deal_origins ("dealId", "orgId", "touchpointId", "firstTouchpointId") VALUES ($1, $2, $3, $3) ON CONFLICT DO NOTHING`,
          [dealId, p.orgId, id]
        );
      }
    }
  }
  console.log({ vendasComOrigem: vendas.rowCount, toquesNovos: toques, negociosComOrigemNova: origens, modo: aplicar ? "APLICAR" : "simulação" });
  await client.query(aplicar ? "COMMIT" : "ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
