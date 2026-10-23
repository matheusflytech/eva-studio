import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { registrarNaConta } from "@/lib/server/historico-conta";
import { limparPermissoes } from "@/lib/permissoes/catalogo";
import { descricao, nomeValido } from "@/lib/server/papeis";
import { lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";
import { ehTabelaAusente } from "@/lib/server/contratos";

// Grupos de permissões: pacotes extras ("Financeiro", "Exportar dados")
// somados ao papel de quem recebe.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const grupos = await prisma.permissionGroup
    .findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } })
    .catch((e) => {
      if (ehTabelaAusente(e)) return [];
      throw e;
    });
  return NextResponse.json({
    grupos: grupos.map((g) => ({ id: g.id, name: g.name, description: g.description, permissions: g.permissions })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await lerCorpo(request);
  if (!body) return NextResponse.json({ error: JSON_INVALIDO }, { status: 400 });
  const name = nomeValido(body.name);
  if (!name) return NextResponse.json({ error: "Dê um nome ao grupo (até 80 caracteres)." }, { status: 400 });
  const grupo = await prisma.permissionGroup.create({
    data: { orgId: ctx.orgId, name, description: descricao(body.description), permissions: limparPermissoes(body.permissions) },
  });
  await registrarNaConta(ctx.orgId, "grupo.criou", "permission_group", grupo.id, null, { nome: grupo.name, foto: {} });
  return NextResponse.json({ grupo }, { status: 201 });
}
