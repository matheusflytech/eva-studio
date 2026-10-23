import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { apagarTeste, continuarTeste } from "@/lib/server/automacoes/gerenciar";
import { respostaDoErro } from "../../../comum";

// Teste de verdade em andamento:
// - POST: continua depois de uma espera curta (seguro chamar à toa).
// - DELETE: "Apagar dados do teste" (para o teste e remove só o que ele criou).
type Params = { params: Promise<{ id: string; execucaoId: string }> };

export async function POST(_r: Request, { params }: Params) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, execucaoId } = await params;
  try {
    return NextResponse.json(await continuarTeste(ctx.orgId, id, execucaoId));
  } catch (e) {
    return respostaDoErro(e);
  }
}

export async function DELETE(_r: Request, { params }: Params) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, execucaoId } = await params;
  try {
    return NextResponse.json(await apagarTeste(ctx.orgId, id, execucaoId));
  } catch (e) {
    return respostaDoErro(e);
  }
}
