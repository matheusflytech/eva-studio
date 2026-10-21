import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { MODO_CONTRATO } from "@/lib/server/canais/conectar";

const STATE_COOKIE = "ig_oauth_state";
const SCOPES = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments";

// Início do fluxo OAuth do Instagram. Antes redirecionava direto do cliente
// pra instagram.com com state=agentId (sem proteção CSRF). Agora passa por
// aqui: valida sessão + posse do agente, gera um nonce aleatório, guarda
// "<agentId>|<nonce>" num cookie httpOnly (single-use, 10min) e manda o nonce
// como `state`. O callback confere o nonce e confia no agentId do cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const doContrato = url.searchParams.get("modo") === "contrato";
  const agentId = doContrato ? MODO_CONTRATO : url.searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId é obrigatório." }, { status: 400 });

  // Navegação de página inteira: o contrato vem na query (conferido como o
  // cabeçalho) e vai junto no cookie do state, para o callback voltar ao
  // mesmo contrato mesmo com outra aba aberta em outro.
  const orgId = await requireOrgId({ contrato: url.searchParams.get("contrato") });
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!doContrato) {
    const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
    if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  }

  const appId = process.env.INSTAGRAM_APP_ID ?? process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "App Instagram não configurado neste ambiente." }, { status: 503 });
  }

  const nonce = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, `${orgId}:${agentId}|${nonce}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const redirectUri = `${url.origin}/api/instagram/oauth/callback`;
  const authorizeUrl =
    `https://www.instagram.com/oauth/authorize?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${SCOPES}&response_type=code&state=${nonce}`;

  return NextResponse.redirect(authorizeUrl);
}
