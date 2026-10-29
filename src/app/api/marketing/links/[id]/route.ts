import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// Renomear ou arquivar/desarquivar um link. O código e o destino não mudam:
// o link pode já estar impresso ou publicado.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("marketing:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const data: { name?: string; archivedAt?: Date | null } = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 120);
  if (typeof b.archived === "boolean") data.archivedAt = b.archived ? new Date() : null;
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nada para mudar." }, { status: 400 });
  const u = await prisma.trackedLink.updateMany({ where: { id, orgId: ctx.orgId }, data });
  if (!u.count) return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
