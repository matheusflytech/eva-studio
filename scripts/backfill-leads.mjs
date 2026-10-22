// Backfill dos leads antigos (Fase 2, Task 10).
//
// Antes da Fase 2, lead = conversa do canal "website" (a etapa ficava na
// conversa). Agora lead = contato com etapa. Este script leva os antigos:
//   1. conversa "website" sem contato ligado: cria o contato com o que a
//      conversa coletou (nome, e-mail, telefone; o resto vai para campos
//      personalizados) e liga a conversa a ele;
//   2. contato ligado a conversa "website" que ainda não é lead: recebe a
//      etapa da conversa mais recente (ou "novo"), a data da primeira conversa
//      como data de lead, o agente e o canal.
//
// Simulação por padrão (tudo numa transação desfeita no fim). Com --aplicar,
// grava e salva em scripts/backfill-leads-<data>.json o que mudou, para
// desfazer se precisar.
//
//   node scripts/backfill-leads.mjs            # simulação
//   node scripts/backfill-leads.mjs --aplicar  # grava
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const aplicar = process.argv.includes("--aplicar");
const ETAPAS = ["novo", "contatado", "qualificado", "ganho", "perdido"];
const CHAVES_NOME = ["nome", "name", "nome_cliente", "nome_completo"];
const CHAVES_EMAIL = ["email", "e-mail", "email_cliente"];
const CHAVES_TELEFONE = ["telefone", "whatsapp", "phone", "celular", "telefone_cliente"];

const texto = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const primeiro = (vars, chaves) => chaves.map((k) => texto(vars[k])).find(Boolean) ?? "";
const emailValido = (e) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e.toLowerCase() : "");
const soDigitos = (t) => {
  const d = t.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13 ? d : "";
};

const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
await client.connect();
const log = { em: new Date().toISOString(), contatosCriados: [], conversasLigadas: [], contatosQueViraramLead: [] };
try {
  await client.query("BEGIN");

  // 1. Conversas do site sem contato.
  const soltas = await client.query(`
    SELECT c.id, c."agentId", c."contactId", c.variables, c."createdAt", c."lastMessageAt", a."orgId"
    FROM eva_studio_conversations c
    JOIN eva_studio_agents a ON a.id = c."agentId"
    WHERE c.channel = 'website' AND c."contactRecordId" IS NULL`);
  for (const c of soltas.rows) {
    const vars = c.variables && typeof c.variables === "object" ? c.variables : {};
    // Já existe contato com esse canal (o motor criou depois)? Só liga.
    const existente = await client.query(
      `SELECT "contactId" FROM eva_studio_contact_channels WHERE "agentId" = $1 AND channel = 'website' AND "externalId" = $2`,
      [c.agentId, c.contactId]
    );
    let contato = existente.rows[0]?.contactId;
    if (!contato) {
      const usadas = new Set([...CHAVES_NOME, ...CHAVES_EMAIL, ...CHAVES_TELEFONE]);
      const extras = Object.fromEntries(Object.entries(vars).filter(([k, v]) => !k.startsWith("__") && !usadas.has(k) && texto(v)));
      contato = randomUUID();
      await client.query(
        `INSERT INTO eva_studio_contacts (id, "orgId", name, email, phone, source, "customFields", "lastSeenAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'site', $6, $7, $8, now())`,
        [contato, c.orgId, primeiro(vars, CHAVES_NOME) || "Visitante do site", emailValido(primeiro(vars, CHAVES_EMAIL)), soDigitos(primeiro(vars, CHAVES_TELEFONE)), extras, c.lastMessageAt, c.createdAt]
      );
      await client.query(
        `INSERT INTO eva_studio_contact_channels (id, "contactId", "agentId", channel, "externalId") VALUES ($1, $2, $3, 'website', $4)`,
        [randomUUID(), contato, c.agentId, c.contactId]
      );
      log.contatosCriados.push(contato);
    }
    await client.query(`UPDATE eva_studio_conversations SET "contactRecordId" = $1 WHERE id = $2`, [contato, c.id]);
    log.conversasLigadas.push(c.id);
  }

  // 2. Contatos ligados a conversa do site que ainda não são lead.
  const alvo = await client.query(`
    SELECT DISTINCT ON (c."contactRecordId")
      c."contactRecordId" AS contato, c."leadStage" AS etapa, c."agentId" AS agente,
      min(c."createdAt") OVER (PARTITION BY c."contactRecordId") AS em
    FROM eva_studio_conversations c
    JOIN eva_studio_contacts ct ON ct.id = c."contactRecordId"
    WHERE c.channel = 'website' AND ct."leadStage" IS NULL
    ORDER BY c."contactRecordId", c."lastMessageAt" DESC`);
  for (const r of alvo.rows) {
    const etapa = ETAPAS.includes(r.etapa) ? r.etapa : "novo";
    await client.query(
      `UPDATE eva_studio_contacts SET "leadStage" = $1, "leadAt" = $2, "leadAgentId" = $3, "leadChannel" = 'website'
       WHERE id = $4 AND "leadStage" IS NULL`,
      [etapa, r.em, r.agente, r.contato]
    );
    log.contatosQueViraramLead.push(r.contato);
  }

  console.log({
    modo: aplicar ? "APLICAR" : "simulação",
    conversasSemContato: soltas.rowCount,
    contatosCriados: log.contatosCriados.length,
    contatosQueViramLead: log.contatosQueViraramLead.length,
  });
  await client.query(aplicar ? "COMMIT" : "ROLLBACK");
  if (aplicar) {
    const arquivo = `scripts/backfill-leads-${log.em.slice(0, 10)}.json`;
    fs.writeFileSync(arquivo, JSON.stringify(log, null, 2));
    console.log(`O que mudou: ${arquivo}`);
  }
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
