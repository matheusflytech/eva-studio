import type { Condicao, Operador, Regra } from "./tipos";

// ---------------------------------------------------------------------------
// Avaliação das condições (sem eval). O contexto é um objeto simples:
// { registro, contato, empresa, gatilho, passos, sistema }, com o registro no
// formato da API v1. Lista de objetos (etiquetas { id, name }) casa pelo id ou
// pelo nome, sem diferenciar maiúsculas.
// ---------------------------------------------------------------------------

export type Contexto = Record<string, unknown>;

/** Valor num caminho "a.b.c"; undefined quando não existe. */
export function lerCaminho(contexto: Contexto, caminho: string): unknown {
  let atual: unknown = contexto;
  for (const parte of caminho.split(".")) {
    if (atual === null || atual === undefined) return undefined;
    if (Array.isArray(atual) && /^\d+$/.test(parte)) {
      atual = atual[Number(parte)];
      continue;
    }
    if (typeof atual !== "object") return undefined;
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

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function data(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Compara número quando os dois lados são números; senão data; senão texto. */
function comparar(a: unknown, b: unknown): number | null {
  const na = numero(a);
  const nb = numero(b);
  if (na !== null && nb !== null) return na - nb;
  const da = data(a);
  const db = data(b);
  if (da !== null && db !== null) return da - db;
  return null;
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
      if (lista) return itens(v).includes(normal(alvo));
      return comparar(v, alvo) === 0 || normal(v) === normal(alvo);
    case "diferente":
      if (lista) return !itens(v).includes(normal(alvo));
      return !(comparar(v, alvo) === 0 || normal(v) === normal(alvo));
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
    case "menor_igual":
    case "antes":
    case "depois": {
      const d = comparar(v, alvo);
      if (d === null) return false;
      if (op === "maior" || op === "depois") return d > 0;
      if (op === "maior_igual") return d >= 0;
      if (op === "menor" || op === "antes") return d < 0;
      return d <= 0;
    }
    case "entre": {
      if (!Array.isArray(alvo) || alvo.length !== 2) return false;
      const a = comparar(v, alvo[0]);
      const b = comparar(v, alvo[1]);
      return a !== null && b !== null && a >= 0 && b <= 0;
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

/** OU de grupos E. Regra sem grupos (ou grupo vazio) é verdadeira. */
export function avaliarRegra(regra: Regra | null | undefined, contexto: Contexto, agora = new Date()): boolean {
  if (!regra || regra.grupos.length === 0) return true;
  return regra.grupos.some((g) => g.condicoes.every((c) => avaliarCondicao(c, contexto, agora)));
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
