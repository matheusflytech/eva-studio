import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import type { Session } from "@/lib/data/types";

async function loadSession(userId: string): Promise<Session | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!profile) return null;

  return {
    userId: profile.id,
    name: profile.name,
    email: profile.email,
    orgName: profile.organization.name,
    orgLogoUrl: profile.organization.logoUrl ?? undefined,
  };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ session: null });

  const session = await loadSession(user.id);
  return NextResponse.json({ session });
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
  // gravar payload gigante. Só afeta a própria org do usuário, mas defesa em
  // profundidade não custa.
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

  if (orgName !== undefined || orgLogoUrl !== undefined) {
    await prisma.organization.update({
      where: { id: profile.orgId },
      data: {
        ...(orgName !== undefined ? { name: orgName } : {}),
        ...(orgLogoUrl !== undefined ? { logoUrl: orgLogoUrl } : {}),
      },
    });
  }

  if (name !== undefined) {
    await prisma.profile.update({ where: { id: user.id }, data: { name } });
  }

  const session = await loadSession(user.id);
  return NextResponse.json({ session });
}
