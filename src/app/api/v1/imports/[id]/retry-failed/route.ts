import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { refazerFalhas } from "@/lib/server/api-v1/jobs";

// POST /api/v1/imports/{id}/retry-failed — nova importação com as linhas que falharam.
export const POST = rotaV1<{ id: string }>({ recurso: "imports", idempotencia: "obrigatoria" }, async (ctx, { id }) => {
  return NextResponse.json({ data: await refazerFalhas(ctx.orgId, ctx.keyId, id) }, { status: 202 });
});
