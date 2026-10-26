import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { carregarJob, exportacaoComLink } from "@/lib/server/api-v1/jobs";

// GET /api/v1/exports/{id} — estado; pronto, traz download_url assinado (15 min).
export const GET = rotaV1<{ id: string }>({ recurso: "exports", aceitaTambem: ["write"] }, async (ctx, { id }) => {
  lerConsulta(ctx.url);
  return NextResponse.json({ data: await exportacaoComLink(await carregarJob(ctx.orgId, id, "export")) });
});
