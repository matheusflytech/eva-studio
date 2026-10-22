import type { Condicao, Operador, Regra } from "./tipos";

// ---------------------------------------------------------------------------
// Avaliação das condições (sem eval). O contexto é um objeto simples:
// { registro, contato, empresa, gatilho, passos, sistema }, com o registro no
// formato da API v1. Lista de objetos (etiquetas { id, name }) casa pelo id ou
// pelo nome, sem diferenciar maiúsculas.
//
// Datas: só ISO (2026-10-21 ou 2026-10-21T15:00:00Z), Date ou milissegundos.
// Texto solto nunca vira data ("Proposta 2" não é 1/fev/2001, como o
// Date.parse do V8 acharia). Data sem hora vale o dia inteiro em São Paulo.
// ---------------------------------------------------------------------------

export type Contexto = Record<string, unknown>;

/** Valor num caminho "a.b.c"; undefined quando não existe. Só propriedades próprias. */
export function lerCaminho(contexto: Contexto, caminho: string): unknown {
  let atual: unknown = contexto;
  for (const parte of caminho.split(".")) {
    if (atual === null || atual === undefined) return undefined;
    if (Array.isArray(atual)) {
      if (!/^\d+$/.test(parte)) return undefined;
      atual = atual[Number(parte)];
      continue;
    }
    if (typeof atual !== "object" || !Object.hasOwn(atual, parte)) return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

const normal = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

/** Itens de uma lista como texto comparável (objeto vira id e nome). */
function itens(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return [o.id, o.name, o.nome].filter((y) => y !== undefined && y !== null).map(normal);
    }
    return [normal(x)];
  });
}

const vazio = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/**
 * Número estrito: "1500", "-2", "1500.5", "1500,5" e o formato brasileiro com
 * milhar "1.500" / "1.500,50". Hexadecimal, "1e3" e texto não são número.
 */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(",", "."));
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

const SO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_COM_HORA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
// Brasil sem horário de verão desde 2019: São Paulo é sempre UTC-3.
const SP = "-03:00";

/**
 * Data em ms. `limite` diz como ler um dia sem hora: início ou fim do dia em
 * São Paulo (é o que faz "entre 01/10 e 21/10" incluir o dia 21 inteiro).
 */
