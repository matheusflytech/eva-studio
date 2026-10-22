import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { caminhoDaEntrada, desligarEntrada, gerarTokenDaEntrada, tokenDaEntrada } from "@/lib/server/webhooks/entrada-do-agente";

// URL de entrada do agente (aba Avançado): ver, gerar/trocar e desligar.

type P = { params: Promise<{ agentId: string }> };
const SEM_TABELA = "A URL de entrada ainda não foi ativada no banco deste ambiente (SQL 2026-10-23-webhooks.sql).";

async function doContrato(orgId: string, agentId: string) {
  return prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true } });
}

export async function GET(_request: Request, { params }: P) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;
  if (!(await doContrato(ctx.orgId, agentId))) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  try {
    const token = await tokenDaEntrada(ctx.orgId, agentId);
    return NextResponse.json({ disponivel: true, caminho: token ? caminhoDaEntrada(agentId, token) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ disponivel: false, caminho: null });
  }
}

export async function POST(_request: Request, { params }: P) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;
  if (!(await doContrato(ctx.orgId, agentId))) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  try {
    const token = await gerarTokenDaEntrada(ctx.orgId, agentId);
    return NextResponse.json({ caminho: caminhoDaEntrada(agentId, token) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: SEM_TABELA }, { status: 409 });
  }
}

export async function DELETE(_request: Request, { params }: P) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;
  try {
    await desligarEntrada(ctx.orgId, agentId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: SEM_TABELA }, { status: 409 });
  }
}
