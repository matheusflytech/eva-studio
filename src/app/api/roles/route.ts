import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { registrarNaConta } from "@/lib/server/historico-conta";
import { PAPEIS_DE_SISTEMA, permissoesDoPapelDeSistema, limparEscopos } from "@/lib/permissoes/catalogo";
import { dadosDoPapel, type Corpo } from "@/lib/server/papeis";
import { lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";
import { ehTabelaAusente } from "@/lib/server/contratos";

// Papéis do contrato: os de sistema (só leitura, dá para duplicar) e os
// personalizados (nome + permissões + escopo de dados).
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const personalizados = await prisma.customRole
    .findMany({
      where: { orgId: ctx.orgId },
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: { where: { status: { not: "removido" } } } } } },
    })
    .catch((e) => {
      if (ehTabelaAusente(e)) return [];
      throw e;
    });

  return NextResponse.json({
    sistema: PAPEIS_DE_SISTEMA.map((p) => ({ ...p, permissoes: permissoesDoPapelDeSistema(p.id) })),
    personalizados: personalizados.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      groupIds: r.groupIds,
      dataScope: limparEscopos(r.dataScope),
      membros: r._count.memberships,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await lerCorpo(request);
  if (!body) return NextResponse.json({ error: JSON_INVALIDO }, { status: 400 });

  const r = await dadosDoPapel(ctx.orgId, body as Corpo, true);
  if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: 400 });
  const d = r.dados;
  const papel = await prisma.customRole.create({
    data: {
      orgId: ctx.orgId,
      name: d.name!,
      description: d.description ?? "",
      permissions: d.permissions ?? [],
      groupIds: d.groupIds ?? [],
      dataScope: d.dataScope ?? {},
    },
  });
  await registrarNaConta(ctx.orgId, "papel.criou", "role", papel.id, null, { nome: papel.name, foto: {} });
  return NextResponse.json({ papel }, { status: 201 });
}
