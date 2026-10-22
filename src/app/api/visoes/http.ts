import "server-only";
import { NextResponse } from "next/server";
import { requirePermission, type SessionContext } from "@/lib/server/permissions";
import { ErroDeVisao } from "@/lib/server/visoes-salvas";
import type { EntidadeCrm } from "@/lib/filtro-crm";

// Peças comuns das rotas de visões salvas.

export function lerEntidade(v: unknown): EntidadeCrm | null {
  return v === "contatos" || v === "negocios" ? v : null;
}

/** Ver a lista é o mínimo para ter visões dela (contatos:ver / negocios:ver). */
export async function sessaoDaLista(entidade: EntidadeCrm): Promise<SessionContext | NextResponse> {
  const ctx = await requirePermission(entidade === "contatos" ? "contatos:ver" : "negocios:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return ctx;
}

export function responderErro(e: unknown): NextResponse {
  if (e instanceof ErroDeVisao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
  throw e;
}
