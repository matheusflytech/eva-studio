import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { erro, JSON_INVALIDO, lerCorpo } from "@/lib/server/api-validacao";

// Recebe { ids: [...] } na nova ordem e regrava a posição de cada campo.
export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 100) : [];
  if (ids.length === 0) return NextResponse.json({ error: "Nada para ordenar." }, { status: 400 });

  const doOrg = await prisma.customField.findMany({ where: { orgId: ctx.orgId, id: { in: ids } }, select: { id: true } });
  const validos = new Set(doOrg.map((c) => c.id));

  await prisma.$transaction(
    ids.filter((i) => validos.has(i)).map((id, position) => prisma.customField.update({ where: { id }, data: { position } }))
  );
  return NextResponse.json({ ok: true });
}
