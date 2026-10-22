import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { retomarAutomacao } from "@/lib/server/automacoes/gerenciar";
import { respostaDoErro } from "../../comum";

// Liga de novo a versão publicada; as execuções pausadas continuam.
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    await retomarAutomacao(ctx.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDoErro(e);
  }
}
