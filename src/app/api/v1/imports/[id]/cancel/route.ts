import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { cancelarJob } from "@/lib/server/api-v1/jobs";

// POST /api/v1/imports/{id}/cancel — para na próxima fatia; o que já foi gravado fica.
export const POST = rotaV1<{ id: string }>({ recurso: "imports" }, async (ctx, { id }) => {
  return NextResponse.json({ data: await cancelarJob(ctx.orgId, id, "import") });
});
