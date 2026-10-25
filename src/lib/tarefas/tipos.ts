// ---------------------------------------------------------------------------
// Tipos de tarefa (skill crm-tasks-agenda): ligação, WhatsApp, e-mail,
// reunião, visita e "a fazer", cada um com rótulo, duração padrão e ação de
// um clique.
//
// Os ids antigos continuam valendo SEM migração: "ligar", "email" e
// "reuniao" já eram ligação, e-mail e reunião e seguem como ids; "outro"
// (antigo) é aceito na entrada e gravado como "afazer". Tarefa antiga com
// "outro" no banco aparece como "A fazer". Flow-engine, bloco do Builder, IA
// de réguas e API v1 passam todos por normalizarTipoDeTarefa.
// ---------------------------------------------------------------------------

export const TIPOS_DE_TAREFA = ["ligar", "whatsapp", "email", "reuniao", "visita", "afazer"] as const;
export type TipoDeTarefa = (typeof TIPOS_DE_TAREFA)[number];

/** O que a entrada aceita (os seis + o antigo "outro"). */
export const TIPOS_ACEITOS = [...TIPOS_DE_TAREFA, "outro"] as const;

export interface InfoDoTipo {
  rotulo: string;
  /** "Fila: 8 WhatsApps". */
  plural: string;
  /** Duração padrão em minutos (capacidade do dia). */
  duracaoMin: number;
}

export const INFO_DO_TIPO: Record<TipoDeTarefa, InfoDoTipo> = {
  ligar: { rotulo: "Ligação", plural: "ligações", duracaoMin: 10 },
  whatsapp: { rotulo: "WhatsApp", plural: "WhatsApps", duracaoMin: 3 },
  email: { rotulo: "E-mail", plural: "e-mails", duracaoMin: 5 },
  reuniao: { rotulo: "Reunião", plural: "reuniões", duracaoMin: 30 },
  visita: { rotulo: "Visita", plural: "visitas", duracaoMin: 60 },
  afazer: { rotulo: "A fazer", plural: "a fazer", duracaoMin: 15 },
};

// Apelidos: sem acento, minúsculo. Cobre o que vem do Builder antigo, da IA e
// de integrações que mandam o nome em inglês.
const APELIDOS: Record<string, TipoDeTarefa> = {
  ligar: "ligar",
  ligacao: "ligar",
  telefonar: "ligar",
  telefone: "ligar",
  call: "ligar",
  whatsapp: "whatsapp",
  wpp: "whatsapp",
  zap: "whatsapp",
  wa: "whatsapp",
  email: "email",
  "e-mail": "email",
  reuniao: "reuniao",
  meeting: "reuniao",
  visita: "visita",
  visitar: "visita",
  visit: "visita",
  afazer: "afazer",
  "a fazer": "afazer",
  todo: "afazer",
  tarefa: "afazer",
  outro: "afazer",
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Tipo válido (com apelidos e o antigo "outro") → id novo; null = inválido. */
export function normalizarTipoDeTarefa(valor: unknown): TipoDeTarefa | null {
  if (typeof valor !== "string") return null;
  return APELIDOS[semAcento(valor.trim().toLowerCase())] ?? null;
}

/** Para exibir: qualquer coisa desconhecida vira "A fazer". */
export function tipoParaExibir(valor: string | null | undefined): TipoDeTarefa {
  return normalizarTipoDeTarefa(valor ?? "") ?? "afazer";
}

export function rotuloDoTipo(valor: string | null | undefined): string {
  return INFO_DO_TIPO[tipoParaExibir(valor)].rotulo;
}

export function duracaoPadrao(valor: string | null | undefined): number {
  return INFO_DO_TIPO[tipoParaExibir(valor)].duracaoMin;
}

/** "1 WhatsApp", "8 WhatsApps", "3 ligações". */
export function contagemDoTipo(valor: string, n: number): string {
  const info = INFO_DO_TIPO[tipoParaExibir(valor)];
  return `${n} ${n === 1 ? info.rotulo.toLowerCase().replace("whatsapp", "WhatsApp") : info.plural}`;
}

export interface AcaoDeUmClique {
  href: string;
  rotulo: string;
  /** Abre fora do app (tel:, mailto:, wa.me). */
  externo: boolean;
}

/** Telefone gravado como "5521..." → "+5521..." para o tel:. */
function telefoneParaLink(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 8) return null;
  return digitos.length >= 12 && digitos.startsWith("55") ? `+${digitos}` : digitos;
}

/**
 * Ação de um clique do tipo: ligar (tel:), WhatsApp (abre a conversa do
 * contato no inbox; sem conversa, wa.me), e-mail (mailto:). Reunião, visita e
 * "a fazer" não têm ação direta.
 */
export function acaoDeUmClique(
  tipo: string,
  contato: { telefone?: string | null; email?: string | null; conversaId?: string | null } | null
): AcaoDeUmClique | null {
  if (!contato) return null;
  const t = tipoParaExibir(tipo);
  if (t === "ligar" && contato.telefone) {
    const n = telefoneParaLink(contato.telefone);
    return n ? { href: `tel:${n}`, rotulo: "Ligar", externo: true } : null;
  }
  if (t === "whatsapp") {
    if (contato.conversaId) return { href: `/conversations?c=${encodeURIComponent(contato.conversaId)}`, rotulo: "Abrir conversa", externo: false };
    const n = contato.telefone ? telefoneParaLink(contato.telefone) : null;
    return n ? { href: `https://wa.me/${n.replace("+", "")}`, rotulo: "Abrir WhatsApp", externo: true } : null;
  }
  if (t === "email" && contato.email) return { href: `mailto:${contato.email}`, rotulo: "Escrever e-mail", externo: true };
  return null;
}

// ---- campos novos ----

export const PRIORIDADES = ["normal", "alta"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const ORIGENS = ["manual", "automacao", "ia"] as const;
export type OrigemDaTarefa = (typeof ORIGENS)[number];

export const ROTULO_DA_ORIGEM: Record<OrigemDaTarefa, string> = {
  manual: "Manual",
  automacao: "Automação",
  ia: "IA",
};

export const RESULTADOS = ["falou", "nao_atendeu", "remarcou", "outro"] as const;
export type ResultadoDaTarefa = (typeof RESULTADOS)[number];

export const ROTULO_DO_RESULTADO: Record<ResultadoDaTarefa, string> = {
  falou: "Falou",
  nao_atendeu: "Não atendeu",
  remarcou: "Remarcou",
  outro: "Outro",
};

/** O que a pessoa escolheu no "Agendar próxima atividade?". */
export const DECISOES = ["agendou", "sem_proximo"] as const;
export type DecisaoDoProximoPasso = (typeof DECISOES)[number];
