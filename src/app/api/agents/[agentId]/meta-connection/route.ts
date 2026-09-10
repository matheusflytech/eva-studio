import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Embedded Signup da Meta: o widget do Facebook devolve um "code" de curta
// duração pro navegador (via FB.login) — essa rota troca esse code por um
// access token de verdade (Graph API) e salva a conexão. Só existe de
// verdade quando o app Meta tiver sido criado (ver docs/meta-business-runbook.html).
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json({ error: "App Meta ainda não configurado neste ambiente." }, { status: 503 });
  }

  const { code, wabaId, phoneNumberId } = await request.json();
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ error: "code, wabaId e phoneNumberId são obrigatórios." }, { status: 400 });
  }

  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: "Meta não devolveu um token válido pra esse code." }, { status: 502 });
    }

    // Assina o app pra receber os webhooks dessa WABA — passo exigido pelo
    // fluxo de Embedded Signup, sem isso as mensagens não chegam.
    await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let displayPhone: string | null = null;
    try {
      const phoneRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const phoneData = await phoneRes.json();
      displayPhone = phoneData?.display_phone_number ?? null;
    } catch {
      // não crítico — a conexão já funciona sem isso, só não mostra o número na UI
    }

    await prisma.metaConnection.upsert({
      where: { agentId },
      create: { agentId, phoneNumberId, wabaId, accessToken, displayPhone },
      update: { phoneNumberId, wabaId, accessToken, displayPhone },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Falha ao concluir a conexão com a Meta." }, { status: 502 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, include: { metaConnection: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  return NextResponse.json({
    configured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    connection: agent.metaConnection
      ? { phoneNumberId: agent.metaConnection.phoneNumberId, displayPhone: agent.metaConnection.displayPhone }
      : null,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  await prisma.metaConnection.deleteMany({ where: { agentId } });
  return NextResponse.json({ ok: true });
}
