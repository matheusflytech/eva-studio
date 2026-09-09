import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

async function assertOwnedAgent(agentId: string, orgId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  return !!agent;
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;
  if (!(await assertOwnedAgent(agentId, orgId))) {
    return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  }

  const conn = await prisma.whatsAppConnection.findUnique({ where: { agentId } });
  return NextResponse.json({
    connection: conn
      ? {
          status: conn.status,
          qrDataUrl: conn.qrDataUrl,
          phoneNumber: conn.phoneNumber,
          lastError: conn.lastError,
        }
      : { status: "disconnected", qrDataUrl: null, phoneNumber: null, lastError: null },
  });
}

// Pede pro worker abrir uma sessão nova e gerar um QR code.
export async function POST(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;
  if (!(await assertOwnedAgent(agentId, orgId))) {
    return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  }

  await prisma.whatsAppConnection.upsert({
    where: { agentId },
    create: { agentId, status: "requesting" },
    update: { status: "requesting", qrDataUrl: null, lastError: null },
  });

  return NextResponse.json({ ok: true });
}

// Desconecta e limpa a sessão (o worker faz logout no próximo ciclo).
export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;
  if (!(await assertOwnedAgent(agentId, orgId))) {
    return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  }

  await prisma.whatsAppConnection.upsert({
    where: { agentId },
    create: { agentId, status: "logging_out" },
    update: { status: "logging_out" },
  });

  return NextResponse.json({ ok: true });
}
