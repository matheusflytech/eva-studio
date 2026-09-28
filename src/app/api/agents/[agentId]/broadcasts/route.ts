import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { runBroadcast } from "@/lib/server/broadcast-runner";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import type { Prisma } from "@/generated/prisma/client";

// Canais que aceitam disparo. Instagram fica de fora de propósito: a Meta
// encerrou as message tags do Instagram, sobrou só HUMAN_AGENT (que é
// proibida pra mensagem automatizada), então fora da janela de 24h não existe
// disparo legítimo por lá — oferecer o botão seria vender erro 100.
const BROADCAST_CHANNELS = new Set(["whatsapp_qr", "whatsapp_meta", "telegram"]);

const MAX_META_RECIPIENTS = 200;

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId: ctx.orgId },
    include: { whatsappConnection: true, metaConnection: true, telegramConnection: true },
  });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const [broadcasts, tags, segments] = await Promise.all([
    prisma.broadcast.findMany({
      where: { agentId },
      include: { variants: true, segment: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.tag.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.segment.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({
    channels: {
      whatsapp_qr: agent.whatsappConnection?.status === "connected",
      whatsapp_meta: !!agent.metaConnection,
      telegram: !!agent.telegramConnection,
    },
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    segments: segments.map((s) => ({ id: s.id, name: s.name })),
    broadcasts: broadcasts.map((b) => ({
      id: b.id,
      channel: b.channel,
      text: b.text,
      audience: b.audience,
      segmentName: b.segment?.name ?? null,
      totalCount: b.totalCount,
      sentCount: b.sentCount,
      failedCount: b.failedCount,
      status: b.status,
      scheduledAt: b.scheduledAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      variants: b.variants.map((v) => ({
        id: v.id,
        label: v.label,
        text: v.text,
        weight: v.weight,
        sentCount: v.sentCount,
        failedCount: v.failedCount,
        replyCount: v.replyCount,
      })),
    })),
  });
}

interface VariantInput {
  label?: string;
  text?: string;
  templateId?: string | null;
  weight?: number;
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId: ctx.orgId },
    include: { metaConnection: true, telegramConnection: true },
  });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const body = await request.json();
  const channel = String(body.channel ?? "");
  const audience = ["manual", "tags", "segment"].includes(body.audience) ? body.audience : "manual";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const templateId = body.templateId || null;

  if (!BROADCAST_CHANNELS.has(channel)) {
    return NextResponse.json({ error: "Canal inválido para disparo." }, { status: 400 });
  }
  if (channel === "whatsapp_meta" && !agent.metaConnection) {
    return NextResponse.json({ error: "Agente sem conexão WhatsApp oficial." }, { status: 400 });
  }
  if (channel === "telegram" && !agent.telegramConnection) {
    return NextResponse.json({ error: "Agente sem bot do Telegram configurado." }, { status: 400 });
  }

  // Variantes do teste A/B. Uma variante só não é teste — ou tem duas, ou
  // não tem nenhuma e vale o texto do disparo.
  const rawVariants: VariantInput[] = Array.isArray(body.variants) ? body.variants : [];
  const variants = rawVariants
    .map((v, i) => ({
      label: String(v.label ?? String.fromCharCode(65 + i)).slice(0, 8),
      text: String(v.text ?? "").trim(),
      templateId: v.templateId || null,
      weight: Math.max(1, Number(v.weight ?? 1) || 1),
    }))
    .filter((v) => v.text.length > 0 || v.templateId);
  const hasAbTest = variants.length >= 2;

  if (!hasAbTest && !text && !templateId) {
    return NextResponse.json({ error: "Escreva a mensagem ou escolha um modelo." }, { status: 400 });
  }

  // WhatsApp oficial: fora da janela de 24h só passa modelo aprovado, e um
  // disparo é, por definição, fora da janela pra quase todo mundo da lista.
  if (channel === "whatsapp_meta") {
    const missingTemplate = hasAbTest ? variants.some((v) => !v.templateId) : !templateId;
    if (missingTemplate) {
      return NextResponse.json(
        { error: "Disparo pro WhatsApp oficial precisa de um modelo aprovado (em cada variante, se for teste A/B)." },
        { status: 400 }
      );
    }
  }

  // Público
  let manualRecipients: string[] = [];
  let tagIds: string[] = [];
  let segmentId: string | null = null;
  let estimatedCount = 0;

  if (audience === "manual") {
    manualRecipients = Array.isArray(body.contactIds)
      ? body.contactIds.map(String).map((c: string) => c.trim()).filter(Boolean)
      : [];
    if (manualRecipients.length === 0) {
      return NextResponse.json({ error: "Informe pelo menos um contato." }, { status: 400 });
    }
    estimatedCount = manualRecipients.length;
  } else if (audience === "tags") {
    tagIds = Array.isArray(body.tagIds) ? body.tagIds.map(String).filter(Boolean) : [];
    if (tagIds.length === 0) return NextResponse.json({ error: "Escolha pelo menos uma etiqueta." }, { status: 400 });
    estimatedCount = await prisma.contact.count({
      where: {
        orgId: ctx.orgId,
        optIn: true,
        tags: { some: { tagId: { in: tagIds } } },
        channels: { some: { agentId, channel } },
      },
    });
  } else {
    segmentId = String(body.segmentId ?? "") || null;
    if (!segmentId) return NextResponse.json({ error: "Escolha um segmento." }, { status: 400 });
    const segment = await prisma.segment.findFirst({ where: { id: segmentId, orgId: ctx.orgId } });
    if (!segment) return NextResponse.json({ error: "Segmento não encontrado." }, { status: 404 });
    estimatedCount = await prisma.contact.count({
      where: {
        AND: [
          buildSegmentWhere(ctx.orgId, segment.match, parseRules(segment.rules)),
          { optIn: true, channels: { some: { agentId, channel } } },
        ],
      },
    });
  }

  if (estimatedCount === 0) {
    return NextResponse.json({ error: "Esse público não tem nenhum contato com opt-in nesse canal." }, { status: 400 });
  }
  if (channel === "whatsapp_meta" && estimatedCount > MAX_META_RECIPIENTS) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_META_RECIPIENTS} contatos por disparo no canal oficial. Estreite o público ou agende em lotes.` },
      { status: 400 }
    );
  }

  // Agendamento
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Data de agendamento inválida." }, { status: 400 });
  }
  const isScheduled = !!scheduledAt && scheduledAt.getTime() > Date.now();

  let resolvedText = text;
  if (!resolvedText && templateId) {
    const template = await prisma.messageTemplate.findFirst({ where: { id: templateId, agentId } });
    resolvedText = template?.bodyText ?? "";
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      agentId,
      channel,
      text: resolvedText,
      templateId,
      audience,
      segmentId,
      tagIds: tagIds as unknown as Prisma.InputJsonValue,
      manualRecipients: manualRecipients as unknown as Prisma.InputJsonValue,
      scheduledAt: scheduledAt ?? null,
      totalCount: estimatedCount,
      status: isScheduled ? "scheduled" : "sending",
      variants: hasAbTest ? { create: variants } : undefined,
    },
  });

  if (isScheduled) {
    return NextResponse.json({
      ok: true,
      broadcastId: broadcast.id,
      scheduled: true,
      scheduledAt: scheduledAt!.toISOString(),
      estimatedCount,
    });
  }

  const result = await runBroadcast(broadcast.id);
  return NextResponse.json({ ok: true, broadcastId: broadcast.id, ...result });
}
