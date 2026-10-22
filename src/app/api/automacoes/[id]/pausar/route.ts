import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { pausarAutomacao } from "@/lib/server/automacoes/gerenciar";
import { respostaDoErro } from "../../comum";

// Pausa: não inscreve ninguém e quem está no meio para no próximo passo.
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    await pausarAutomacao(ctx.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDoErro(e);
  }
}
