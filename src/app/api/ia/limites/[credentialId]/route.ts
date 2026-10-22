import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { salvarLimite } from "@/lib/server/ia/uso";

// Limite mensal (tokens) e preço por 1 milhão de tokens (R$) de uma chave de
// IA do contrato. Enviar null limpa o valor.
export async function PUT(request: Request, { params }: { params: Promise<{ credentialId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { credentialId } = await params;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Envie { limiteMensalTokens, precoMilhaoBrl }." }, { status: 400 });
  }
  const r = await salvarLimite(ctx.orgId, credentialId, body.limiteMensalTokens ?? null, body.precoMilhaoBrl ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
