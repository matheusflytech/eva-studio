// ---------------------------------------------------------------------------
// Janela de 24h do WhatsApp oficial, para envio com hora marcada.
//
// A regra da Meta: texto livre só até 24h depois da última mensagem do
// cliente; fora disso, só modelo aprovado. Numa mensagem agendada a pergunta
// é "a janela vai estar aberta NA HORA DO ENVIO?", e ela é feita duas vezes:
// ao agendar (pra recusar logo o que não vai sair) e na hora de mandar (o
// cliente pode ter escrito de novo — ou não).
// ---------------------------------------------------------------------------

export const JANELA_MS = 24 * 60 * 60 * 1000;

/** Canais em que dá para agendar mensagem avulsa. */
export const CANAIS_AGENDAVEIS = new Set(["whatsapp_meta", "whatsapp_qr", "telegram"]);

export function janelaAbertaEm(lastContactMessageAt: Date | null, quando: Date): boolean {
  if (!lastContactMessageAt) return false;
  return quando.getTime() - lastContactMessageAt.getTime() < JANELA_MS;
}

export type DecisaoDeEnvio = { ok: true; usarModelo: boolean } | { ok: false; erro: string };

export function decidirEnvio(input: {
  channel: string;
  lastContactMessageAt: Date | null;
  quando: Date;
  temTexto: boolean;
  temModelo: boolean;
}): DecisaoDeEnvio {
  const { channel, lastContactMessageAt, quando, temTexto, temModelo } = input;

  if (!CANAIS_AGENDAVEIS.has(channel)) {
    return { ok: false, erro: "Este canal não aceita mensagem agendada (fora da janela não existe envio permitido)." };
  }

  if (channel !== "whatsapp_meta") {
    return temTexto ? { ok: true, usarModelo: false } : { ok: false, erro: "Escreva a mensagem." };
  }

  // Só modelo: sai como modelo, com janela aberta ou não.
  if (!temTexto) {
    return temModelo ? { ok: true, usarModelo: true } : { ok: false, erro: "Escreva a mensagem ou escolha um modelo." };
  }

  if (janelaAbertaEm(lastContactMessageAt, quando)) return { ok: true, usarModelo: false };
  if (temModelo) return { ok: true, usarModelo: true };

  return {
    ok: false,
    erro: lastContactMessageAt
      ? "Nessa hora a janela de 24h desta conversa já terá fechado. Escolha um modelo aprovado pela Meta."
      : "Este contato ainda não escreveu, então a janela de 24h está fechada. Escolha um modelo aprovado pela Meta.",
  };
}
