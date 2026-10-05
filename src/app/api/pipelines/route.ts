import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { ensureDefaultPipeline } from "@/lib/server/crm";
import { MAX_ETAPAS, MAX_FUNIS, corValida, probabilidade, tipoValido } from "@/lib/server/funis";

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
      stages: { orderBy: { position: "asc" }, include: { _count: { select: { deals: true } } } },
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
        color: s.color,
        dealCount: s._count.deals,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Nome do funil é obrigatório." }, { status: 400 });

  const stages: { name: string; probability?: number; type?: string; color?: string }[] = Array.isArray(body.stages)
    ? body.stages
    : [];
  if (stages.length === 0) {
    return NextResponse.json({ error: "Um funil precisa de pelo menos uma etapa." }, { status: 400 });
  }

  if (stages.length > MAX_ETAPAS) {
    return NextResponse.json({ error: `O limite é de ${MAX_ETAPAS} etapas por funil.` }, { status: 400 });
  }

  const count = await prisma.pipeline.count({ where: { orgId: ctx.orgId } });
  if (count >= MAX_FUNIS) {
    return NextResponse.json({ error: `O limite é de ${MAX_FUNIS} funis.` }, { status: 400 });
  }

  const pipeline = await prisma.pipeline.create({
    data: {
      orgId: ctx.orgId,
      name,
      position: count,
      stages: {
        create: stages.map((s, i) => {
          const type = tipoValido(s.type);
          return {
            name: String(s.name ?? "").trim().slice(0, 40) || `Etapa ${i + 1}`,
            position: i,
            probability: probabilidade(s.probability, type),
            type,
            color: corValida((s as { color?: string }).color),
          };
        }),
      },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });

  return NextResponse.json({ pipeline });
}
