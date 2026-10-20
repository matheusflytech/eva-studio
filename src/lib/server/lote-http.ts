import "server-only";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { JSON_INVALIDO, erro, lerCorpo } from "@/lib/server/api-validacao";
import { ErroDoLote, executarLote } from "@/lib/server/lote";
import { lerPedidoDeLote } from "@/lib/lote/lote";
import type { EntidadeCrm } from "@/lib/filtro-crm";

/**
 * Rota comum de POST /api/contacts/lote e /api/deals/lote. Sessão do
 * contrato ativo com "ver" da lista; a permissão de cada ação é conferida em
 * executarLote (403 quando falta).
 */
export async function responderLote(request: Request, entidade: EntidadeCrm): Promise<NextResponse> {
  const ctx = await requirePermission(entidade === "contatos" ? "contatos:ver" : "negocios:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const corpo = await lerCorpo(request);
  if (!corpo) return erro(JSON_INVALIDO);
  const pedido = lerPedidoDeLote(corpo, entidade);
  if (typeof pedido === "string") return erro(pedido);
  try {
    return NextResponse.json(await executarLote(ctx, entidade, pedido));
  } catch (e) {
    if (e instanceof ErroDoLote) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
    throw e;
  }
}
