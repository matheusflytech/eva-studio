import "server-only";

// Evento do webhook da Resend → situação do envio. Situação só avança (um
// "entregue" atrasado não apaga um "aberto"); bounce, reclamação e falha
// mandam sempre, porque são o que tira o endereço da lista.

const ORDEM: Record<string, number> = { enviando: 0, enviado: 1, atrasado: 2, entregue: 3, aberto: 4, clicado: 5 };
const TERMINAIS = new Set(["bounce", "reclamacao", "falhou"]);

const DO_EVENTO: Record<string, string> = {
  "email.sent": "enviado",
  "email.delivery_delayed": "atrasado",
  "email.delivered": "entregue",
  "email.opened": "aberto",
  "email.clicked": "clicado",
  "email.bounced": "bounce",
  "email.complained": "reclamacao",
  "email.failed": "falhou",
  "email.suppressed": "falhou",
};

export function situacaoDoEvento(tipo: string): string | null {
  return DO_EVENTO[tipo] ?? null;
}

/** A situação nova, ou null se não deve mudar. */
export function proximaSituacao(atual: string, nova: string): string | null {
  if (TERMINAIS.has(atual)) return null;
  if (TERMINAIS.has(nova)) return nova;
  return (ORDEM[nova] ?? -1) > (ORDEM[atual] ?? -1) ? nova : null;
}

/** Bounce que tira o endereço da lista: só o permanente (o temporário pode passar depois). */
export function bounceDefinitivo(dados: { bounce?: { type?: string } } | null | undefined): boolean {
  return (dados?.bounce?.type ?? "Permanent").toLowerCase() === "permanent";
}
