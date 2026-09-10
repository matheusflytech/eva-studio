import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Ainda não tem um fluxo de login/Embedded Signup próprio pro Instagram (o
// da Meta hoje só cobre WhatsApp) — conexão manual mesmo, com o id da conta
// Instagram Business e o token de acesso da Página vinculada. Ver
// docs/meta-business-runbook.html §02 pra como conseguir esses dois valores.
export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, include: { instagramConnection: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  return NextResponse.json({
    connection: agent.instagramConnection
      ? { igBusinessId: agent.instagramConnection.igBusinessId, username: agent.instagramConnection.username }
      : null,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { igBusinessId, pageAccessToken, username } = await request.json();
  if (!igBusinessId?.trim() || !pageAccessToken?.trim()) {
    return NextResponse.json({ error: "igBusinessId e pageAccessToken são obrigatórios." }, { status: 400 });
  }

  await prisma.instagramConnection.upsert({
    where: { agentId },
    create: { agentId, igBusinessId: igBusinessId.trim(), pageAccessToken: pageAccessToken.trim(), username: username?.trim() || null },
    update: { igBusinessId: igBusinessId.trim(), pageAccessToken: pageAccessToken.trim(), username: username?.trim() || null },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  await prisma.instagramConnection.deleteMany({ where: { agentId } });
  return NextResponse.json({ ok: true });
}
