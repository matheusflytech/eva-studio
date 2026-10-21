import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { testarEndpoint } from "@/lib/server/webhooks/endpoints";
import { respostaDoErro } from "../../erro";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    return NextResponse.json(await testarEndpoint(ctx.orgId, id));
  } catch (e) {
    return respostaDoErro(e);
  }
}
