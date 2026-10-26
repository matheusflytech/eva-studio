import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { exportarPacote, importarPacote, respostaDoBuilder } from "@/lib/server/subfluxos";

// Exportar e importar o bot inteiro (fluxo principal + fluxos extras) em JSON,
// pelo "…" do builder. Mesmo formato da API v1 (/agents/{id}/flow/export).

type Params = { params: Promise<{ agentId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { name: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  return NextResponse.json(await exportarPacote(agentId, agent.name));
}

export async function POST(request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { outboundUrl: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  const corpo = await request.json().catch(() => null);
  try {
    const r = await importarPacote(ctx.orgId, agentId, corpo, { modo: "builder", temUrlDoFluxo: !!agent.outboundUrl?.trim() });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return respostaDoBuilder(err);
  }
}
