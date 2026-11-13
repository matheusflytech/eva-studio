import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { qrConectado } from "@/lib/server/canais/qr";
import { runBroadcast } from "@/lib/server/broadcast-runner";
import { quemReenviar } from "@/lib/disparos/reenvio";
import type { Prisma } from "@/generated/prisma/client";

// Reenvia por outro chip (agente) quem não recebeu este disparo — ex.: o chip
// caiu no meio. Nunca manda de novo para quem já recebeu ou já está na fila em
// qualquer disparo do contrato. Body: { targetAgentId }.
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string; broadcastId: string }> }) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, broadcastId } = await params;

  const origem = await prisma.broadcast.findFirst({
    where: { id: broadcastId, agentId, agent: { orgId: ctx.orgId } },
  });
  if (!origem) return NextResponse.json({ error: "Disparo não encontrado." }, { status: 404 });
  if (origem.channel !== "whatsapp_qr") return NextResponse.json({ error: "Reenvio só no WhatsApp via QR." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const targetAgentId = String(body.targetAgentId ?? "");
  const alvo = await prisma.agent.findFirst({ where: { id: targetAgentId, orgId: ctx.orgId }, include: { whatsappConnection: true } });
  if (!alvo) return NextResponse.json({ error: "Escolha o chip que vai reenviar." }, { status: 400 });
  if (!(await qrConectado(alvo.id, alvo.whatsappConnection))) {
    return NextResponse.json({ error: "Esse chip não está conectado. Conecte o QR Code antes de reenviar." }, { status: 400 });
  }

  const [falhos, cobertos] = await Promise.all([
    prisma.outboundQueueItem.findMany({ where: { broadcastId, status: "failed" }, select: { contactId: true, error: true } }),
    // Já recebeu ou ainda vai receber (fila de disparo não cancelado), em qualquer disparo do contrato.
    prisma.outboundQueueItem.findMany({
      where: {
        broadcast: { channel: "whatsapp_qr", agent: { orgId: ctx.orgId } },
        OR: [{ status: "sent" }, { status: { in: ["pending", "sending"] }, broadcast: { status: { not: "canceled" } } }],
      },
      select: { contactId: true },
    }),
  ]);

  const { destinos, semWhatsApp, jaReceberam } = quemReenviar(falhos, cobertos.map((c) => c.contactId));
  if (destinos.length === 0) {
    return NextResponse.json({ ok: true, reenviados: 0, semWhatsApp, jaReceberam });
  }

  const novo = await prisma.broadcast.create({
    data: {
      agentId: alvo.id,
      name: `${origem.name?.trim() || origem.text.trim().split("\n")[0].slice(0, 80)} · reenvio`,
      channel: "whatsapp_qr",
      text: origem.text,
      audience: "manual",
      manualRecipients: destinos as unknown as Prisma.InputJsonValue,
      totalCount: destinos.length,
      status: "sending",
      mediaPath: origem.mediaPath,
      mediaType: origem.mediaType,
      mediaMime: origem.mediaMime,
      mediaName: origem.mediaName,
    },
  });
  const result = await runBroadcast(novo.id);
  return NextResponse.json({ ok: true, broadcastId: novo.id, agentId: alvo.id, reenviados: destinos.length, semWhatsApp, jaReceberam, ...result });
}
