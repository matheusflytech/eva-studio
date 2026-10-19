import "server-only";
import type { Corpo } from "@/lib/server/api-validacao";
import { ErroApi, paraErroApi } from "./http";

// Lote síncrono (até 100 itens): resultado por item, nunca tudo-ou-nada. Um
// item ruim não derruba os outros 99 — e quem integra sabe exatamente qual
// reenviar pelo `index`.

export const MAX_LOTE = 100;

export type ResultadoDoItem =
  | { index: number; status: "created" | "updated" | "unchanged"; id: string; matched_by?: string | null }
  | { index: number; status: "error"; error: { code: string; message: string; param?: string; details?: unknown } };

export function lerItensDoLote(corpo: Corpo): Corpo[] {
  const itens = corpo.items;
  if (!Array.isArray(itens) || itens.length === 0 || itens.length > MAX_LOTE) {
    throw new ErroApi(400, "invalid_parameter", `items precisa ser uma lista com 1 a ${MAX_LOTE} objetos.`, { param: "items" });
  }
  return itens.map((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ErroApi(400, "invalid_parameter", `items[${i}] precisa ser um objeto.`, { param: `items[${i}]` });
    }
    return item as Corpo;
  });
}

export async function processarLote(
  itens: Corpo[],
  fazer: (item: Corpo) => Promise<{ id: string; result: "created" | "updated" | "unchanged"; matchedBy?: string | null }>
): Promise<ResultadoDoItem[]> {
  const saida: ResultadoDoItem[] = [];
  // Em sequência de propósito: dois itens do mesmo lote com o mesmo e-mail
  // precisam ver um ao outro (o segundo atualiza o que o primeiro criou).
  for (let index = 0; index < itens.length; index += 1) {
    try {
      const r = await fazer(itens[index]);
      saida.push({ index, status: r.result, id: r.id, ...(r.matchedBy !== undefined ? { matched_by: r.matchedBy } : {}) });
    } catch (e) {
      const erro = paraErroApi(e);
      saida.push({
        index,
        status: "error",
        error: {
          code: erro.code,
          message: erro.message,
          ...(erro.extra.param ? { param: erro.extra.param } : {}),
          ...(erro.extra.details !== undefined ? { details: erro.extra.details } : {}),
        },
      });
    }
  }
  return saida;
}

export function resumoDoLote(r: ResultadoDoItem[]) {
  const conta = (s: string) => r.filter((x) => x.status === s).length;
  return { created: conta("created"), updated: conta("updated"), unchanged: conta("unchanged"), failed: conta("error") };
}
