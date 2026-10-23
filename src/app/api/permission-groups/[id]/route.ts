import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { fotoDoGrupo, fotoSegura, registrarNaConta } from "@/lib/server/historico-conta";
import { limparPermissoes } from "@/lib/permissoes/catalogo";
import { descricao, nomeValido } from "@/lib/server/papeis";
import { lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const atual = await prisma.permissionGroup.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
  if (!atual) return NextResponse.json({ error: "Grupo não encontrado." }, { status: 404 });

  const body = await lerCorpo(request);
  if (!body) return NextResponse.json({ error: JSON_INVALIDO }, { status: 400 });
  const data: { name?: string; description?: string; permissions?: string[] } = {};
  if (body.name !== undefined) {
    const n = nomeValido(body.name);
    if (!n) return NextResponse.json({ error: "Dê um nome ao grupo (até 80 caracteres)." }, { status: 400 });
    data.name = n;
  }
  if (body.description !== undefined) data.description = descricao(body.description);
  if (body.permissions !== undefined) data.permissions = limparPermissoes(body.permissions);

  const antes = await fotoSegura(fotoDoGrupo(ctx.orgId, id));
  const grupo = await prisma.permissionGroup.update({ where: { id }, data });
  await registrarNaConta(ctx.orgId, "grupo.alterou", "permission_group", id, antes, await fotoSegura(fotoDoGrupo(ctx.orgId, id)));
  return NextResponse.json({ grupo });
}

// Id de grupo apagado que ficou em vínculo/papel é ignorado na sessão (só
// grupos que existem no contrato somam permissão).
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const antes = await fotoSegura(fotoDoGrupo(ctx.orgId, id));
  const { count } = await prisma.permissionGroup.deleteMany({ where: { id, orgId: ctx.orgId } });
  if (count === 0) return NextResponse.json({ error: "Grupo não encontrado." }, { status: 404 });
  await registrarNaConta(ctx.orgId, "grupo.apagou", "permission_group", id, null, antes);
  return NextResponse.json({ ok: true });
}
