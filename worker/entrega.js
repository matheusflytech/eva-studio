// Tiques do WhatsApp via QR (enviada → entregue → lida).
//
// O Baileys avisa em "messages.update" quando uma mensagem que NÓS mandamos
// chegou ao celular e quando foi lida. Aqui isso vira o deliveryStatus da
// mensagem (os tiques em Conversas) e, se ela saiu num disparo, o placar de
// entregues/lidas. Mesma ordem do webhook da Meta: um recibo atrasado nunca
// volta o tique (lida não vira entregue).
//
// Separado do index.js para ser testável sem subir o Baileys.

/**
 * Status do recibo do Baileys (proto.WebMessageInfo.Status) para o nosso.
 * 3 = entregue, 4 = lida, 5 = ouvida (áudio). O resto não muda tique.
 * @param {number | null | undefined} n
 */
export function statusDoRecibo(n) {
  if (n === 3) return "delivered";
  if (n === 4 || n === 5) return "read";
  return null;
}

const ANTERIORES = {
  delivered: ["sending", "queued", "sent"],
  read: ["sending", "queued", "sent", "delivered"],
};

/**
 * @param {{ query: Function }} pool
 * @param {string} externalId id que o WhatsApp deu à mensagem
 * @param {"delivered" | "read"} status
 */
export async function aplicarRecibo(pool, externalId, status) {
  await pool.query(
    `update eva_studio_messages set "deliveryStatus" = $2 where "externalId" = $1 and "deliveryStatus" = any($3)`,
    [externalId, status, ANTERIORES[status]]
  );
  // Lida sem "entregue" antes (recibo perdido) também conta como entregue.
  await contarNoDisparo(pool, externalId, "deliveredAt", "deliveredCount");
  if (status === "read") await contarNoDisparo(pool, externalId, "readAt", "readCount");
}

/**
 * Uma vez por mensagem: só a linha da fila com a data ainda vazia é marcada,
 * e só ela soma no disparo.
 * @param {{ query: Function }} pool
 * @param {string} externalId
 * @param {"deliveredAt" | "readAt"} coluna
 * @param {"deliveredCount" | "readCount"} contador
 */
async function contarNoDisparo(pool, externalId, coluna, contador) {
  const { rows } = await pool.query(
    `update eva_studio_outbound_queue set "${coluna}" = now()
      where "externalId" = $1 and "${coluna}" is null
      returning "broadcastId"`,
    [externalId]
  );
  const disparos = rows.map((r) => r.broadcastId).filter(Boolean);
  if (disparos.length > 0) {
    await pool.query(`update eva_studio_broadcasts set "${contador}" = "${contador}" + 1 where id = any($1)`, [disparos]);
  }
}

/**
 * Resposta do agente (já gravada pelo app como "sent", sem id): anota o id que
 * o WhatsApp deu, para os recibos acharem. Acha pela conversa e pelo texto,
 * como o webhook da Meta faz (anotarEnvioDoBot).
 * @param {{ query: Function }} pool
 * @param {{ agentId: string, contactId: string, texto: string, id: string }} envio
 */
export async function anotarIdDaResposta(pool, { agentId, contactId, texto, id }) {
  await pool.query(
    `update eva_studio_messages set "externalId" = $4
      where id = (
        select m.id from eva_studio_messages m
          join eva_studio_conversations c on c.id = m."conversationId"
         where c."agentId" = $1 and c.channel = 'whatsapp_qr' and c."contactId" = $2
           and m.role = 'bot' and m.text = $3 and m."externalId" is null
         order by m."createdAt" desc
         limit 1
      )`,
    [agentId, contactId, texto, id]
  );
}
