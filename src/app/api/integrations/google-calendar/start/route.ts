import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionContext } from "@/lib/server/permissions";
import { COOKIE_GOOGLE, authUrl, googleApp, newState } from "@/lib/server/google-calendar";

// Começo do "Conectar Google Agenda". A agenda é da pessoa, não do contrato:
// basta estar logada nele. Navegação de página inteira: o contrato vem na
// query e vai no cookie do state, junto de quem pediu.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ctx = await getSessionContext({ contrato: url.searchParams.get("contrato") });
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const app = googleApp();
  if (!app) return NextResponse.json({ error: "Google Agenda ainda não configurado neste ambiente." }, { status: 503 });

  const state = newState();
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_GOOGLE, `${ctx.orgId}|${ctx.userId}|${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/google-calendar",
    maxAge: 600,
  });
  return NextResponse.redirect(authUrl(app.clientId, `${url.origin}/api/integrations/google-calendar/callback`, state));
}
