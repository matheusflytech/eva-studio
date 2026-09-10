import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Callback do Instagram Login (OAuth direto — "Instagram API with Instagram
// Login", não precisa mais de Página do Facebook). `state` carrega o
// agentId; a validação de propriedade acontece via cookie de sessão normal
// (é o navegador do usuário logado voltando do redirect da Meta, não uma
// chamada de servidor a servidor). Ver docs/meta-business-runbook.html.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const agentId = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (!agentId) {
    return NextResponse.json({ error: "state (agentId) ausente." }, { status: 400 });
  }

  const redirectBack = new URL(`/agent-studio/${agentId}`, url.origin);

  if (errorParam || !code) {
    redirectBack.searchParams.set("instagram_error", errorParam ?? "cancelado");
    return NextResponse.redirect(redirectBack);
  }

  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json({ error: "App Instagram ainda não configurado neste ambiente." }, { status: 503 });
  }

  try {
    const redirectUri = `${url.origin}/api/instagram/oauth/callback`;

    const shortTokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    const shortTokenData = await shortTokenRes.json();
    const shortToken = shortTokenData?.access_token;
    if (!shortToken) {
      redirectBack.searchParams.set("instagram_error", "token_exchange_failed");
      return NextResponse.redirect(redirectBack);
    }

    const longTokenRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`
    );
    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData?.access_token ?? shortToken;

    const meRes = await fetch(`https://graph.instagram.com/me?fields=user_id,username&access_token=${accessToken}`);
    const me = await meRes.json();
    const igBusinessId = String(me?.user_id ?? shortTokenData?.user_id ?? "");
    if (!igBusinessId) {
      redirectBack.searchParams.set("instagram_error", "missing_user_id");
      return NextResponse.redirect(redirectBack);
    }

    await prisma.instagramConnection.upsert({
      where: { agentId },
      create: { agentId, igBusinessId, pageAccessToken: accessToken, username: me?.username ?? null },
      update: { igBusinessId, pageAccessToken: accessToken, username: me?.username ?? null },
    });

    redirectBack.searchParams.set("instagram", "connected");
    return NextResponse.redirect(redirectBack);
  } catch {
    redirectBack.searchParams.set("instagram_error", "unexpected");
    return NextResponse.redirect(redirectBack);
  }
}
