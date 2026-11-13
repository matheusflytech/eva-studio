// Ritmo dos disparos em massa pelo WhatsApp via QR.
//
// Chip novo mandando rápido para quem não tem o número salvo é banido. Por isso
// cada agente (um chip por agente) solta no máximo 1 mensagem de disparo a cada
// DISPARO_PAUSA_MIN_S..DISPARO_PAUSA_MAX_S segundos (sorteado) e no máximo
// DISPARO_LIMITE_DIA por dia (horário de Brasília). O que passar do limite fica
// na fila e sai no dia seguinte. Respostas de atendimento não passam por aqui.

function numero(valor, padrao) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}

export const RITMO = {
  pausaMinS: numero(process.env.DISPARO_PAUSA_MIN_S, 8),
  pausaMaxS: numero(process.env.DISPARO_PAUSA_MAX_S, 20),
  limiteDia: numero(process.env.DISPARO_LIMITE_DIA, 200),
};

/** Pausa sorteada entre min e max segundos, em ms. */
export function pausaMs(minS, maxS, sorteio = Math.random) {
  const a = Math.min(minS, maxS), b = Math.max(minS, maxS);
  return Math.round((a + (b - a) * sorteio()) * 1000);
}

/**
 * Destino do disparo no formato do WhatsApp. "5511999990001", "+55 (11) 99999-0001"
 * ou "11999990001" (sem DDI: assume Brasil) viram "5511999990001@s.whatsapp.net".
 * Já com "@" (jid de contato, @lid ou grupo @g.us) fica como está. Inválido = null.
 */
export function paraJid(contato) {
  const bruto = String(contato ?? "").trim();
  if (!bruto) return null;
  if (bruto.includes("@")) return bruto;
  let digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = "55" + digitos;
  if (digitos.length < 12 || digitos.length > 15) return null;
  return digitos + "@s.whatsapp.net";
}

export const MOTIVO_CHIP_CAIU = "O chip foi desconectado ou banido (o WhatsApp encerrou a sessão). Reenvie por outro chip.";

/**
 * Sessão encerrada de vez (logout ou número recusado): o que estava na fila de
 * disparo deste chip falha de uma vez, com o motivo, em vez de ir falhando um a
 * um no ritmo do freio. Assim a tela já mostra quem reenviar por outro chip.
 * @returns as linhas marcadas (para somar no placar de cada disparo)
 */
export async function falharPendentesDoChip(pool, modo, chave) {
  const { rows } = await pool.query(
    modo === "agente"
      ? `update eva_studio_outbound_queue set status = 'failed', error = $2
          where status = 'pending' and "broadcastId" is not null and "agentId" = $1
          returning id, "broadcastId", "variantId"`
      : `update eva_studio_outbound_queue set status = 'failed', error = $2
          where status = 'pending' and "broadcastId" is not null
            and "agentId" in (select "agentId" from eva_studio_canais where id = $1 and "agentId" is not null)
          returning id, "broadcastId", "variantId"`,
    [chave, MOTIVO_CHIP_CAIU]
  );
  return rows;
}

/** Agentes com item de disparo esperando na fila. */
export async function agentesComDisparo(pool) {
  const { rows } = await pool.query(
    `select distinct "agentId" from eva_studio_outbound_queue where status = 'pending' and "broadcastId" is not null
        and not exists (select 1 from eva_studio_broadcasts b where b.id = "broadcastId" and b.status = 'canceled')`
  );
  return rows.map((r) => r.agentId);
}

/** Itens de disparo que este agente já soltou hoje (Brasília), enviados ou falhos no envio. */
export async function soltosHoje(pool, agentId) {
  const { rows } = await pool.query(
    `select count(*)::int as n from eva_studio_outbound_queue
      where "agentId" = $1 and "broadcastId" is not null and "claimedAt" is not null
        and "claimedAt" >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`,
    [agentId]
  );
  return rows[0]?.n ?? 0;
}

/** Reivindica o próximo item de disparo deste agente (mesma trava do reivindicarItens). */
export async function reivindicarDoDisparo(pool, agentId) {
  const { rows } = await pool.query(
    `update eva_studio_outbound_queue q
        set status = 'sending', "claimedAt" = now()
      where q.id in (
        select id from eva_studio_outbound_queue
         where status = 'pending' and "broadcastId" is not null and "agentId" = $1
           and not exists (select 1 from eva_studio_broadcasts b where b.id = "broadcastId" and b.status = 'canceled')
         order by "createdAt" asc
         limit 1
         for update skip locked
      )
      returning q.id, q."agentId", q."contactId", q.text, q."broadcastId", q."variantId",
                q."mediaPath", q."mediaType", q."mediaMime", q."mediaName", q."createdAt"`,
    [agentId]
  );
  return rows[0] ?? null;
}
