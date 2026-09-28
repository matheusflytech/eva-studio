import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { enrollContact } from "@/lib/server/sequences";

interface StepInput {
  order?: number;
  delayMinutes?: number;
  text?: string;
  templateId?: string | null;
  applyTagId?: string | null;
}

async function loadSequence(agentId: string, sequenceId: string, orgId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return null;
  return prisma.sequence.findFirst({
    where: { id: sequenceId, agentId },
    include: { steps: { orderBy: { order: "asc" } } },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string; sequenceId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, sequenceId } = await params;

  const sequence = await loadSequence(agentId, sequenceId, ctx.orgId);
  if (!sequence) return NextResponse.json({ error: "Sequência não encontrada." }, { status: 404 });

  const enrollments = await prisma.sequenceEnrollment.findMany({
    where: { sequenceId },
    include: { contact: { select: { id: true, name: true, phone: true, email: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    sequence: {
      id: sequence.id,
      name: sequence.name,
      channel: sequence.channel,
      active: sequence.active,
      trigger: sequence.trigger,
      triggerTagId: sequence.triggerTagId,
      triggerSegmentId: sequence.triggerSegmentId,
      allowReentry: sequence.allowReentry,
      stopOnReply: sequence.stopOnReply,
      steps: sequence.steps,
    },
    enrollments: enrollments.map((e) => ({
      id: e.id,
      contact: e.contact,
      currentStep: e.currentStep,
      status: e.status,
      stoppedReason: e.stoppedReason,
      nextRunAt: e.nextRunAt.toISOString(),
    })),
  });
}

/**
 * PATCH faz três coisas, conforme o corpo:
 *   - campos da régua (nome, canal, gatilho, active, ...)
 *   - `steps`: substitui a régua inteira (mais simples e previsível que
 *     diferenciar passo a passo, e a régua é pequena por natureza)
 *   - `enrollContactIds`: inscreve gente à mão
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ agentId: string; sequenceId: string }> }) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, sequenceId } = await params;

  const sequence = await loadSequence(agentId, sequenceId, ctx.orgId);
  if (!sequence) return NextResponse.json({ error: "Sequência não encontrada." }, { status: 404 });

  const body = await request.json();

  if (Array.isArray(body.steps)) {
    const steps: StepInput[] = body.steps;
    const cleaned = steps
      .map((s, i) => ({
        order: i + 1,
        delayMinutes: Math.max(0, Number(s.delayMinutes ?? 60) || 0),
        text: String(s.text ?? "").trim(),
        templateId: s.templateId || null,
        applyTagId: s.applyTagId || null,
      }))
      .filter((s) => s.text.length > 0);

    await prisma.$transaction([
      prisma.sequenceStep.deleteMany({ where: { sequenceId } }),
      prisma.sequenceStep.createMany({ data: cleaned.map((s) => ({ ...s, sequenceId })) }),
    ]);
  }

  // Ligar uma régua sem passo nenhum não faz nada além de confundir.
  if (body.active === true) {
    const stepCount = await prisma.sequenceStep.count({ where: { sequenceId } });
    if (stepCount === 0) {
      return NextResponse.json({ error: "Adicione pelo menos um passo antes de ativar a sequência." }, { status: 400 });
    }
  }

  await prisma.sequence.update({
    where: { id: sequenceId },
    data: {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined,
      channel: typeof body.channel === "string" ? body.channel : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
      trigger: typeof body.trigger === "string" ? body.trigger : undefined,
      triggerTagId: body.triggerTagId !== undefined ? body.triggerTagId || null : undefined,
      triggerSegmentId: body.triggerSegmentId !== undefined ? body.triggerSegmentId || null : undefined,
      allowReentry: typeof body.allowReentry === "boolean" ? body.allowReentry : undefined,
      stopOnReply: typeof body.stopOnReply === "boolean" ? body.stopOnReply : undefined,
    },
  });

  let enrolled = 0;
  if (Array.isArray(body.enrollContactIds)) {
    for (const contactId of body.enrollContactIds) {
      const id = await enrollContact(sequenceId, String(contactId));
      if (id) enrolled += 1;
    }
  }

  return NextResponse.json({ ok: true, enrolled });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string; sequenceId: string }> }) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, sequenceId } = await params;

  const sequence = await loadSequence(agentId, sequenceId, ctx.orgId);
  if (!sequence) return NextResponse.json({ error: "Sequência não encontrada." }, { status: 404 });

  await prisma.sequence.delete({ where: { id: sequenceId } });
  return NextResponse.json({ ok: true });
}
