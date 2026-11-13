import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { qrConectado } from "@/lib/server/canais/qr";
import { requirePermission } from "@/lib/server/permissions";
import { alcanceDoCanal, runBroadcast } from "@/lib/server/broadcast-runner";
import { primeiroNome, telefonesPossiveis } from "@/lib/disparos/personalizar";
import { chaveDoDestino } from "@/lib/disparos/reenvio";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import { validarHorario } from "@/lib/server/agendamento";
import { jidDoWhatsApp } from "@/lib/telefone";
import { caminhoDaOrg } from "@/lib/server/storage";
import { ehTabelaAusente } from "@/lib/server/contratos";
import type { Prisma } from "@/generated/prisma/client";

// Canais que aceitam disparo. Instagram fica de fora de propósito: a Meta
// encerrou as message tags do Instagram, sobrou só HUMAN_AGENT (que é
// proibida pra mensagem automatizada), então fora da janela de 24h não existe
// disparo legítimo por lá — oferecer o botão seria vender erro 100.
const BROADCAST_CHANNELS = new Set(["whatsapp_qr", "whatsapp_meta", "telegram", "email"]);

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
      // Mensagem avulsa agendada (kind "single") aparece na conversa/ficha, não aqui.
      where: { agentId, kind: "campaign" },
      include: { variants: true, segment: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.tag.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.segment.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({
    groups: await gruposDoAgente(agent.id, ctx.orgId),
    channels: {
      whatsapp_qr: await qrConectado(agent.id, agent.whatsappConnection),
      whatsapp_meta: !!agent.metaConnection,
      telegram: !!agent.telegramConnection,
      // E-mail: domínio do contrato verificado (não depende do agente).
      email: await prisma.emailDominio
        .findUnique({ where: { orgId: ctx.orgId }, select: { status: true } })
        .then((d) => d?.status === "verified")
        .catch(() => false),
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
      deliveredCount: b.deliveredCount,
      readCount: b.readCount,
      status: b.status,
      lastError: b.lastError,
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

// Grupos do número (WhatsApp via QR) ligado ao agente: viram destino do disparo (jid @g.us).
async function gruposDoAgente(agentId: string, orgId: string) {
  try {
    const canal = await prisma.canal.findFirst({ where: { agentId, orgId, tipo: "whatsapp_qr" }, select: { id: true } });
    if (!canal) return [];
    return await prisma.whatsAppGroup.findMany({
      where: { channelId: canal.id, orgId, present: true },
      orderBy: { subject: "asc" },
      select: { jid: true, subject: true, participantsCount: true },
      take: 500,
    });
  } catch (e) {
    if (ehTabelaAusente(e)) return []; // sem o SQL 2026-11-07
    throw e;
  }
}

const TIPOS_DE_MIDIA = new Set(["image", "video", "document"]);

/**
 * Nome digitado na lista ("5511999998888 Maria") vai para a ficha do contato
 * (acha pelo telefone; cria se não existe), e o {firstname} do disparo sai dele.
 */
async function guardarNomes(orgId: string, nomes: unknown) {
  if (!nomes || typeof nomes !== "object") return;
  const pares = Object.entries(nomes as Record<string, unknown>)
    .map(([numero, nome]) => ({ jid: jidDoWhatsApp(numero), nome: String(nome ?? "").trim().slice(0, 120) }))
    .filter((p): p is { jid: string; nome: string } => !!p.jid && !p.jid.endsWith("@g.us") && !!primeiroNome(p.nome))
    .slice(0, 5000);
  if (!pares.length) return;
  const fichas = await prisma.contact.findMany({
    where: { orgId, phone: { in: [...new Set(pares.flatMap((p) => telefonesPossiveis(p.jid)))] } },
    select: { id: true, phone: true },
  });
  const porChave = new Map(fichas.map((c) => [chaveDoDestino(c.phone), c.id]));
  const novos: { orgId: string; name: string; phone: string; source: string }[] = [];
  for (const p of pares) {
    const chave = chaveDoDestino(p.jid);
    const id = porChave.get(chave);
    if (id) await prisma.contact.update({ where: { id }, data: { name: p.nome } });
    else if (!novos.some((n) => chaveDoDestino(n.phone) === chave)) novos.push({ orgId, name: p.nome, phone: p.jid.split("@")[0], source: "disparo" });
  }
  if (novos.length) await prisma.contact.createMany({ data: novos });
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

  // Arquivo (só WhatsApp via QR): caminho do upload já feito em /api/conversations/upload.
  const m = body.media && typeof body.media === "object" ? body.media : null;
  const media = m
    ? { mediaPath: String(m.path ?? ""), mediaType: String(m.type ?? ""), mediaMime: String(m.mime ?? "").slice(0, 120), mediaName: String(m.name ?? "").slice(0, 200) || null }
    : null;
  if (media) {
    if (channel !== "whatsapp_qr") return NextResponse.json({ error: "Imagem no disparo só no WhatsApp via QR." }, { status: 400 });
    if (!caminhoDaOrg(media.mediaPath, ctx.orgId) || !TIPOS_DE_MIDIA.has(media.mediaType)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
    }
  }

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

  if (!hasAbTest && !text && !templateId && !media) {
    return NextResponse.json({ error: "Escreva a mensagem ou escolha um modelo." }, { status: 400 });
  }

  // E-mail: cada variante (ou o disparo) é um modelo de e-mail do contrato.
  if (channel === "email") {
    const ids = hasAbTest ? variants.map((v) => v.templateId) : [templateId];
    if (ids.some((id) => !id)) {
      return NextResponse.json({ error: "Disparo de e-mail precisa de um modelo de e-mail (em cada variante, se for teste A/B)." }, { status: 400 });
    }
    const unicos = [...new Set(ids as string[])];
    const achados = await prisma.emailModelo.count({ where: { orgId: ctx.orgId, id: { in: unicos } } }).catch(() => -1);
    if (achados === -1) {
      return NextResponse.json({ error: "O e-mail ainda não foi ativado no banco deste ambiente (SQL 2026-10-22-email.sql)." }, { status: 409 });
    }
    if (achados !== unicos.length) return NextResponse.json({ error: "Modelo de e-mail não encontrado neste contrato." }, { status: 404 });
    const dominio = await prisma.emailDominio.findUnique({ where: { orgId: ctx.orgId } }).catch(() => null);
    if (dominio?.status !== "verified") {
      return NextResponse.json({ error: "Verifique o domínio de e-mail do contrato em Integrações → E-mail antes de disparar." }, { status: 400 });
    }
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

  // No e-mail o público é quem tem e-mail (não um canal de conversa do agente).
  const alcance = channel === "email" ? { email: { not: "" } } : alcanceDoCanal(agentId, channel);

  if (audience === "manual") {
    manualRecipients = Array.isArray(body.contactIds)
      ? body.contactIds.map(String).map((c: string) => c.trim()).filter(Boolean)
      : [];
    if (channel === "email") {
      const invalidos = manualRecipients.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
      if (invalidos.length) return NextResponse.json({ error: `E-mail inválido: ${invalidos.slice(0, 3).join(", ")}` }, { status: 400 });
    }
    if (channel === "whatsapp_qr") {
      const jids = manualRecipients.map(jidDoWhatsApp);
      const invalidos = manualRecipients.filter((_, i) => !jids[i]);
      if (invalidos.length) return NextResponse.json({ error: `Número inválido: ${invalidos.slice(0, 3).join(", ")}` }, { status: 400 });
      manualRecipients = [...new Set(jids as string[])];
      await guardarNomes(ctx.orgId, body.names);
    }
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
        ...alcance,
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
          { optIn: true, ...alcance },
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
  // A tela manda o instante já convertido do horário de São Paulo (ISO com Z).
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt) {
    const problema = validarHorario(scheduledAt);
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });
  }
  const isScheduled = !!scheduledAt;

  let resolvedText = text;
  if (channel === "email" && templateId) {
    const modelo = await prisma.emailModelo.findFirst({ where: { id: templateId, orgId: ctx.orgId }, select: { nome: true } });
    resolvedText = resolvedText || `E-mail: ${modelo?.nome ?? ""}`;
  } else if (!resolvedText && templateId) {
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
      ...(media ?? {}),
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
