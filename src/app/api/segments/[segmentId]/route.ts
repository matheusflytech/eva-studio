import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import { serializeContact } from "@/lib/server/contact-dto";
import type { Prisma } from "@/generated/prisma/client";

// GET devolve também uma amostra de quem cai no segmento: prévia de verdade
// antes de disparar, em vez de confiar só no número.
export async function GET(_request: Request, { params }: { params: Promise<{ segmentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { segmentId } = await params;

  const segment = await prisma.segment.findFirst({ where: { id: segmentId, orgId: ctx.orgId } });
  if (!segment) return NextResponse.json({ error: "Segmento não encontrado." }, { status: 404 });

  const rules = parseRules(segment.rules);
  const where = buildSegmentWhere(ctx.orgId, segment.match, rules);

  const [contactCount, sample] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        channels: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    segment: { id: segment.id, name: segment.name, match: segment.match, rules, contactCount },
    sample: sample.map(serializeContact),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ segmentId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { segmentId } = await params;

  const segment = await prisma.segment.findFirst({ where: { id: segmentId, orgId: ctx.orgId } });
  if (!segment) return NextResponse.json({ error: "Segmento não encontrado." }, { status: 404 });

  const body = await request.json();
  const rules = body.rules !== undefined ? parseRules(body.rules) : parseRules(segment.rules);
  const match = body.match === "any" ? "any" : body.match === "all" ? "all" : segment.match;

  const updated = await prisma.segment.update({
    where: { id: segment.id },
    data: {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : segment.name,
      match,
      rules: rules as unknown as Prisma.InputJsonValue,
    },
  });

  const contactCount = await prisma.contact.count({ where: buildSegmentWhere(ctx.orgId, match, rules) });

  return NextResponse.json({
    segment: { id: updated.id, name: updated.name, match: updated.match, rules, contactCount },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ segmentId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { segmentId } = await params;

  const segment = await prisma.segment.findFirst({ where: { id: segmentId, orgId: ctx.orgId } });
  if (!segment) return NextResponse.json({ error: "Segmento não encontrado." }, { status: 404 });

  await prisma.segment.delete({ where: { id: segment.id } });
  return NextResponse.json({ ok: true });
}
