import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { publicarAutomacao } from "@/lib/server/automacoes/gerenciar";
import { respostaDoErro } from "../../comum";

// Publica o rascunho como versão nova e liga a automação (pendência bloqueia).
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    return NextResponse.json({ ok: true, ...(await publicarAutomacao(ctx.orgId, id, ctx.userId)) });
  } catch (e) {
    return respostaDoErro(e);
  }
}
