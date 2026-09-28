import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { buildSegmentWhere, parseRules, type SegmentRule } from "@/lib/server/segments";
import type { Prisma } from "@/generated/prisma/client";

// Cada segmento volta com quantas pessoas ele pega AGORA: é o número que
// decide se a régua ou o disparo vale a pena, e calcular no servidor evita a
// tela ter que refazer a lógica de regra em JavaScript.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const segments = await prisma.segment.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
  });

  const withCounts = await Promise.all(
    segments.map(async (s) => ({
      id: s.id,
      name: s.name,
      match: s.match,
      rules: parseRules(s.rules),
      contactCount: await prisma.contact.count({
        where: buildSegmentWhere(ctx.orgId, s.match, parseRules(s.rules)),
      }),
      createdAt: s.createdAt.toISOString(),
    }))
  );

  return NextResponse.json({ segments: withCounts });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome do segmento é obrigatório." }, { status: 400 });

  const rules: SegmentRule[] = parseRules(body.rules);
  const match = body.match === "any" ? "any" : "all";

  const segment = await prisma.segment.create({
    data: { orgId: ctx.orgId, name, match, rules: rules as unknown as Prisma.InputJsonValue },
  });

  const contactCount = await prisma.contact.count({ where: buildSegmentWhere(ctx.orgId, match, rules) });

  return NextResponse.json({
    segment: { id: segment.id, name, match, rules, contactCount, createdAt: segment.createdAt.toISOString() },
  });
}
