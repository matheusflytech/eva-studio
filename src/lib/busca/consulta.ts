// ---------------------------------------------------------------------------
// Busca global (⌘K / Ctrl+K): o que a pessoa digitou → o que o servidor
// procura. Função pura, usada na paleta (decidir se busca) e no servidor
// (montar a consulta). Ver docs/superpowers/plans/2026-10-20-melhorias-crm-skills.md, item 4.
// ---------------------------------------------------------------------------

/**
 * Mínimo de dígitos para procurar por telefone em qualquer trecho do número.
 * 7, não 8: o exemplo combinado ("11 99999" acha +55 11 99999-8888) tem 7
 * dígitos. Abaixo disso o trecho bate em número demais para ser útil.
 */
export const MIN_DIGITOS_TELEFONE = 7;
/** Raiz do CNPJ (8 dígitos) já identifica a empresa; até 14 = CNPJ inteiro. */
export const MIN_DIGITOS_CNPJ = 8;
const MAX_DIGITOS_CNPJ = 14;
/** Menos que isso não vai ao servidor (1 letra bate em tudo). */
export const MIN_CARACTERES = 2;
/** Consulta colada gigante não vira dezenas de LIKEs. */
const MAX_TERMOS = 5;
const MAX_CARACTERES = 120;

export interface ConsultaNormalizada {
  /** Como veio (aparado e cortado em 120). */
  bruta: string;
  /** Sem acento, minúsculo, espaços colapsados. */
  texto: string;
  /** Palavras de `texto`: cada uma tem de bater no começo de alguma palavra (E). */
  termos: string[];
  /** Só os dígitos, se a consulta parece telefone e tem dígitos suficientes. */
  telefone: string | null;
  /** Só os dígitos, se a consulta parece CNPJ (8 a 14 dígitos, com ou sem pontuação). */
  cnpj: string | null;
  /** Em minúsculas, se a consulta tem "@". */
  email: string | null;
  /** Curta demais: a paleta mostra só ações, páginas e recentes. */
  vazia: boolean;
}

/** "João Ação" → "joao acao". Funciona com texto composto ou já decomposto. */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Mesma troca que `semAcento`, para o banco sem a extensão unaccent
 * (translate(lower(coluna), DE, PARA)). As duas cadeias têm o mesmo tamanho.
 */
export const ACENTOS_DE = "áàâãäåéèêëíìîïóòôõöúùûüçñý";
export const ACENTOS_PARA = "aaaaaaeeeeiiiiooooouuuucny";

/** % e _ são curinga no LIKE: o termo vai como parâmetro, mas ainda precisa de escape. */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const SO_TELEFONE = /^[\d\s()+.\-]+$/;
const SO_CNPJ = /^[\d\s./\-]+$/;

export function normalizarConsulta(entrada: string): ConsultaNormalizada {
  const bruta = (entrada ?? "").trim().slice(0, MAX_CARACTERES);
  const texto = semAcento(bruta).replace(/\s+/g, " ").trim();
  const digitos = bruta.replace(/\D/g, "");

  const email = bruta.includes("@") ? bruta.replace(/\s+/g, "").toLowerCase() : null;
  const termos = email ? [semAcento(email)] : texto.split(" ").filter(Boolean).slice(0, MAX_TERMOS);

  const telefone = SO_TELEFONE.test(bruta) && digitos.length >= MIN_DIGITOS_TELEFONE ? digitos : null;
  const cnpj =
    SO_CNPJ.test(bruta) && digitos.length >= MIN_DIGITOS_CNPJ && digitos.length <= MAX_DIGITOS_CNPJ ? digitos : null;

  return {
    bruta,
    texto,
    termos,
    telefone,
    cnpj,
    email,
    vazia: texto.length < MIN_CARACTERES,
  };
}
