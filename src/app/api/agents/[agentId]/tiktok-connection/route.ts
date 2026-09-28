import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { encryptSecret } from "@/lib/server/crypto";

// Conexão do TikTok Business Messaging.
//
// Cadastro manual do trio (business id + access token + refresh token) que o
// OAuth do portal devolve. Não há Embedded Signup aqui, e o app precisa de
// aprovação no portal de desenvolvedor antes de qualquer coisa funcionar.
function webhookUrl(agentId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const secret = process.env.INTERNAL_API_SECRET;
  // O TikTok não assina o corpo, então a URL carrega um segredo como única
  // prova possível de origem.
  return `${base}/api/webhooks/tiktok/${agentId}${secret ? `?token=${secret}` : ""}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const conn = await prisma.tikTokConnection.findUnique({ where: { agentId } });
  return NextResponse.json({
    connected: !!conn,
    businessId: conn?.businessId ?? "",
    displayName: conn?.displayName ?? "",
    expiresAt: conn?.expiresAt?.toISOString() ?? null,
    lastError: conn?.lastError ?? null,
    webhookUrl: webhookUrl(agentId),
    appConfigured: !!process.env.TIKTOK_APP_ID && !!process.env.TIKTOK_APP_SECRET,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const body = await request.json();
  const businessId = String(body.businessId ?? "").trim();
  const accessToken = String(body.accessToken ?? "").trim();
  const refreshToken = String(body.refreshToken ?? "").trim();
  const expiresInSeconds = Number(body.expiresIn ?? 0);

  if (!businessId || !accessToken) {
    return NextResponse.json({ error: "Informe o Business ID e o access token." }, { status: 400 });
  }

  await prisma.tikTokConnection.upsert({
    where: { agentId },
    create: {
      agentId,
      businessId,
      accessToken: encryptSecret(accessToken),
      refreshToken: refreshToken ? encryptSecret(refreshToken) : "",
      expiresAt: expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000) : null,
      displayName: String(body.displayName ?? ""),
    },
    update: {
      businessId,
      accessToken: encryptSecret(accessToken),
      refreshToken: refreshToken ? encryptSecret(refreshToken) : "",
      expiresAt: expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000) : null,
      displayName: String(body.displayName ?? ""),
      lastError: null,
    },
  });

  return NextResponse.json({ ok: true, webhookUrl: webhookUrl(agentId) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  await prisma.tikTokConnection.deleteMany({ where: { agentId } });
  return NextResponse.json({ ok: true });
}
