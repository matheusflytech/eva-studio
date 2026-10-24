// Conversa do worker com o motor de fluxo do app. Separado do index.js pra ser
// testável sem subir o Baileys.

/** Esperas entre tentativas quando o app falha (deploy da Vercel, banco engasgado). */
export const ESPERAS_MS = [2000, 5000, 15000];

/**
 * Manda a mensagem ao motor e devolve as respostas. 5xx, 429 e falha de rede
 * tentam de novo: antes o worker desistia na hora e a mensagem do cliente
 * sumia. O app libera o id da mensagem quando falha, então a nova tentativa
 * não é tratada como repetida. 4xx não adianta repetir.
 *
 * @param {string} url
 * @param {string} segredo
 * @param {object} corpo
 * @param {number[]} [esperasMs]
 * @returns {Promise<object[]>}
 */
export async function chamarMotor(url, segredo, corpo, esperasMs = ESPERAS_MS) {
  for (let tentativa = 0; ; tentativa += 1) {
    const ultima = tentativa >= esperasMs.length;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": segredo },
        body: JSON.stringify(corpo),
      });
    } catch (err) {
      if (ultima) throw err;
    }
    if (res?.ok) return (await res.json()).messages ?? [];
    if (res && ((res.status < 500 && res.status !== 429) || ultima)) throw new Error(`HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, esperasMs[tentativa]));
  }
}

/**
 * Tira o prazo da espera vencida, só se ele ainda for o mesmo. Sem prazo o
 * bloco Esperar segue no motor; só quem conseguir tirar retoma, então uma
 * rodada lenta ou um segundo worker no ar (deploy) não manda o follow-up de
 * novo.
 *
 * @param {{ query: Function }} pool
 * @param {string} conversaId
 * @param {string} prazo valor de __wait_until lido na varredura
 */
export async function reivindicarEspera(pool, conversaId, prazo) {
  const r = await pool.query(
    `update eva_studio_conversations set variables = variables - '__wait_until'
      where id = $1 and variables->>'__wait_until' = $2`,
    [conversaId, prazo]
  );
  return r.rowCount > 0;
}
