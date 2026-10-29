import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { parseSpend } from "@/lib/server/marketing-input";

// Investimento lançado à mão (fonte, campanha, período, valor). O GET também
// devolve as fontes/campanhas já vistas nos toques, para o nome casar com a UTM.
export async function GET() {
  const ctx = await requirePermission("marketing:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const [spends, seen] = await Promise.all([
    prisma.marketingSpend.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ from: "desc" }, { createdAt: "desc" }], take: 500 }),
    prisma.touchpoint.groupBy({ by: ["utmSource", "utmCampaign"], where: { orgId: ctx.orgId, utmSource: { not: null } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 200 }),
  ]);
  return NextResponse.json({
    spends: spends.map((s) => ({ ...s, from: s.from.toISOString().slice(0, 10), to: s.to.toISOString().slice(0, 10) })),
    suggestions: seen.map((s) => ({ source: s.utmSource, campaign: s.utmCampaign ?? "" })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("marketing:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const r = parseSpend(await request.json().catch(() => ({})));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const spend = await prisma.marketingSpend.create({ data: { orgId: ctx.orgId, createdBy: ctx.userId, ...r } });
  return NextResponse.json({ id: spend.id }, { status: 201 });
}
