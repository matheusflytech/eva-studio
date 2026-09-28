import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { ensureDefaultPipeline } from "@/lib/server/crm";

// Funis da organização. O GET cria o funil padrão na primeira visita, em vez
// de exigir configuração antes de qualquer coisa funcionar — é o que permite
// o bloco "Criar negócio" do Builder rodar sem ninguém ter configurado nada.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  await ensureDefaultPipeline(ctx.orgId);

  const pipelines = await prisma.pipeline.findMany({
    where: { orgId: ctx.orgId },
    include: {
      stages: { orderBy: { position: "asc" } },
      _count: { select: { deals: true } },
    },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });

  return NextResponse.json({
    pipelines: pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      dealCount: p._count.deals,
      stages: p.stages.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        probability: s.probability,
        type: s.type,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome do funil é obrigatório." }, { status: 400 });

  const stages: { name: string; probability?: number; type?: string }[] = Array.isArray(body.stages)
    ? body.stages
    : [];
  if (stages.length === 0) {
    return NextResponse.json({ error: "Um funil precisa de pelo menos uma etapa." }, { status: 400 });
  }

  const count = await prisma.pipeline.count({ where: { orgId: ctx.orgId } });

  const pipeline = await prisma.pipeline.create({
    data: {
      orgId: ctx.orgId,
      name,
      position: count,
      stages: {
        create: stages.map((s, i) => ({
          name: String(s.name ?? `Etapa ${i + 1}`),
          position: i,
          probability: Math.min(100, Math.max(0, Number(s.probability ?? 0) || 0)),
          type: ["open", "won", "lost"].includes(String(s.type)) ? String(s.type) : "open",
        })),
      },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });

  return NextResponse.json({ pipeline });
}
