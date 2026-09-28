import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { encryptSecret, decryptSecret } from "@/lib/server/crypto";

// ---------------------------------------------------------------------------
// Conexão com o Telegram.
//
// É o canal mais barato de ligar que existe: o usuário cria um bot no
// @BotFather, cola o token aqui, e a gente registra o webhook. Sem App
// Review, sem verificação de negócio, sem janela de 24h, sem modelo aprovado.
// Serve tanto como canal de verdade quanto como o jeito mais rápido de testar
// um fluxo em um app de mensagem real, sem depender da aprovação da Meta.
// ---------------------------------------------------------------------------

function webhookUrl(agentId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return `${base}/api/webhooks/telegram/${agentId}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const conn = await prisma.telegramConnection.findUnique({ where: { agentId } });
  return NextResponse.json({
    connected: !!conn,
    botUsername: conn?.botUsername ?? "",
    webhookSet: conn?.webhookSet ?? false,
    lastError: conn?.lastError ?? null,
    webhookUrl: webhookUrl(agentId),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { botToken } = await request.json();
  const token = String(botToken ?? "").trim();
  if (!token) return NextResponse.json({ error: "Cole o token do bot (@BotFather)." }, { status: 400 });

  // getMe valida o token antes de guardar — melhor descobrir que está errado
  // aqui do que numa conversa que nunca responde.
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const me = await meRes.json().catch(() => null);
  if (!meRes.ok || !me?.ok) {
    return NextResponse.json({ error: "Token inválido — o Telegram não reconheceu esse bot." }, { status: 400 });
  }

  const url = webhookUrl(agentId);
  if (!url.startsWith("https://")) {
    return NextResponse.json(
      { error: "O Telegram só aceita webhook em HTTPS. Configure NEXT_PUBLIC_APP_URL com o domínio público do app." },
      { status: 400 }
    );
  }

  // O secret_token volta em todo update no header X-Telegram-Bot-Api-Secret-Token
  // — é assim que o webhook confere que a chamada veio mesmo do Telegram.
  const secret = process.env.INTERNAL_API_SECRET ?? "";
  const hookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret || undefined,
      allowed_updates: ["message", "callback_query"],
    }),
  });
  const hook = await hookRes.json().catch(() => null);
  const webhookSet = !!hook?.ok;

  await prisma.telegramConnection.upsert({
    where: { agentId },
    create: {
      agentId,
      botToken: encryptSecret(token),
      botUsername: me.result?.username ?? "",
      webhookSet,
      lastError: webhookSet ? null : hook?.description ?? "Falha ao registrar webhook.",
    },
    update: {
      botToken: encryptSecret(token),
      botUsername: me.result?.username ?? "",
      webhookSet,
      lastError: webhookSet ? null : hook?.description ?? "Falha ao registrar webhook.",
    },
  });

  return NextResponse.json({
    ok: true,
    botUsername: me.result?.username ?? "",
    webhookSet,
    error: webhookSet ? null : hook?.description ?? null,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const conn = await prisma.telegramConnection.findUnique({ where: { agentId } });
  if (conn) {
    // Tira o webhook no Telegram também, senão o bot fica mandando update pra
    // uma URL que não vai mais responder nada.
    await fetch(`https://api.telegram.org/bot${decryptSecret(conn.botToken)}/deleteWebhook`).catch(() => {});
    await prisma.telegramConnection.delete({ where: { agentId } });
  }
  return NextResponse.json({ ok: true });
}
