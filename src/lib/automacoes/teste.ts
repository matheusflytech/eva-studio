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

export interface PassoComMotivo {
  noId: string;
  status: string;
  erro?: string | null;
  saida?: unknown;
}

/**
 * Por que o passo não seguiu como esperado, numa frase para a tela: o erro de
 * quem falhou, ou o motivo de quem foi pulado ou ficou esperando (contato que
 * não aceita mensagens, fora do horário comercial...). null quando deu certo.
 */
export function motivoDoPasso(p: PassoComMotivo): string | null {
  if (p.status === "falhou") return p.erro?.trim() || "Falhou sem dizer o motivo.";
  if (p.status !== "pulado" && p.status !== "esperando") return null;
  const s = (p.saida ?? {}) as { motivo?: unknown; ate?: unknown };
  const motivo = typeof s.motivo === "string" && s.motivo.trim() ? s.motivo.trim() : null;
  if (!motivo) return p.status === "pulado" ? "Pulado." : null;
  const ate = typeof s.ate === "string" ? new Date(s.ate) : null;
  const quando =
    ate && !Number.isNaN(ate.getTime())
      ? ` (continua ${ate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`
      : "";
  const frase = motivo.charAt(0).toUpperCase() + motivo.slice(1);
  return p.status === "pulado" ? `Pulado: ${motivo}.` : `${frase}${quando}.`;
}

/** Os passos que precisam de explicação, na ordem, com o motivo. */
export function passosComProblema<T extends PassoComMotivo>(passos: T[]): { passo: T; motivo: string }[] {
  return passos.flatMap((passo) => {
    const motivo = motivoDoPasso(passo);
    return motivo ? [{ passo, motivo }] : [];
  });
}
