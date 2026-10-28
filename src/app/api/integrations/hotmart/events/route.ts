import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { getConnection, type Products } from "@/lib/server/hotmart/connection";
import { applyEvent } from "@/lib/server/hotmart/apply";
import type { FieldMap } from "@/lib/hotmart/fields";

// Últimos eventos recebidos (log do painel) e "Reprocessar" um evento.
export async function GET() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const events = await prisma.hotmartEvent.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, event: true, productId: true, transaction: true, email: true, result: true, detail: true, dealId: true, createdAt: true },
  });
  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await request.json().catch(() => ({}));
  const ev = typeof id === "string" ? await prisma.hotmartEvent.findFirst({ where: { id, orgId: ctx.orgId } }) : null;
  const c = await getConnection(ctx.orgId);
  if (!ev || !c) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  const r = await applyEvent(ctx.orgId, c.products as unknown as Products, ev.payload, c.fields as FieldMap);
  await prisma.hotmartEvent.update({
    where: { id: ev.id },
    data: { result: r.result, detail: r.detail ?? null, contactId: r.contactId ?? null, dealId: r.dealId ?? null, processedAt: new Date() },
  });
  return NextResponse.json(r);
}
