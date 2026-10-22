import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { criarExportacao } from "@/lib/server/api-v1/jobs";

// POST /api/v1/exports — { entity: contacts|deals, format?: csv|jsonl, filters? }.
// 202 com o job; quando `status` = completed, GET /exports/{id} traz download_url (15 min).
// Para sincronização contínua, prefira as listas com updated_since.
export const POST = rotaV1({ recurso: "exports", acao: "read" }, async (ctx) => {
  const data = await criarExportacao(ctx.orgId, ctx.keyId, ctx.corpo());
  return NextResponse.json({ data }, { status: 202 });
});