export function data(v: unknown, limite: "inicio" | "fim" = "inicio"): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (SO_DIA.test(s)) {
    const t = Date.parse(`${s}T${limite === "inicio" ? "00:00:00.000" : "23:59:59.999"}${SP}`);
    return Number.isNaN(t) ? null : t;
  }
  if (ISO_COM_HORA.test(s)) {
    // Sem fuso escrito, a hora é de São Paulo.
    const comFuso = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.replace(" ", "T")}${SP}`;
    const t = Date.parse(comFuso);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Ordem numérica quando os dois lados são número; senão por data. null = não comparável. */
function ordem(a: unknown, b: unknown, limiteDeB: "inicio" | "fim" = "inicio"): number | null {
  const na = numero(a);
  const nb = numero(b);
  if (na !== null && nb !== null) return na - nb;
  const da = data(a);
  const db = data(b, limiteDeB);
  if (da !== null && db !== null) return da - db;
  return null;
}

/** Igualdade: número com número, senão texto normalizado (data não entra). */
function igual(a: unknown, b: unknown): boolean {
  const na = numero(a);
  const nb = numero(b);
  if (na !== null && nb !== null) return na === nb;
  return normal(a) === normal(b);
}

export function avaliarCondicao(c: Condicao, contexto: Contexto, agora = new Date()): boolean {
  const v = lerCaminho(contexto, c.campo);
  const alvo = c.valor;
  const lista = Array.isArray(v);
  const op: Operador = c.operador;
  switch (op) {
    case "vazio":
      return vazio(v);
    case "preenchido":
      return !vazio(v);
    case "verdadeiro":
      return v === true || v === "true";
    case "falso":
      return v === false || v === "false" || v === undefined || v === null;
    case "igual":
      return lista ? itens(v).includes(normal(alvo)) : igual(v, alvo);
    case "diferente":
      return lista ? !itens(v).includes(normal(alvo)) : !igual(v, alvo);
    case "contem":
      if (lista) return itens(v).includes(normal(alvo));
      return normal(alvo) !== "" && normal(v).includes(normal(alvo));
    case "nao_contem":
      if (lista) return !itens(v).includes(normal(alvo));
      return !normal(v).includes(normal(alvo)) || normal(alvo) === "";
    case "comeca_com":
      return normal(alvo) !== "" && normal(v).startsWith(normal(alvo));
    case "maior":
    case "maior_igual":
    case "menor":
    case "menor_igual": {
      const d = ordem(v, alvo);
      if (d === null) return false;
      if (op === "maior") return d > 0;
      if (op === "maior_igual") return d >= 0;
      if (op === "menor") return d < 0;
      return d <= 0;
    }
    case "antes": {
      // Antes do dia X = antes do começo do dia X.
      const a = data(v);
      const b = data(alvo, "inicio");
      return a !== null && b !== null && a < b;
    }
    case "depois": {
      // Depois do dia X = depois do fim do dia X.
      const a = data(v);
      const b = data(alvo, "fim");
      return a !== null && b !== null && a > b;
    }
    case "entre": {
      if (!Array.isArray(alvo) || alvo.length !== 2) return false;
      const de = ordem(v, alvo[0], "inicio");
      const ate = ordem(v, alvo[1], "fim");
      return de !== null && ate !== null && de >= 0 && ate <= 0;
    }
    case "em":
    case "nao_em": {
      const opcoes = (Array.isArray(alvo) ? alvo : String(alvo ?? "").split(",")).map(normal).filter(Boolean);
      const tem = lista ? itens(v).some((x) => opcoes.includes(x)) : opcoes.includes(normal(v));
      return op === "em" ? tem : !tem;
    }
    case "ultimos_dias": {
      const t = data(v);
      const n = numero(alvo);
      if (t === null || n === null) return false;
      return t <= agora.getTime() && t >= agora.getTime() - n * 86_400_000;
    }
  }
}

/** Grupos que têm alguma condição (grupo vazio não conta, nem para o OU). */
export function gruposDaRegra(regra: Regra | null | undefined): { condicoes: Condicao[] }[] {
  if (!regra || !Array.isArray(regra.grupos)) return [];
  return regra.grupos.filter((g) => g && Array.isArray(g.condicoes) && g.condicoes.length > 0);
}

/** OU de grupos E. Sem nenhuma condição, é verdadeira. */
export function avaliarRegra(regra: Regra | null | undefined, contexto: Contexto, agora = new Date()): boolean {
  const grupos = gruposDaRegra(regra);
  if (grupos.length === 0) return true;
  return grupos.some((g) => g.condicoes.every((c) => avaliarCondicao(c, contexto, agora)));
}

/** Operadores que fazem sentido para cada tipo de valor (a tela filtra por aqui). */
export const OPERADORES_POR_TIPO: Record<string, Operador[]> = {
  texto: ["igual", "diferente", "contem", "nao_contem", "comeca_com", "em", "nao_em", "vazio", "preenchido"],
  numero: ["igual", "diferente", "maior", "maior_igual", "menor", "menor_igual", "entre", "vazio", "preenchido"],
  data: ["antes", "depois", "entre", "ultimos_dias", "vazio", "preenchido"],
  booleano: ["verdadeiro", "falso"],
  lista: ["contem", "nao_contem", "em", "nao_em", "vazio", "preenchido"],
  tag: ["contem", "nao_contem", "vazio", "preenchido"],
  etapa: ["igual", "diferente", "em", "nao_em"],
  funil: ["igual", "diferente", "em", "nao_em"],
  usuario: ["igual", "diferente", "em", "nao_em", "vazio", "preenchido"],
};

export const NOME_DO_OPERADOR: Record<Operador, string> = {
  igual: "é",
  diferente: "não é",
  contem: "contém",
  nao_contem: "não contém",
  comeca_com: "começa com",
  vazio: "está vazio",
  preenchido: "está preenchido",
  maior: "é maior que",
  maior_igual: "é pelo menos",
  menor: "é menor que",
  menor_igual: "é no máximo",
  entre: "está entre",
  em: "é um de",
  nao_em: "não é nenhum de",
  antes: "é antes de",
  depois: "é depois de",
  ultimos_dias: "foi nos últimos (dias)",
  verdadeiro: "sim",
  falso: "não",
};

/** Operadores que não pedem valor. */
export const SEM_VALOR: ReadonlySet<Operador> = new Set(["vazio", "preenchido", "verdadeiro", "falso"]);
