import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { carregarJob, serializarJob } from "@/lib/server/api-v1/jobs";

// GET /api/v1/imports/{id} — estado e contadores (created/updated/unchanged/failed).
export const GET = rotaV1<{ id: string }>({ recurso: "imports", acao: "write" }, async (ctx, { id }) => {
  return NextResponse.json({ data: serializarJob(await carregarJob(ctx.orgId, id, "import")) });
});
