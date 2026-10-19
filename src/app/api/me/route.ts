import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import type { Session } from "@/lib/data/types";
import { COOKIE_CONTRATO } from "@/lib/contrato/rotas";
import { getSessionContextDetalhado, requirePermission, type SessionContext } from "@/lib/server/permissions";
import { contratosDaPessoa, ehSuperadmin, resolverContratoAtivo } from "@/lib/server/contratos";
import { PAPEIS_DE_SISTEMA } from "@/lib/permissoes/catalogo";

// Sessão do contrato ativo (o da URL, que chega no cabeçalho x-eva-contrato).
// Contrato pedido sem vínculo: devolve só a pessoa, com semAcesso e o contrato
// padrão para onde mandar — nada do contrato pedido (nem o nome).

async function contratoPadrao(user: { id: string; email?: string | null }, profile: { orgId: string; role: string }) {
  const cookie = (await cookies()).get(COOKIE_CONTRATO)?.value ?? null;
  const r = await resolverContratoAtivo(
    { id: user.id, email: user.email, profileOrgId: profile.orgId, profileRole: profile.role },
    null,
    cookie
  );
  return r.ok ? r.acesso.orgId : null;
}

async function montarSessao(
  user: { id: string; email?: string | null },
  ctx: SessionContext | null
): Promise<Session | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, orgId: true, role: true },
  });
  if (!profile) return null;

  const contratos = await contratosDaPessoa({ id: profile.id, profileOrgId: profile.orgId });
  const pessoa = {
    userId: profile.id,
    name: profile.name,
    email: profile.email,
    superadmin: ehSuperadmin(user),
    contratos,
  };

  if (!ctx) {
    return { ...pessoa, orgName: "", semAcesso: true, contratoPadrao: await contratoPadrao(user, profile) };
  }

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { id: true, name: true, logoUrl: true },
  });
  if (!org) return { ...pessoa, orgName: "", semAcesso: true, contratoPadrao: await contratoPadrao(user, profile) };

  let papelNome = PAPEIS_DE_SISTEMA.find((p) => p.id === ctx.role)?.nome ?? ctx.role;
  if (ctx.papelId) {
    const papel = await prisma.customRole.findUnique({ where: { id: ctx.papelId }, select: { name: true } }).catch(() => null);
    if (papel) papelNome = papel.name;
  }

  // Superadmin num contrato onde não está: aparece no seletor também.
  if (!contratos.some((c) => c.id === org.id)) contratos.unshift(org);

  return {
    ...pessoa,
    orgName: org.name,
    orgLogoUrl: org.logoUrl ?? undefined,
    contratoId: org.id,
    papel: ctx.role,
    papelNome,
    permissoes: ctx.permissoes ?? [],
    superadmin: !!ctx.superadmin || pessoa.superadmin,
    contratoPadrao: org.id,
  };
}

function lembrarContrato(res: NextResponse, orgId: string | undefined) {
  // Último contrato usado: só para caminhos antigos (/negocios) e chamadas sem
  // cabeçalho. Nunca é a fonte da verdade — a URL é.
  if (orgId) {
    res.cookies.set(COOKIE_CONTRATO, orgId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ session: null });

  const { ctx } = await getSessionContextDetalhado();
  const session = await montarSessao(user, ctx);
  return lembrarContrato(NextResponse.json({ session }), session?.contratoId);
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { orgName, orgLogoUrl, name } = await request.json();

  // Validação leve: logo tem que ser data:image ou https (evita javascript: e
  // afins guardados e renderizados depois), e limites de tamanho pra não
  // gravar payload gigante.
  if (orgLogoUrl !== undefined && orgLogoUrl !== null) {
    if (typeof orgLogoUrl !== "string" || orgLogoUrl.length > 1_500_000) {
      return NextResponse.json({ error: "Logo inválido." }, { status: 400 });
    }
    if (!/^(data:image\/|https:\/\/)/i.test(orgLogoUrl)) {
      return NextResponse.json({ error: "Logo precisa ser uma imagem (data:image/ ou https://)." }, { status: 400 });
    }
  }
  if (orgName !== undefined && (typeof orgName !== "string" || orgName.length > 200)) {
    return NextResponse.json({ error: "Nome da organização inválido." }, { status: 400 });
  }
  if (name !== undefined && (typeof name !== "string" || name.length > 200)) {
    return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
  }

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  // Nome e logo são do CONTRATO ativo (o da URL), não do contrato padrão da
  // pessoa — e só quem gerencia o contrato mexe.
  if (orgName !== undefined || orgLogoUrl !== undefined) {
    const ctx = await requirePermission("contrato:gerenciar");
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    await prisma.organization.update({
      where: { id: ctx.orgId },
      data: {
        ...(orgName !== undefined ? { name: orgName } : {}),
        ...(orgLogoUrl !== undefined ? { logoUrl: orgLogoUrl } : {}),
      },
    });
  }

  if (name !== undefined) {
    await prisma.profile.update({ where: { id: user.id }, data: { name } });
  }

  const { ctx } = await getSessionContextDetalhado();
  const session = await montarSessao(user, ctx);
  return NextResponse.json({ session });
}
