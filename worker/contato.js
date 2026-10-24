// Quem é o contato de uma mensagem recebida pelo QR.
//
// Só conversa 1:1 vira contato: grupo (@g.us), status e lista de transmissão
// (@broadcast), canal (@newsletter) e bots ficam de fora. Antes o worker
// mandava tudo ao app, um grupo virou "contato" com o id do grupo no lugar do
// telefone, e o agente respondeu dentro do grupo.
//
// "@lid" é o id de privacidade do WhatsApp (não é telefone). Quando a
// mensagem traz o número junto (key.senderPn), o contato é o número, para a
// ficha ter o celular da pessoa.
//
// Separado do index.js para ser testável sem subir o Baileys.

/** @param {{ remoteJid?: string | null, senderPn?: string | null } | undefined} key */
export function contatoDaMensagem(key) {
  const jid = key?.remoteJid ?? "";
  const servidor = jid.split("@")[1];
  if (servidor === "s.whatsapp.net") return jid;
  if (servidor !== "lid") return null;
  return key?.senderPn?.endsWith("@s.whatsapp.net") ? key.senderPn : jid;
}
