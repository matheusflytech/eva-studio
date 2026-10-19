// Fila de saída do WhatsApp via QR (eva_studio_outbound_queue).
//
// Separado do index.js pra ser testável sem subir o Baileys. Tudo recebe o
// pool do pg por parâmetro.
//
// Trava: o item é reivindicado com UPDATE ... WHERE id IN (SELECT ... FOR
// UPDATE SKIP LOCKED) — dois workers (ou um deploy novo subindo antes do
// antigo cair) nunca pegam o mesmo item. O item fica em 'sending' com
// claimedAt; quem passa para 'sent'/'failed' só faz isso se ele ainda estiver
// em 'sending', então um item expirado não é contado duas vezes.

/** Minutos que um item pode ficar em 'sending' antes de ser dado como falho. */
export const MINUTOS_TRAVADO = 15;

const CAMPOS_DO_PLACAR = new Set(["sentCount", "failedCount"]);

/**
 * @param {{ query: Function }} pool
 * @param {number} limite
 */
export async function reivindicarItens(pool, limite = 20) {
  const { rows } = await pool.query(
    `update eva_studio_outbound_queue q
        set status = 'sending', "claimedAt" = now()
      where q.id in (
        select id from eva_studio_outbound_queue
         where status = 'pending'
         order by "createdAt" asc
         limit $1
         for update skip locked
      )
      returning q.id, q."agentId", q."contactId", q.text, q."broadcastId", q."variantId",
                q."mediaPath", q."mediaType", q."mediaMime", q."mediaName", q."createdAt"`,
    [limite]
  );
  // RETURNING não garante ordem: o contato tem que receber na ordem em que foi escrito.
  return [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * Soma no placar do disparo e fecha quando todo mundo foi processado, numa
 * instrução só (sem ler-e-depois-escrever). O app (runBroadcast) usa a mesma
 * regra no fechamento dele; quem fizer a última conta fecha.
 *
 * @param {{ query: Function }} pool
 * @param {string} broadcastId
 * @param {string | null | undefined} variantId
 * @param {string} campo "sentCount" | "failedCount"
 */
export async function somarNoDisparo(pool, broadcastId, variantId, campo) {
  if (!CAMPOS_DO_PLACAR.has(campo)) throw new Error(`Campo de placar inválido: ${campo}`);
  await pool.query(
    `update eva_studio_broadcasts set "${campo}" = "${campo}" + 1,
       status = case when status = 'sending' and "totalCount" > 0 and "sentCount" + "failedCount" + 1 >= "totalCount" then 'done' else status end
     where id = $1`,
    [broadcastId]
  );
  if (variantId) {
    await pool.query(`update eva_studio_broadcast_variants set "${campo}" = "${campo}" + 1 where id = $1`, [variantId]);
  }
}

/**
 * @param {{ query: Function }} pool
 * @param {{ id: string, broadcastId?: string | null, variantId?: string | null }} item
 */
export async function marcarEnviado(pool, item) {
  const r = await pool.query(
    `update eva_studio_outbound_queue set status = 'sent', "sentAt" = now() where id = $1 and status = 'sending'`,
    [item.id]
  );
  if (r.rowCount > 0 && item.broadcastId) await somarNoDisparo(pool, item.broadcastId, item.variantId, "sentCount");
}

/**
 * @param {{ query: Function }} pool
 * @param {{ id: string, broadcastId?: string | null, variantId?: string | null }} item
 * @param {string} erro
 */
export async function marcarFalha(pool, item, erro) {
  const r = await pool.query(
    `update eva_studio_outbound_queue set status = 'failed', error = $2 where id = $1 and status = 'sending'`,
    [item.id, erro]
  );
  if (r.rowCount > 0 && item.broadcastId) await somarNoDisparo(pool, item.broadcastId, item.variantId, "failedCount");
}

/**
 * Item preso em 'sending' (o worker caiu no meio do envio). Não volta pra
 * 'pending': não dá pra saber se o WhatsApp entregou, e mandar duas vezes é
 * pior do que avisar que falhou.
 *
 * @param {{ query: Function }} pool
 * @param {number} minutos
 */
export async function expirarTravados(pool, minutos = MINUTOS_TRAVADO) {
  const { rows } = await pool.query(
    `update eva_studio_outbound_queue
        set status = 'failed', error = 'Envio interrompido (o worker reiniciou no meio). Confira com o contato antes de reenviar.'
      where status = 'sending' and "claimedAt" < now() - make_interval(mins => $1)
      returning id, "broadcastId", "variantId"`,
    [minutos]
  );
  for (const row of rows) {
    if (row.broadcastId) await somarNoDisparo(pool, row.broadcastId, row.variantId, "failedCount");
  }
  return rows.length;
}
