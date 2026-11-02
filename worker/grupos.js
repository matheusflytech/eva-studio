// Grupos do número conectado por QR: sincroniza a lista com o banco e diz, por
// grupo, se o agente responde (eva_studio_whatsapp_groups, SQL 2026-11-07).
//
// mode  mention  só responde quando marcam o número ou respondem a ele (padrão)
//       all      responde a tudo que chega no grupo
//       off      só registra a mensagem, nunca responde
//
// Separado do index.js para ser testável sem subir o Baileys.

const MODOS_VALIDOS = new Set(["mention", "all", "off"]);

/** Existe a tabela de grupos? Decidido na subida; sem ela o worker segue como antes. */
export async function temTabelaDeGrupos(pool) {
  const { rows } = await pool.query(`select to_regclass('public.eva_studio_whatsapp_groups') as t`);
  return !!rows[0]?.t;
}

/**
 * Resposta de sock.groupFetchAllParticipating() ({ [jid]: metadata }) em linhas.
 * Descarta o que não é grupo (@g.us) e limita o nome a 200 caracteres.
 * @param {Record<string, { id?: string, subject?: string, size?: number, participants?: unknown[] }> | null | undefined} resposta
 */
export function gruposParaLinhas(resposta) {
  const linhas = [];
  for (const [chave, g] of Object.entries(resposta ?? {})) {
    const jid = g?.id ?? chave;
    if (typeof jid !== "string" || !jid.endsWith("@g.us")) continue;
    linhas.push({
      jid,
      subject: String(g?.subject ?? "").slice(0, 200),
      participantsCount: Number(g?.size ?? g?.participants?.length ?? 0) || 0,
    });
  }
  return linhas;
}

/**
 * Grava a lista: grupos novos entram com o modo padrão (mention), os que já
 * existiam só atualizam nome e tamanho (o modo que a pessoa escolheu fica), e
 * os que sumiram da lista viram present = false (a conversa antiga continua
 * apontando para a linha).
 *
 * @param {{ query: Function }} pool
 * @param {string} canalId
 * @param {{ jid: string, subject: string, participantsCount: number }[]} linhas
 * @returns {Promise<number>} quantos grupos estão presentes
 */
export async function sincronizarGrupos(pool, canalId, linhas) {
  const { rows } = await pool.query(`select "orgId" from eva_studio_canais where id = $1 and tipo = 'whatsapp_qr'`, [canalId]);
  const orgId = rows[0]?.orgId;
  if (!orgId) return 0;

  for (const g of linhas) {
    await pool.query(
      `insert into eva_studio_whatsapp_groups (id, "orgId", "channelId", jid, subject, "participantsCount", present, "syncedAt", "updatedAt")
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5, true, now(), now())
       on conflict ("channelId", jid)
       do update set subject = excluded.subject, "participantsCount" = excluded."participantsCount", present = true, "syncedAt" = now(), "updatedAt" = now()`,
      [orgId, canalId, g.jid, g.subject, g.participantsCount]
    );
  }
  const jids = linhas.map((g) => g.jid);
  await pool.query(
    `update eva_studio_whatsapp_groups set present = false, "updatedAt" = now()
     where "channelId" = $1 and present = true and not (jid = any($2::text[]))`,
    [canalId, jids]
  );
  return linhas.length;
}

const cacheDeModo = new Map(); // `${canalId}|${jid}` -> { modo, em }
const VALIDADE_DO_MODO_MS = 30_000;

/**
 * Modo do grupo. Um grupo ainda não sincronizado (ou sem a tabela) usa o
 * padrão "mention": o comportamento de antes. Guardado por 30 s para não ir
 * ao banco a cada mensagem do grupo; mudar o modo na tela vale em até 30 s.
 *
 * @param {{ query: Function }} pool
 * @param {string} canalId
 * @param {string} jid
 * @returns {Promise<"mention" | "all" | "off">}
 */
export async function modoDoGrupo(pool, canalId, jid) {
  const chave = `${canalId}|${jid}`;
  const guardado = cacheDeModo.get(chave);
  if (guardado && Date.now() - guardado.em < VALIDADE_DO_MODO_MS) return guardado.modo;
  let modo = "mention";
  try {
    const { rows } = await pool.query(`select mode from eva_studio_whatsapp_groups where "channelId" = $1 and jid = $2`, [canalId, jid]);
    if (MODOS_VALIDOS.has(rows[0]?.mode)) modo = rows[0].mode;
  } catch {
    // Tabela ausente ou banco instável: cai no padrão em vez de calar o grupo.
  }
  cacheDeModo.set(chave, { modo, em: Date.now() });
  return modo;
}

/** Só para teste: esquece o que ficou guardado. */
export function esquecerModos() {
  cacheDeModo.clear();
}
