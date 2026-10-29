import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { getConnection, type Products } from "@/lib/server/hotmart/connection";
import { applyEvent } from "@/lib/server/hotmart/apply";
import { comAtor } from "@/lib/server/eventos/barramento";
import type { FieldMap } from "@/lib/hotmart/fields";
import { IMPORT_PREFIX } from "@/lib/hotmart/history";

// Últimos eventos recebidos (log do painel) e "Reprocessar" um evento.
export async function GET() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const events = await prisma.hotmartEvent.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, hotmartEventId: true, event: true, productId: true, transaction: true, email: true, result: true, detail: true, dealId: true, createdAt: true },
  });
  return NextResponse.json({ events: events.map(({ hotmartEventId, ...e }) => ({ ...e, imported: hotmartEventId.startsWith(IMPORT_PREFIX) })) });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await request.json().catch(() => ({}));
  const ev = typeof id === "string" ? await prisma.hotmartEvent.findFirst({ where: { id, orgId: ctx.orgId } }) : null;
  const c = await getConnection(ctx.orgId);
  if (!ev || !c) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  // Evento da importação reprocessa como na importação: sem automação, webhook de saída nem sale.*.
  const imported = ev.hotmartEventId.startsWith(IMPORT_PREFIX);
  const apply = () => applyEvent(ctx.orgId, c.products as unknown as Products, ev.payload, c.fields as FieldMap, imported ? { origin: "importacao" } : {});
  const r = imported ? await comAtor({ tipo: "integracao", teste: true }, apply) : await apply();
  await prisma.hotmartEvent.update({
    where: { id: ev.id },
    data: { result: r.result, detail: r.detail ?? null, contactId: r.contactId ?? null, dealId: r.dealId ?? null, processedAt: new Date() },
  });
  return NextResponse.json(r);
}
