import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { getConnection, hottokOf, saveConnection, suggestStages, validateProducts } from "@/lib/server/hotmart/connection";

// Conexão Hotmart do contrato para o painel de Integrações. Nunca devolve o hottok.
export async function GET(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const c = await getConnection(ctx.orgId);
  const pipelines = await prisma.pipeline.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, stages: { orderBy: { position: "asc" }, select: { id: true, name: true } } },
  });
  return NextResponse.json({
    connection: c
      ? { url: `${new URL(request.url).origin}/api/webhooks/hotmart/${c.token}`, hasHottok: !!hottokOf(c.secrets), products: c.products, status: c.status, lastEventAt: c.lastEventAt }
      : null,
    pipelines: pipelines.map((p) => ({ ...p, suggestion: suggestStages(p.stages) })),
  });
}

export async function PUT(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const hottok = typeof body.hottok === "string" && body.hottok.trim() ? body.hottok.trim().slice(0, 200) : undefined;
  const products = body.products !== undefined ? await validateProducts(ctx.orgId, body.products) : undefined;
  const status = body.status === "paused" || body.status === "active" ? body.status : undefined;
  await saveConnection(ctx.orgId, { hottok, products, status });
  return NextResponse.json({ ok: true });
}
