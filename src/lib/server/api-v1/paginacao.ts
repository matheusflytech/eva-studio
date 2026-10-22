import "server-only";
import { createHash } from "node:crypto";
import { ErroApi } from "./http";

// ---------------------------------------------------------------------------
// Paginação por cursor keyset e leitura da query string.
//
// O que a pesquisa no Beeno/Mautic ensinou: cursor por offset entra em ciclo
// quando a base muda durante a leitura, e `hasMore` que nunca vira false
// prende a sincronização para sempre. Aqui a ordem é (campo de data, id),
// sempre crescente, e a próxima página começa estritamente depois do último
// registro visto. O cursor carrega o hash dos filtros: reaproveitá-lo com
// outros filtros é erro explícito (`cursor_mismatch`), não página errada.
// ---------------------------------------------------------------------------

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 200;
const SEMPRE_PERMITIDOS = ["limit", "cursor", "include_total"];

/** Query string conferida: parâmetro desconhecido é erro, não filtro ignorado em silêncio. */
export function lerConsulta(url: string | URL, permitidos: readonly string[] = []): URLSearchParams {
  const sp = new URL(url).searchParams;
  const aceitos = new Set([...SEMPRE_PERMITIDOS, ...permitidos]);
  for (const chave of sp.keys()) {
    if (!aceitos.has(chave)) {
      throw new ErroApi(400, "unknown_parameter", `Parâmetro desconhecido: ${chave}.`, {
        param: chave,
        details: { allowed: [...aceitos] },
      });
    }
  }
  return sp;
}

export function lerLimite(sp: URLSearchParams): number {
  const bruto = sp.get("limit");
  if (bruto === null || bruto === "") return LIMITE_PADRAO;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > LIMITE_MAXIMO) {
    throw new ErroApi(400, "invalid_parameter", `limit precisa ser um inteiro entre 1 e ${LIMITE_MAXIMO}.`, { param: "limit" });
  }
  return n;
}

/** Data de filtro (`updated_since`, `since`): ISO-8601. undefined se não veio. */
export function lerDataDaConsulta(sp: URLSearchParams, nome: string): Date | undefined {
  const bruto = sp.get(nome);
  if (bruto === null || bruto === "") return undefined;
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) {
    throw new ErroApi(400, "invalid_parameter", `${nome} precisa ser uma data ISO-8601 (ex.: 2026-10-20T00:00:00Z).`, { param: nome });
  }
  return d;
}

export function lerBooleano(sp: URLSearchParams, nome: string): boolean | undefined {
  const bruto = sp.get(nome);
  if (bruto === null || bruto === "") return undefined;
  if (bruto === "true" || bruto === "1") return true;
  if (bruto === "false" || bruto === "0") return false;
  throw new ErroApi(400, "invalid_parameter", `${nome} precisa ser true ou false.`, { param: nome });
}

/** Hash dos filtros (tudo menos limit/cursor/include_total), em ordem estável. */
export function hashDosFiltros(sp: URLSearchParams): string {
  const pares = [...sp.entries()].filter(([k]) => !SEMPRE_PERMITIDOS.includes(k)).sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify(pares)).digest("hex").slice(0, 16);
}

export interface PosicaoDoCursor {
  valor: Date;
  id: string;
}

export function codificarCursor(pos: PosicaoDoCursor, hash: string): string {
  return Buffer.from(JSON.stringify({ v: pos.valor.toISOString(), i: pos.id, h: hash })).toString("base64url");
}

export function decodificarCursor(texto: string, hash: string): PosicaoDoCursor {
  let bruto: { v?: unknown; i?: unknown; h?: unknown };
  try {
    bruto = JSON.parse(Buffer.from(texto, "base64url").toString("utf8"));
  } catch {
    throw new ErroApi(400, "invalid_cursor", "Cursor inválido.", { param: "cursor" });
  }
  const valor = typeof bruto?.v === "string" ? new Date(bruto.v) : null;
  if (!valor || Number.isNaN(valor.getTime()) || typeof bruto.i !== "string" || typeof bruto.h !== "string") {
    throw new ErroApi(400, "invalid_cursor", "Cursor inválido.", { param: "cursor" });
  }
  if (bruto.h !== hash) {
    throw new ErroApi(400, "cursor_mismatch", "Este cursor foi gerado com outros filtros. Repita os mesmos filtros da primeira página.", {
      param: "cursor",
    });
  }
  return { valor, id: bruto.i };
}

/** Condição "depois da posição" na ordem (campo, id). */
export function whereDepoisDe(campo: string, pos: PosicaoDoCursor): Record<string, unknown> {
  return { OR: [{ [campo]: { gt: pos.valor } }, { [campo]: pos.valor, id: { gt: pos.id } }] };
}

export interface Pagina<T> {
  itens: T[];
  hasMore: boolean;
  nextCursor: string | null;
  total?: number;
}

/**
 * Busca uma página. `buscar` recebe a condição do cursor (para juntar com os
 * filtros da rota num AND), o `take` e a ordem; pede um a mais para saber se
 * existe próxima página sem precisar de COUNT.
 */
export async function paginar<T extends { id: string }>(opcoes: {
  sp: URLSearchParams;
  campo: string;
  buscar: (args: {
    cursor: Record<string, unknown> | undefined;
    take: number;
    orderBy: Array<Record<string, "asc">>;
  }) => Promise<T[]>;
  contar?: () => Promise<number>;
}): Promise<Pagina<T>> {
  const { sp, campo } = opcoes;
  const limite = lerLimite(sp);
  const hash = hashDosFiltros(sp);
  const textoCursor = sp.get("cursor");
  const pos = textoCursor ? decodificarCursor(textoCursor, hash) : undefined;

  const [linhas, total] = await Promise.all([
    opcoes.buscar({
      cursor: pos ? whereDepoisDe(campo, pos) : undefined,
      take: limite + 1,
      orderBy: [{ [campo]: "asc" }, { id: "asc" }],
    }),
    lerBooleano(sp, "include_total") && opcoes.contar ? opcoes.contar() : Promise.resolve(undefined),
  ]);

  const hasMore = linhas.length > limite;
  const itens = hasMore ? linhas.slice(0, limite) : linhas;
  const ultimo = itens[itens.length - 1] as (T & Record<string, unknown>) | undefined;
  const valor = ultimo?.[campo];
  const nextCursor =
    hasMore && ultimo && valor instanceof Date ? codificarCursor({ valor, id: ultimo.id }, hash) : null;
  return { itens, hasMore, nextCursor, ...(total !== undefined ? { total } : {}) };
}

/** Junta filtros num AND, ignorando os vazios. */
export function e<T>(...partes: Array<T | undefined | null | false>): { AND: T[] } {
  return { AND: partes.filter(Boolean) as T[] };
}
