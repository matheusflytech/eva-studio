import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePermission } from "@/lib/server/permissions";
import { rotaDoContrato } from "@/lib/contrato/rotas";
import { readCookie, sameState } from "@/lib/server/google-calendar";
import { COOKIE_META_ADS, connectFromCode } from "@/lib/server/meta-ads";

// Volta do Facebook Login. Confia no contrato e na pessoa do COOKIE (nunca da
// URL), exige o state igual, consome o cookie e confere que a sessão ainda é
// da mesma pessoa. As contas de anúncio chegam desligadas: a pessoa escolhe.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const saved = readCookie(cookieStore.get(COOKIE_META_ADS)?.value);
  cookieStore.delete({ name: COOKIE_META_ADS, path: "/api/marketing/meta" });
  if (!saved || !sameState(saved.state, url.searchParams.get("state"))) {
    return NextResponse.json({ error: "state inválido (possível CSRF). Comece de novo na aba Marketing." }, { status: 400 });
  }

  const back = new URL(rotaDoContrato(saved.orgId, "/marketing"), url.origin);
  const code = url.searchParams.get("code");
  if (!code) {
    back.searchParams.set("meta", "cancelado");
    return NextResponse.redirect(back);
  }

  const ctx = await requirePermission("marketing:editar", { contrato: saved.orgId });
  if ("error" in ctx || ctx.userId !== saved.userId) {
    return NextResponse.json({ error: "Sessão mudou no meio da conexão. Tente de novo." }, { status: 401 });
  }

  const r = await connectFromCode(ctx.orgId, ctx.userId, code, `${url.origin}/api/marketing/meta/callback`);
  back.searchParams.set("meta", "error" in r ? "erro" : "ok");
  return NextResponse.redirect(back);
}
