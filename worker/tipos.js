// O que o cliente mandou pelo QR, em texto que o motor entende.
//
// Mensagem temporária e de visualização única chegam embrulhadas
// (ephemeralMessage.message, viewOnceMessage.message...): sem desembrulhar,
// o worker não achava texto nem arquivo e a mensagem sumia. Localização,
// contato e reação viram texto legível, no mesmo formato do webhook da Meta.
//
// Separado do index.js para ser testável sem subir o Baileys.

const EMBRULHOS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
];

/** Tira as camadas de mensagem temporária / visualização única. */
export function desembrulhar(mensagem) {
  let m = mensagem;
  for (let i = 0; i < 5 && m; i += 1) {
    const chave = EMBRULHOS.find((k) => m[k]?.message);
    if (!chave) break;
    m = m[chave].message;
  }
  return m;
}

/** Texto principal da mensagem (já desembrulhada), ou null. */
export function textoDaMensagem(m) {
  if (!m) return null;
  const texto = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption;
  if (texto) return texto;

  const local = m.locationMessage ?? m.liveLocationMessage;
  if (local) {
    const onde = [local.name, local.address].filter(Boolean).join(", ");
    return `[Localização]${onde ? ` ${onde}` : ""} https://maps.google.com/?q=${local.degreesLatitude},${local.degreesLongitude}`;
  }

  const contatos = m.contactMessage ? [m.contactMessage] : (m.contactsArrayMessage?.contacts ?? []);
  if (contatos.length) {
    const lista = contatos
      .map((c) => [c.displayName, telefoneDoVcard(c.vcard)].filter(Boolean).join(" "))
      .filter(Boolean)
      .join("; ");
    return `[Contato compartilhado] ${lista}`;
  }

  // Reação vazia = a pessoa tirou a reação: não é fala.
  if (m.reactionMessage?.text) return `[Reação: ${m.reactionMessage.text}]`;
  return null;
}

function telefoneDoVcard(vcard) {
  const v = String(vcard ?? "");
  return /waid=(\d+)/.exec(v)?.[1] ?? /TEL[^:]*:([+\d\s()-]+)/.exec(v)?.[1]?.trim() ?? "";
}

/** Trecho da mensagem citada (reply), ou null. */
export function trechoCitado(m) {
  for (const valor of Object.values(m ?? {})) {
    const citada = valor && typeof valor === "object" ? valor.contextInfo?.quotedMessage : null;
    if (citada) {
      const t = textoDaMensagem(desembrulhar(citada)) ?? (citada.imageMessage ? "[Foto]" : citada.audioMessage ? "[Áudio]" : null);
      return t ? t.slice(0, 120) : null;
    }
  }
  return null;
}

/** Mesmo formato do webhook da Meta (src/app/api/webhooks/meta/route.ts). */
export const comCitacao = (trecho, texto) => (trecho ? `Respondendo a: «${trecho}»\n${texto ?? ""}` : texto);
