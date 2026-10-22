import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePermission } from "@/lib/server/permissions";
import {
  COOKIE_OPENROUTER,
  gerarState,
  gerarVerificador,
  montarCookie,
  urlDeAutorizacao,
} from "@/lib/server/ia/openrouter-oauth";

// Começo do "Entrar com OpenRouter" (OAuth PKCE). Navegação de página
// inteira: o contrato vem na query, como no OAuth do Instagram. O
// verificador e o state ficam num cookie httpOnly de 10 minutos; só o
// desafio (hash) vai para o OpenRouter.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ctx = await requirePermission("integracoes:gerenciar", { contrato: url.searchParams.get("contrato") });
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const verificador = gerarVerificador();
  const state = gerarState();
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_OPENROUTER, montarCookie(ctx.orgId, state, verificador), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/ia/openrouter",
    maxAge: 600,
  });

  return NextResponse.redirect(
    urlDeAutorizacao({
      callbackUrl: `${url.origin}/api/ia/openrouter/callback`,
      verificador,
      state,
      rotulo: "Eva Studio",
    })
  );
}
