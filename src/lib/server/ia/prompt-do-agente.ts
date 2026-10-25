// ---------------------------------------------------------------------------
// Prompt do bloco "Responder com IA".
//
// Cada bloco de IA tem o próprio texto (papel, tom, regras, o que nunca
// fazer): um fluxo pode ter várias IAs, cada uma com um jeito. O cadastro do
// agente é só explicativo e não entra no prompt. Aqui fica o que muda a cada
// mensagem (hora, canal, quem é), que vai no fim do prompt.
// ---------------------------------------------------------------------------

const limpo = (s: string | null | undefined) => (s ?? "").trim();

const CANAIS: Record<string, string> = {
  whatsapp_qr: "WhatsApp",
  whatsapp_meta: "WhatsApp",
  website: "chat do site",
  instagram: "Instagram (mensagem direta)",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
};

const FORMATO_WHATSAPP = [
  "## Formato",
  "- É uma conversa de WhatsApp: mensagens curtas, parágrafos de 1 a 3 frases.",
  "- Sem títulos, tabelas nem markdown. Lista só quando ajudar, com poucos itens.",
  "- Uma pergunta por vez.",
].join("\n");

const FORMATO_TEXTO = "## Formato\n- O texto aparece exatamente como você escreve: nada de markdown (títulos, **negrito**, tabelas).";

/**
 * O que muda a cada mensagem (hora, canal, quem é). Vai no fim do prompt para
 * não quebrar o cache do começo, que é fixo.
 */
export function contextoDaConversa(c: { canal: string; nome?: string | null; grupo?: boolean; autor?: string; agora?: Date }): string {
  const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(c.agora ?? new Date());
  const canal = CANAIS[c.canal] ?? "teste no editor";
  const linhas = ["## Contexto desta conversa", `- Agora: ${quando} (horário de Brasília).`, `- Canal: ${c.grupo ? `grupo de ${canal}` : canal}.`];
  // Nome que é só número (telefone salvo como nome) não ajuda a IA.
  const nome = limpo(c.nome);
  if (nome && /\p{L}/u.test(nome)) linhas.push(`- Nome do contato: ${nome}.`);
  const autor = limpo(c.autor);
  if (c.grupo && autor) {
    linhas.push(
      `- Quem chamou você agora: ${autor}. Responda a essa pessoa, sobre o que ela pediu na última mensagem; as outras mensagens do grupo são só contexto.`
    );
  }
  const whatsapp = c.canal === "whatsapp_qr" || c.canal === "whatsapp_meta";
  return `${linhas.join("\n")}\n\n${whatsapp ? FORMATO_WHATSAPP : FORMATO_TEXTO}`;
}
