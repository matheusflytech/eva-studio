import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { testarAutomacao, testarDeVerdade } from "@/lib/server/automacoes/gerenciar";
import { respostaDoErro } from "../../comum";

// Testar o rascunho:
// - { modo: "real", telefone?, email? }: cria um registro de teste que cumpre o gatilho e
//   as condições e roda todos os passos de verdade nele (WhatsApp só para o
//   telefone do teste).
// - { objetoId }: simula num registro real (as ações só mostram o que fariam).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { objetoId?: unknown; modo?: unknown; telefone?: unknown; email?: unknown; confirmarContatoExistente?: unknown };
  try {
    if (b.modo === "real") {
      return NextResponse.json(
        await testarDeVerdade(ctx.orgId, id, { telefone: b.telefone, email: b.email, confirmarContatoExistente: b.confirmarContatoExistente }, ctx.userId)
      );
    }
    if (typeof b.objetoId !== "string" || !b.objetoId) return NextResponse.json({ error: "Escolha o registro do teste." }, { status: 400 });
    return NextResponse.json(await testarAutomacao(ctx.orgId, id, b.objetoId, ctx.userId));
  } catch (e) {
    return respostaDoErro(e);
  }
}
