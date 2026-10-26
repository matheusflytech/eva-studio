import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { iniciarImportacao } from "@/lib/server/api-v1/jobs";

// POST /api/v1/imports/{id}/start — depois de mandar o arquivo para a upload_url.
export const POST = rotaV1<{ id: string }>({ recurso: "imports" }, async (ctx, { id }) => {
  return NextResponse.json({ data: await iniciarImportacao(ctx.orgId, id) }, { status: 202 });
});
