import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { criarImportacao } from "@/lib/server/api-v1/jobs";

// POST /api/v1/imports — importação assíncrona (contacts | deals). Responde
// 202 com o job; acompanhe em GET /api/v1/imports/{id}. Idempotency-Key
// obrigatório: reenviar uma importação inteira por engano é caro.
export const POST = rotaV1({ recurso: "imports", idempotencia: "obrigatoria" }, async (ctx) => {
  const data = await criarImportacao(ctx.orgId, ctx.keyId, ctx.corpo());
  return NextResponse.json({ data }, { status: 202 });
});
