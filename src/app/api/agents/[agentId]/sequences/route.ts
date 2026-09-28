import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

const VALID_TRIGGERS = new Set(["tag", "segment", "stage", "manual"]);
const VALID_CHANNELS = new Set(["whatsapp_meta", "whatsapp_qr", "instagram", "telegram"]);

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const sequences = await prisma.sequence.findMany({
    where: { agentId },
    include: {
      steps: { orderBy: { order: "asc" } },
      triggerTag: { select: { id: true, name: true } },
      triggerSegment: { select: { id: true, name: true } },
      triggerStage: { select: { id: true, name: true, pipeline: { select: { name: true } } } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Quantos estão ativos agora por régua — o número que diz se ela está
  // rodando de verdade ou só existe.
  const activeCounts = await prisma.sequenceEnrollment.groupBy({
    by: ["sequenceId"],
    where: { sequenceId: { in: sequences.map((s) => s.id) }, status: "active" },
    _count: { _all: true },
  });
  const activeBySequence = new Map(activeCounts.map((a) => [a.sequenceId, a._count._all]));

  return NextResponse.json({
    sequences: sequences.map((s) => ({
      id: s.id,
      name: s.name,
      channel: s.channel,
      active: s.active,
      trigger: s.trigger,
      triggerTag: s.triggerTag,
      triggerSegment: s.triggerSegment,
      triggerStage: s.triggerStage
        ? { id: s.triggerStage.id, name: s.triggerStage.name, pipeline: s.triggerStage.pipeline.name }
        : null,
      triggerStageDays: s.triggerStageDays,
      allowReentry: s.allowReentry,
      stopOnReply: s.stopOnReply,
      totalEnrollments: s._count.enrollments,
      activeEnrollments: activeBySequence.get(s.id) ?? 0,
      steps: s.steps.map((st) => ({
        id: st.id,
        order: st.order,
        delayMinutes: st.delayMinutes,
        text: st.text,
        templateId: st.templateId,
        applyTagId: st.applyTagId,
      })),
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome da sequência é obrigatório." }, { status: 400 });

  const channel = VALID_CHANNELS.has(body.channel) ? body.channel : "whatsapp_meta";
  const trigger = VALID_TRIGGERS.has(body.trigger) ? body.trigger : "manual";

  const sequence = await prisma.sequence.create({
    data: {
      agentId,
      name,
      channel,
      trigger,
      triggerTagId: trigger === "tag" ? body.triggerTagId ?? null : null,
      triggerSegmentId: trigger === "segment" ? body.triggerSegmentId ?? null : null,
      triggerStageId: trigger === "stage" ? body.triggerStageId ?? null : null,
      triggerStageDays: trigger === "stage" ? Math.max(0, Number(body.triggerStageDays ?? 0) || 0) : 0,
      allowReentry: body.allowReentry === true,
      stopOnReply: body.stopOnReply !== false,
      // Nasce desligada de propósito: uma régua sem passo nenhum que já sai
      // ligada é o jeito mais fácil de assustar quem está montando.
      active: false,
    },
  });

  return NextResponse.json({ sequence: { id: sequence.id, name: sequence.name } });
}
