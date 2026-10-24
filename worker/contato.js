// Quem é o contato de uma mensagem recebida pelo QR, e se o agente responde.
//
// Conversa 1:1 (@s.whatsapp.net ou @lid): o agente responde sempre.
// Grupo (@g.us): entra no app como conversa do grupo, mas o agente só
// responde quando alguém marca o número dele (@) ou responde a uma mensagem
// dele; no resto, a mensagem é só registrada. Status e lista de transmissão
// (@broadcast), canal (@newsletter) e bots ficam de fora.
//
// "@lid" é o id de privacidade do WhatsApp (não é telefone). Quando a
// mensagem traz o número junto (key.senderPn), o contato é o número, para a
// ficha ter o celular da pessoa.
//
// Separado do index.js para ser testável sem subir o Baileys.

/** "5511999990001:12@s.whatsapp.net" -> "5511999990001" (sem aparelho nem servidor). */
export function usuarioDoJid(jid) {
  return (jid ?? "").split("@")[0].split(":")[0];
}

/** contextInfo de qualquer tipo de mensagem (texto, imagem, áudio...). */
function contextoDa(mensagem) {
  for (const valor of Object.values(mensagem ?? {})) {
    if (valor && typeof valor === "object" && valor.contextInfo) return valor.contextInfo;
  }
  return null;
}

/**
 * @param {{ key?: { remoteJid?: string | null, senderPn?: string | null }, message?: object } | undefined} msg
 * @param {{ id?: string, lid?: string } | undefined} eu  sock.user (o número conectado)
 * @returns {{ contato: string, grupo: boolean, responder: boolean } | null}
 */
export function analisarMensagem(msg, eu) {
  const key = msg?.key;
  const jid = key?.remoteJid ?? "";
  const servidor = jid.split("@")[1];
  if (servidor === "s.whatsapp.net") return { contato: jid, grupo: false, responder: true };
  if (servidor === "lid") {
    const contato = key?.senderPn?.endsWith("@s.whatsapp.net") ? key.senderPn : jid;
    return { contato, grupo: false, responder: true };
  }
  if (servidor !== "g.us") return null;

  const meus = new Set([usuarioDoJid(eu?.id), usuarioDoJid(eu?.lid)].filter(Boolean));
  const ctx = contextoDa(msg?.message);
  const marcado = (ctx?.mentionedJid ?? []).some((m) => meus.has(usuarioDoJid(m)));
  const respondeuAoAgente = !!ctx?.participant && meus.has(usuarioDoJid(ctx.participant));
  return { contato: jid, grupo: true, responder: marcado || respondeuAoAgente };
}
