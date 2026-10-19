import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ErroDeCrm } from "@/lib/server/crm";
import { ErroDeFunil } from "@/lib/server/funis-acoes";

// ---------------------------------------------------------------------------
// Resposta e erro padrão da API pública v1.
//
// Todo erro sai no mesmo envelope, com `code` estável em inglês (é o que o
// código de quem integra compara) e `message` em português (é o que a pessoa
// lê no log). `request_id` vai no corpo e no header X-Request-Id: é o que o
// cliente manda pro suporte quando algo dá errado.
// ---------------------------------------------------------------------------

export type TipoDeErro =
  | "authentication_error"
  | "permission_error"
  | "invalid_request_error"
  | "not_found_error"
  | "conflict_error"
  | "rate_limit_error"
  | "idempotency_error"
  | "api_error";

const TIPO_POR_STATUS: Record<number, TipoDeErro> = {
  400: "invalid_request_error",
  401: "authentication_error",
  403: "permission_error",
  404: "not_found_error",
  409: "conflict_error",
  422: "invalid_request_error",
  429: "rate_limit_error",
};

/** Erro de entrada lançado de qualquer ponto da rota; o envoltório converte em resposta. */
export class ErroApi extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: { param?: string; details?: unknown; type?: TipoDeErro; headers?: Record<string, string> } = {}
  ) {
    super(message);
    this.name = "ErroApi";
  }
}

export function novoRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function respostaDeErro(e: ErroApi, requestId: string): NextResponse {
  const corpo = {
    error: {
      type: e.extra.type ?? TIPO_POR_STATUS[e.status] ?? "api_error",
      code: e.code,
      message: e.message,
      ...(e.extra.param ? { param: e.extra.param } : {}),
      ...(e.extra.details !== undefined ? { details: e.extra.details } : {}),
      request_id: requestId,
    },
  };
  return NextResponse.json(corpo, { status: e.status, headers: { "X-Request-Id": requestId, ...(e.extra.headers ?? {}) } });
}

/** Converte qualquer erro conhecido em ErroApi; desconhecido vira 500 genérico (sem vazar detalhe). */
export function paraErroApi(e: unknown): ErroApi {
  if (e instanceof ErroApi) return e;
  if (e instanceof ErroDeCrm) return new ErroApi(e.status, e.status === 404 ? "not_found" : "invalid_request", e.message);
  if (e instanceof ErroDeFunil) {
    return new ErroApi(e.status, e.code, e.message, e.extra.deals !== undefined ? { details: { deals: e.extra.deals } } : {});
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return new ErroApi(409, "conflict", "Já existe um registro com esses dados.");
    if (e.code === "P2025") return new ErroApi(404, "not_found", "Registro não encontrado.");
    if (e.code === "P2003") return new ErroApi(400, "invalid_reference", "Referência inválida: um dos ids informados não existe.");
  }
  console.error("[api-v1] erro inesperado", e);
  return new ErroApi(500, "internal_error", "Erro interno. Tente de novo; se persistir, informe o request_id ao suporte.", {
    type: "api_error",
  });
}

export const naoEncontrado = (oque: string) => new ErroApi(404, "not_found", `${oque} não encontrado.`);
export const invalido = (mensagem: string, param?: string, details?: unknown) =>
  new ErroApi(400, "invalid_parameter", mensagem, { param, details });
export const invalidoNaRegra = (code: string, mensagem: string, details?: unknown, param?: string) =>
  new ErroApi(422, code, mensagem, { details, param });

/** Lista paginada no formato da v1. */
export function corpoDeLista<T>(data: T[], pagina: { hasMore: boolean; nextCursor: string | null; total?: number }) {
  return {
    data,
    has_more: pagina.hasMore,
    next_cursor: pagina.nextCursor,
    ...(pagina.total !== undefined ? { total: pagina.total } : {}),
  };
}

/** Segmento dinâmico da URL decodificado uma vez só (sem quebrar com "%" literal). */
export function segmento(valor: string): string {
  try {
    return decodeURIComponent(valor).trim();
  } catch {
    return valor.trim();
  }
}

/** Data em ISO-8601 com fuso (UTC), ou null. */
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
