import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { opcoesDoEditor } from "@/lib/server/automacoes/telas";

// Opções dos seletores do editor (etapas, etiquetas, pessoas, agentes, modelos...).
export async function GET() {
  const ctx = await requirePermission("automacoes:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await opcoesDoEditor(ctx.orgId));
}
