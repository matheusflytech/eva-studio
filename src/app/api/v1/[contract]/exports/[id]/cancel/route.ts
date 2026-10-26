import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { cancelarJob } from "@/lib/server/api-v1/jobs";

export const POST = rotaV1<{ id: string }>({ recurso: "exports", aceitaTambem: ["read"] }, async (ctx, { id }) => {
  return NextResponse.json({ data: await cancelarJob(ctx.orgId, id, "export") });
});
