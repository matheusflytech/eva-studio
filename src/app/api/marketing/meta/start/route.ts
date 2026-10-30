import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePermission } from "@/lib/server/permissions";
import { COOKIE_META_ADS, loginUrl, metaAdsApp, newState } from "@/lib/server/meta-ads";

// Começo do "Conectar Meta Ads" (aba Marketing). Navegação de página inteira:
// o contrato vem na query e vai no cookie do state, junto de quem pediu.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ctx = await requirePermission("marketing:editar", { contrato: url.searchParams.get("contrato") });
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const app = metaAdsApp();
  if (!app) return NextResponse.json({ error: "App da Meta ainda não configurado neste ambiente." }, { status: 503 });

  const state = newState();
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_META_ADS, `${ctx.orgId}|${ctx.userId}|${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/marketing/meta",
    maxAge: 600,
  });
  return NextResponse.redirect(loginUrl(app, `${url.origin}/api/marketing/meta/callback`, state));
}
