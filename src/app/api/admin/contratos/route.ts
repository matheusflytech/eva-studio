import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { comFallbackLegado, ehSuperadmin } from "@/lib/server/contratos";

// Painel da equipe Eva (superadmin = EVA_SUPERADMINS). Lista todos os
// contratos com membros e chaves ativas, e cria contrato novo. Quem não é
// superadmin recebe 404 — nem confirma que a rota existe.

async function superadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !ehSuperadmin(user)) return null;
  const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { id: true } });
  return profile ? user : null;
}

const POR_PAGINA = 50;

export async function GET(request: Request) {
  const user = await superadmin();
  if (!user) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const url = new URL(request.url);
  const busca = (url.searchParams.get("busca") ?? "").trim().slice(0, 100);
  const pagina = Math.max(1, Number.parseInt(url.searchParams.get("pagina") ?? "1", 10) || 1);
  const where = busca
    ? { OR: [{ name: { contains: busca, mode: "insensitive" as const } }, { id: { startsWith: busca.toLowerCase() } }] }
    : {};

  const [total, orgs] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: { id: true, name: true, createdAt: true },
    }),
  ]);
  const ids = orgs.map((o) => o.id);

  const [chaves, membros] = await Promise.all([
    prisma.apiKey.groupBy({ by: ["orgId"], where: { orgId: { in: ids }, revokedAt: null }, _count: { _all: true } }),
    comFallbackLegado(
      async () => {
        const [vinculos, legado] = await Promise.all([
          prisma.membership.groupBy({
            by: ["orgId"],
            where: { orgId: { in: ids }, status: { in: ["ativo", "convidado"] } },
            _count: { _all: true },
          }),
          prisma.profile.groupBy({
            by: ["orgId"],
            where: { orgId: { in: ids }, memberships: { none: {} } },
            _count: { _all: true },
          }),
        ]);
        const soma = new Map<string, number>();
        for (const g of [...vinculos, ...legado]) soma.set(g.orgId, (soma.get(g.orgId) ?? 0) + g._count._all);
        return soma;
      },
      async () => {
        const g = await prisma.profile.groupBy({ by: ["orgId"], where: { orgId: { in: ids } }, _count: { _all: true } });
        return new Map(g.map((x) => [x.orgId, x._count._all]));
      }
    ),
  ]);
  const chavesDe = new Map(chaves.map((c) => [c.orgId, c._count._all]));

  return NextResponse.json({
    total,
    pagina,
    porPagina: POR_PAGINA,
    contratos: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      membros: membros.get(o.id) ?? 0,
      chavesAtivas: chavesDe.get(o.id) ?? 0,
    })),
  });
}

// Contrato novo (cliente novo). Quem cria entra como dono, para poder
// convidar o cliente em seguida.
export async function POST(request: Request) {
  const user = await superadmin();
  if (!user) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) return NextResponse.json({ error: "Dê um nome ao contrato." }, { status: 400 });

  const org = await prisma.organization.create({ data: { name }, select: { id: true, name: true } });
  await prisma.membership
    .create({ data: { orgId: org.id, userId: user.id, role: "owner", status: "ativo" } })
    .catch(() => {
      /* sem o SQL de contratos o superadmin entra mesmo sem vínculo */
    });
  return NextResponse.json({ contrato: org }, { status: 201 });
}
