import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getSessionContext } from "@/lib/server/permissions";
import { rotaDoContrato } from "@/lib/contrato/rotas";
import { COOKIE_GOOGLE, exchangeCode, listCalendars, readCookie, sameState, sealRefreshToken } from "@/lib/server/google-calendar";

// Volta do Google. Confia no contrato e na pessoa do COOKIE (nunca da URL),
// exige o state igual, consome o cookie e confere que a sessão ainda é da
// mesma pessoa. O refresh token vai cifrado; as agendas começam como estão
// marcadas no próprio Google.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const saved = readCookie(cookieStore.get(COOKIE_GOOGLE)?.value);
  cookieStore.delete({ name: COOKIE_GOOGLE, path: "/api/integrations/google-calendar" });
  if (!saved || !sameState(saved.state, url.searchParams.get("state"))) {
    return NextResponse.json({ error: "state inválido (possível CSRF). Comece de novo em Configurações → Sua conta." }, { status: 400 });
  }

  const back = new URL(rotaDoContrato(saved.orgId, "/settings"), url.origin);
  back.searchParams.set("tab", "account");
  const code = url.searchParams.get("code");
  if (!code) {
    back.searchParams.set("google", "cancelado");
    return NextResponse.redirect(back);
  }

  const ctx = await getSessionContext({ contrato: saved.orgId });
  if (!ctx || ctx.userId !== saved.userId) return NextResponse.json({ error: "Sessão mudou no meio da conexão. Tente de novo." }, { status: 401 });

  const r = await exchangeCode(code, `${url.origin}/api/integrations/google-calendar/callback`);
  if ("error" in r) {
    back.searchParams.set("google", r.error);
    return NextResponse.redirect(back);
  }
  const calendars = await listCalendars({ token: r.accessToken }).catch(() => []);
  const data = { email: r.email, secrets: sealRefreshToken(r.refreshToken), calendars: calendars as object, status: "active", lastError: null };
  await prisma.googleCalendarConnection.upsert({
    where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
    create: { orgId: ctx.orgId, userId: ctx.userId, ...data },
    update: data,
  });
  back.searchParams.set("google", "ok");
  return NextResponse.redirect(back);
}
