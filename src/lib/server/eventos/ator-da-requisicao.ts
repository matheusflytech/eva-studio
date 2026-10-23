import "server-only";
import { headers } from "next/headers";
import type { Ator } from "./barramento";

// Quem está logado nesta requisição, para o histórico dizer "Ana Souza" em vez
// de "sistema" no que foi feito pela tela. `requirePermission` marca; o
// barramento lê quando não há `comAtor` em volta.
//
// Chave: o objeto de `headers()`, que o Next devolve o mesmo durante toda a
// requisição (cache por requisição) e solta no fim (WeakMap). Não dá para usar
// AsyncLocalStorage.enterWith: dentro do `run` que o Next abre por requisição,
// o que é marcado numa função chamada com `await` não volta para quem chamou.

const pessoas = new WeakMap<object, Ator>();

export async function marcarPessoaDaRequisicao(userId: string): Promise<void> {
  try {
    pessoas.set(await headers(), { tipo: "usuario", id: userId });
  } catch {
    // fora de requisição (worker, teste): nada a marcar
  }
}

export async function atorDaRequisicao(): Promise<Ator | null> {
  try {
    return pessoas.get(await headers()) ?? null;
  } catch {
    return null;
  }
}
