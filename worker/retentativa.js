// Reenvio quando o aparelho de quem recebe não conseguiu decifrar a mensagem.
//
// O WhatsApp de destino pede "manda de novo" (retry receipt) e o Baileys chama
// getMessage(key) para cifrar outra vez. Sem resposta, a mensagem fica em
// "Aguardando mensagem. Essa ação pode levar alguns instantes" até a pessoa
// responder. Guardamos as enviadas na memória; depois de reiniciar (Render
// hiberna), o texto vem da fila de saída pelo id que o WhatsApp deu.

/** Memória das últimas mensagens enviadas (id -> conteúdo), com limite. */
export function criarMemoriaDeEnviadas(limite = 5000) {
  const mapa = new Map();
  return {
    lembrar(msg) {
      const id = msg?.key?.id;
      if (!id || !msg.key.fromMe || !msg.message) return;
      mapa.delete(id);
      mapa.set(id, msg.message);
      if (mapa.size > limite) mapa.delete(mapa.keys().next().value);
    },
    pegar: (id) => mapa.get(id),
  };
}

/** CacheStore mínimo para o msgRetryCounterCache do Baileys (conta as tentativas por mensagem). */
export function cacheSimples() {
  const mapa = new Map();
  return {
    get: (k) => mapa.get(k),
    set: (k, v) => {
      mapa.set(k, v);
      if (mapa.size > 10000) mapa.delete(mapa.keys().next().value);
    },
    del: (k) => mapa.delete(k),
    flushAll: () => mapa.clear(),
  };
}

/** Conteúdo para o Baileys reenviar: memória, senão o texto gravado na fila de saída. */
export async function mensagemParaReenvio(pool, memoria, key) {
  const id = key?.id;
  if (!id) return undefined;
  const lembrada = memoria.pegar(id);
  if (lembrada) return lembrada;
  const { rows } = await pool.query(`select text from eva_studio_outbound_queue where "externalId" = $1 limit 1`, [id]);
  const texto = rows[0]?.text;
  return texto ? { conversation: texto } : undefined;
}
