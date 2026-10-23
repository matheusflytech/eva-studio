import { acaoDoTipo, NOMES_DOS_OBJETOS } from "./catalogo";
import type { Definicao } from "./tipos";

// O que o "Testar de verdade" vai fazer neste fluxo, lido antes de rodar: só
// pede o WhatsApp (ou o e-mail) do teste quando algum passo fala com o cliente
// por ali, e mostra numa linha o que vai acontecer de verdade.

/** Ações que mandam WhatsApp (direto ou pela régua, que manda mensagens). */
const MANDAM_WHATSAPP = new Set(["whatsapp.send", "sequence.enroll"]);

export interface PlanoDoTeste {
  precisaWhatsApp: boolean;
  precisaEmail: boolean;
  /** "criar um negócio de teste", depois o nome de cada ação, na ordem em que aparecem. */
  oQueFaz: string[];
}

export function planoDoTeste(def: Definicao): PlanoDoTeste {
  const nome = NOMES_DOS_OBJETOS[def.objeto];
  const acoes = Object.values(def.nos).filter((n) => n.tipo === "acao");
  const nomes = [...new Set(acoes.map((n) => acaoDoTipo(n.acao)?.nome ?? n.acao))];
  return {
    precisaWhatsApp: acoes.some((n) => MANDAM_WHATSAPP.has(n.acao)),
    precisaEmail: acoes.some((n) => n.acao === "email.send"),
    oQueFaz: [`criar ${nome.artigo === "a" ? "uma" : "um"} ${nome.singular} de teste`, ...nomes],
  };
}
