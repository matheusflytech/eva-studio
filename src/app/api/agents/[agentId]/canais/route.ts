import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { ativarCanal, desativarCanal } from "@/lib/server/canais/ativacao";
import { CANAIS } from "@/lib/canais";

// O agente escolhe por qual canal do contrato atende em cada tipo:
// { tipo, canalId } ativa; { tipo, canalId: null } tira o que ele usa.
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const body = await request.json().catch(() => null);
  const tipo = String(body?.tipo ?? "");
  if (!CANAIS.some((c) => c.tipo === tipo)) return NextResponse.json({ error: "Canal desconhecido." }, { status: 400 });

  const agente = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { id: true } });
  if (!agente) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  if (body?.canalId) {
    const r = await ativarCanal(ctx.orgId, String(body.canalId), agentId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, saiuDe: r.saiuDe });
  }

  const atual = await prisma.canal.findFirst({ where: { orgId: ctx.orgId, agentId, tipo }, select: { id: true } });
  if (!atual) return NextResponse.json({ ok: true });
  const r = await desativarCanal(ctx.orgId, atual.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
