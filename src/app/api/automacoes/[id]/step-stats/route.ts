import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { numerosDosPassos } from "@/lib/server/automacoes/telas";
import { respostaDoErro } from "../../comum";

// Quantas vezes cada bloco rodou nos últimos 30 dias e o último erro (canvas).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("automacoes:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    return NextResponse.json({ passos: await numerosDosPassos(ctx.orgId, id) });
  } catch (e) {
    return respostaDoErro(e);
  }
}
