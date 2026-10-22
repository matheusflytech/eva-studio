import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { testarAutomacao } from "@/lib/server/automacoes/gerenciar";
import { respostaDoErro } from "../../comum";

// Testa o rascunho num registro real (as ações só mostram o que fariam).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { objetoId?: unknown };
  if (typeof b.objetoId !== "string" || !b.objetoId) return NextResponse.json({ error: "Escolha o registro do teste." }, { status: 400 });
  try {
    return NextResponse.json(await testarAutomacao(ctx.orgId, id, b.objetoId, ctx.userId));
  } catch (e) {
    return respostaDoErro(e);
  }
}
