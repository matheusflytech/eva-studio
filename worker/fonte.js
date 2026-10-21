// De onde vem cada sessão do WhatsApp por QR.
//
// Modo "canal" (canais do contrato, SQL 2026-10-22): uma sessão por canal,
// guardada em eva_studio_canais_whatsapp_qr; o agente que atende é lido em
// eva_studio_canais na hora de cada mensagem (trocar o agente não reinicia a
// sessão). Modo "agente" (antes do SQL): uma sessão por agente, em
// eva_studio_whatsapp_connections, como sempre foi.
//
// O modo é decidido uma vez, na subida: existe a tabela nova = modo canal.
// A migração copia as sessões antigas para a tabela nova, então nunca há duas
// sessões abertas para o mesmo número.
//
// Separado do index.js para ser testável sem subir o Baileys.

export const MODOS = {
  canal: { tabela: "eva_studio_canais_whatsapp_qr", coluna: "canalId" },
  agente: { tabela: "eva_studio_whatsapp_connections", coluna: "agentId" },
};

/** @param {{ query: Function }} pool */
export async function detectarModo(pool) {
  const { rows } = await pool.query(`select to_regclass('public.eva_studio_canais_whatsapp_qr') as t`);
  return rows[0]?.t ? "canal" : "agente";
}

/**
 * Agente que atende pela sessão `chave` agora. No modo agente é a própria
 * chave; no modo canal, o agentId do canal (null = canal sem agente).
 *
 * @param {{ query: Function }} pool
 * @param {"canal" | "agente"} modo
 * @param {string} chave
 */
export async function agenteDaSessao(pool, modo, chave) {
  if (modo === "agente") return chave;
  const { rows } = await pool.query(`select "agentId" from eva_studio_canais where id = $1 and tipo = 'whatsapp_qr'`, [chave]);
  return rows[0]?.agentId ?? null;
}

/**
 * Sessão que um agente usa (para a fila de saída e as esperas, que guardam
 * o agentId). No modo agente é o próprio agente; no modo canal, o canal QR
 * que ele atende (null = nenhum).
 *
 * @param {{ query: Function }} pool
 * @param {"canal" | "agente"} modo
 * @param {string} agentId
 */
export async function sessaoDoAgente(pool, modo, agentId) {
  if (modo === "agente") return agentId;
  const { rows } = await pool.query(
    `select id from eva_studio_canais where "agentId" = $1 and tipo = 'whatsapp_qr' limit 1`,
    [agentId]
  );
  return rows[0]?.id ?? null;
}

/**
 * Atualiza o estado da sessão. No modo canal também espelha no canal o
 * número e a situação, que é o que a tela de Canais mostra.
 *
 * @param {{ query: Function }} pool
 * @param {"canal" | "agente"} modo
 * @param {string} chave
 * @param {Record<string, unknown>} patch campos de MODOS[modo].tabela
 */
export async function gravarEstado(pool, modo, chave, patch) {
  const { tabela, coluna } = MODOS[modo];
  const campos = Object.keys(patch);
  const set = campos.map((f, i) => `"${f}" = $${i + 2}`).join(", ");
  await pool.query(`update ${tabela} set ${set}, "updatedAt" = now() where "${coluna}" = $1`, [chave, ...campos.map((f) => patch[f])]);

  if (modo !== "canal" || !("status" in patch)) return;
  const situacao = patch.status === "connected" ? "conectado" : patch.status === "disconnected" ? "desconectado" : "pendente";
  const numero = typeof patch.phoneNumber === "string" && patch.phoneNumber ? patch.phoneNumber : null;
  await pool.query(
    `update eva_studio_canais set status = $2, rotulo = coalesce($3, rotulo), "externalId" = coalesce($3, "externalId"), "updatedAt" = now() where id = $1`,
    [chave, situacao, numero]
  );
}

/** Limpa a sessão (logout): apaga credenciais e QR. */
export async function limparSessao(pool, modo, chave) {
  await gravarEstado(pool, modo, chave, { status: "disconnected", qrDataUrl: null, phoneNumber: null, creds: null, keys: null });
}

/** Sessões a abrir/fechar agora. */
export async function sessoesPendentes(pool, modo) {
  const { tabela, coluna } = MODOS[modo];
  const { rows } = await pool.query(`select "${coluna}" as chave, status from ${tabela} where status in ('requesting', 'logging_out')`);
  return rows;
}

/** Sessões que estavam conectadas (para retomar ao subir). */
export async function sessoesConectadas(pool, modo) {
  const { tabela, coluna } = MODOS[modo];
  const { rows } = await pool.query(`select "${coluna}" as chave from ${tabela} where status = 'connected'`);
  return rows.map((r) => r.chave);
}
