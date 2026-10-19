import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { COOKIE_CONTRATO } from "@/lib/contrato/rotas";
import { contratosDaPessoa, ehSuperadmin, type ContratoResumo } from "@/lib/server/contratos";

// Contratos que a pessoa pode abrir — a tela "qual contrato deseja acessar?"
// e o seletor do menu. Superadmin vê todos os contratos da plataforma.
//
//   ?busca=   nome ou id (começo do id)
//   ?pagina=  1, 2, ... (50 por página)
//
// O último contrato usado (cookie) vem sempre primeiro. Esta lista é só para
// navegar: entrar no contrato confere o vínculo de novo, a cada requisição.

const POR_PAGINA = 50;

function filtrar(lista: ContratoResumo[], busca: string) {
  if (!busca) return lista;
  const b = busca.toLowerCase();
  return lista.filter((c) => c.name.toLowerCase().includes(b) || c.id.toLowerCase().startsWith(b));
}

function ultimoPrimeiro(lista: ContratoResumo[], ultimo: string | null) {
  if (!ultimo) return lista;
  const i = lista.findIndex((c) => c.id === ultimo);
  if (i <= 0) return lista;
  return [lista[i], ...lista.slice(0, i), ...lista.slice(i + 1)];
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { orgId: true, name: true } });
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  const url = new URL(request.url);
  const busca = (url.searchParams.get("busca") ?? "").trim().slice(0, 100);
  const pagina = Math.max(1, Number.parseInt(url.searchParams.get("pagina") ?? "1", 10) || 1);
  const ultimo = (await cookies()).get(COOKIE_CONTRATO)?.value ?? null;
  const superadmin = ehSuperadmin(user);

  const meus = await contratosDaPessoa({ id: user.id, profileOrgId: profile.orgId });

  if (!superadmin) {
    const lista = ultimoPrimeiro(filtrar(meus, busca), ultimo);
    const inicio = (pagina - 1) * POR_PAGINA;
    return NextResponse.json({
      nome: profile.name,
      superadmin: false,
      total: lista.length,
      totalSemBusca: meus.length,
      pagina,
      porPagina: POR_PAGINA,
      contratos: lista.slice(inicio, inicio + POR_PAGINA),
      ultimo,
    });
  }

  // Superadmin: busca no banco (pode haver centenas de contratos).
  const where = busca
    ? { OR: [{ name: { contains: busca, mode: "insensitive" as const } }, { id: { startsWith: busca.toLowerCase() } }] }
    : {};
  const select = { id: true, name: true, logoUrl: true } as const;
  const [total, totalSemBusca, pag] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.count(),
    prisma.organization.findMany({
      // O último usado sai da ordem alfabética em todas as páginas (e entra no
      // topo da primeira): assim a paginação não repete nem pula ninguém.
      where: ultimo ? { AND: [where, { id: { not: ultimo } }] } : where,
      select,
      orderBy: { name: "asc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);
  let contratos = pag;
  if (ultimo && pagina === 1) {
    const u = await prisma.organization.findFirst({ where: { AND: [where, { id: ultimo }] }, select });
    if (u) contratos = [u, ...pag];
  }
  return NextResponse.json({
    nome: profile.name,
    superadmin: true,
    total,
    totalSemBusca,
    pagina,
    porPagina: POR_PAGINA,
    contratos,
    ultimo,
  });
}
