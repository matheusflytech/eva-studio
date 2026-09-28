import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { createDeal, ensureDefaultPipeline } from "@/lib/server/crm";

// Negócios de um funil, agrupados por etapa (o kanban lê isso direto).
//   ?pipeline=<id>  padrão: o funil padrão da org
//   ?archived=1     inclui arquivados
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const requested = url.searchParams.get("pipeline")?.trim() ?? "";
  const includeArchived = url.searchParams.get("archived") === "1";

  const pipeline = requested
    ? await prisma.pipeline.findFirst({
        where: { id: requested, orgId: ctx.orgId },
        include: { stages: { orderBy: { position: "asc" } } },
      })
    : await ensureDefaultPipeline(ctx.orgId);

  if (!pipeline) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });

  const deals = await prisma.deal.findMany({
    where: {
      orgId: ctx.orgId,
      pipelineId: pipeline.id,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      contacts: { include: { contact: { select: { id: true, name: true } } } },
      _count: { select: { tasks: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });

  // Total ponderado por etapa: é o número que a pessoa olha para saber se o
  // mês fecha. Valor bruto sozinho engana, porque trata "Novo" como se
  // valesse o mesmo que "Negociação".
  const stages = pipeline.stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stageId === stage.id);
    return {
      id: stage.id,
      name: stage.name,
      type: stage.type,
      probability: stage.probability,
      totalCents: stageDeals.reduce((sum, d) => sum + d.amountCents, 0),
      weightedCents: stageDeals.reduce((sum, d) => sum + Math.round((d.amountCents * d.probability) / 100), 0),
      deals: stageDeals.map((d) => ({
        id: d.id,
        name: d.name,
        amountCents: d.amountCents,
        currency: d.currency,
        probability: d.probability,
        company: d.company,
        owner: d.owner,
        contacts: d.contacts.map((c) => c.contact),
        openTasks: d._count.tasks,
        expectedClosingAt: d.expectedClosingAt?.toISOString() ?? null,
        closedAt: d.closedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  });

  return NextResponse.json({
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages,
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome do negócio é obrigatório." }, { status: 400 });

  const deal = await createDeal({
    orgId: ctx.orgId,
    name,
    pipelineId: body.pipelineId || undefined,
    stageId: body.stageId || undefined,
    contactId: body.contactId || null,
    companyId: body.companyId || null,
    ownerId: body.ownerId || ctx.userId,
    amountCents: Math.round(Number(body.amount ?? 0) * 100),
    description: String(body.description ?? ""),
    expectedClosingAt: body.expectedClosingAt ? new Date(body.expectedClosingAt) : null,
  });

  return NextResponse.json({ deal: { id: deal.id, name: deal.name } });
}
