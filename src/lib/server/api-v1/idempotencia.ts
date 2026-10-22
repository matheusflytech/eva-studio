import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ErroApi } from "./http";

// ---------------------------------------------------------------------------
// Idempotency-Key (mesmo contrato do Stripe).
//
// Quem integra reenvia quando a rede cai no meio: sem isto, o "retry" cria o
// mesmo contato/negócio duas vezes. A primeira requisição grava a linha em
// andamento (status 0); ao terminar, guarda status e corpo. A repetição com o
// MESMO corpo devolve a resposta guardada; com corpo diferente é erro do
// cliente (a chave foi reaproveitada para outra coisa). Resposta 5xx não é
// guardada: falha nossa merece nova tentativa de verdade.
// ---------------------------------------------------------------------------

export const VALIDADE_MS = 24 * 60 * 60 * 1000;
const MAX_CHAVE = 255;

export interface PedidoIdempotente {
  orgId: string;
  chave: string;
  metodo: string;
  caminho: string;
  corpo: string;
}

export function validarChave(chave: string | null): string | null {
  if (chave === null) return null;
  const t = chave.trim();
  if (!t || t.length > MAX_CHAVE) {
    throw new ErroApi(400, "invalid_idempotency_key", `Idempotency-Key precisa ter entre 1 e ${MAX_CHAVE} caracteres.`, {
      param: "Idempotency-Key",
    });
  }
  return t;
}

function hashDoPedido(p: PedidoIdempotente): string {
  return createHash("sha256").update(`${p.metodo}\n${p.caminho}\n${p.corpo}`).digest("hex");
}

type Guardada = { status: number; body: unknown };

export async function comIdempotencia(p: PedidoIdempotente, executar: () => Promise<Response>): Promise<Response> {
  const bodyHash = hashDoPedido(p);
  const where = { orgId_key: { orgId: p.orgId, key: p.chave } };

  let existente = await prisma.idempotencyKey.findUnique({ where });
  if (existente && Date.now() - existente.createdAt.getTime() > VALIDADE_MS) {
    await prisma.idempotencyKey.deleteMany({ where: { id: existente.id } });
    existente = null;
  }
  if (existente) return repetir(existente, bodyHash);

  try {
    await prisma.idempotencyKey.create({
      data: { orgId: p.orgId, key: p.chave, method: p.metodo, path: p.caminho, bodyHash, status: 0 },
    });
  } catch (e) {
    // Duas requisições com a mesma chave ao mesmo tempo: a segunda perde a
    // corrida e vê a linha da primeira.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const outra = await prisma.idempotencyKey.findUnique({ where });
      if (outra) return repetir(outra, bodyHash);
    }
    throw e;
  }

  let resposta: Response;
  try {
    resposta = await executar();
  } catch (e) {
    await prisma.idempotencyKey.deleteMany({ where: { orgId: p.orgId, key: p.chave } }).catch(() => {});
    throw e;
  }

  if (resposta.status >= 500) {
    await prisma.idempotencyKey.deleteMany({ where: { orgId: p.orgId, key: p.chave } }).catch(() => {});
    return resposta;
  }
  const body = await resposta
    .clone()
    .json()
    .catch(() => null);
  await prisma.idempotencyKey
    .update({ where, data: { status: resposta.status, response: { status: resposta.status, body } as Prisma.InputJsonValue } })
    .catch((e) => console.error("[api-v1] falha ao guardar resposta idempotente", e));
  return resposta;
}

function repetir(linha: { status: number; bodyHash: string; response: unknown }, bodyHash: string): Response {
  if (linha.bodyHash !== bodyHash) {
    throw new ErroApi(422, "idempotency_key_reused", "Esta Idempotency-Key já foi usada com outro corpo ou em outro endpoint.", {
      type: "idempotency_error",
      param: "Idempotency-Key",
    });
  }
  if (linha.status === 0) {
    throw new ErroApi(409, "idempotency_in_progress", "Uma requisição com esta Idempotency-Key ainda está em andamento.", {
      type: "idempotency_error",
      headers: { "Retry-After": "1" },
    });
  }
  const g = (linha.response ?? { status: linha.status, body: null }) as Guardada;
  return NextResponse.json(g.body, { status: g.status, headers: { "Idempotent-Replayed": "true" } });
}

/** Limpeza das chaves vencidas, chamada pelo relógio. */
export async function limparChavesVencidas(): Promise<number> {
  const r = await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - VALIDADE_MS) } } });
  return r.count;
}
