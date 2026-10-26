import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { carregarJob, serializarJob } from "@/lib/server/api-v1/jobs";

// GET /api/v1/imports/{id} — estado e contadores (created/updated/unchanged/failed).
export const GET = rotaV1<{ id: string }>({ recurso: "imports", aceitaTambem: ["write"] }, async (ctx, { id }) => {
  lerConsulta(ctx.url);
  return NextResponse.json({ data: serializarJob(await carregarJob(ctx.orgId, id, "import")) });
});
