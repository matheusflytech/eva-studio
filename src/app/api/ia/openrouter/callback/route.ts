import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/server/crypto";
import { rotaDoContrato } from "@/lib/contrato/rotas";
import { COOKIE_OPENROUTER, lerCookie, stateConfere, trocarCodigoPorChave } from "@/lib/server/ia/openrouter-oauth";

// Volta do OpenRouter. Confia no contrato e no verificador do COOKIE (nunca
// da URL), exige o state igual e consome o cookie de uma vez. A chave
// recebida vira uma Credential "openrouter" cifrada do contrato e a pessoa
// volta para Integrações com o resultado na query.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const salvo = lerCookie(cookieStore.get(COOKIE_OPENROUTER)?.value);
  cookieStore.delete({ name: COOKIE_OPENROUTER, path: "/api/ia/openrouter" });

  if (!salvo || !stateConfere(salvo.state, url.searchParams.get("state"))) {
    return NextResponse.json({ error: "state inválido (possível CSRF). Comece de novo em Integrações." }, { status: 400 });
  }

  const volta = new URL(rotaDoContrato(salvo.orgId, "/integrations"), url.origin);
  const code = url.searchParams.get("code");
  if (!code) {
    volta.searchParams.set("openrouter", "cancelado");
    return NextResponse.redirect(volta);
  }

  const ctx = await requirePermission("integracoes:gerenciar", { contrato: salvo.orgId });
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const troca = await trocarCodigoPorChave(code, salvo.verificador);
  if ("erro" in troca) {
    volta.searchParams.set("openrouter", troca.erro);
    return NextResponse.redirect(volta);
  }

  await prisma.credential.create({
    data: { orgId: ctx.orgId, name: "OpenRouter (conta conectada)", type: "openrouter", secretEnc: encryptSecret(troca.key) },
  });
  volta.searchParams.set("openrouter", "ok");
  return NextResponse.redirect(volta);
}
