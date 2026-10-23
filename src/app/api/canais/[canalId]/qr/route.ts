import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";

// Estado da sessão do WhatsApp por QR de um canal do contrato (a tela lê a
// cada poucos segundos enquanto o QR está na tela).
export async function GET(_request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { canalId } = await params;

  const canal = await prisma.canal.findFirst({ where: { id: canalId, orgId: ctx.orgId, tipo: "whatsapp_qr" }, select: { id: true } });
  if (!canal) return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });
  const s = await prisma.canalWhatsAppQr.findUnique({
    where: { canalId },
    select: { status: true, qrDataUrl: true, phoneNumber: true, lastError: true, updatedAt: true },
  });
  // updatedAt: quando o worker mexeu na sessão pela última vez. Esperando QR há
  // minutos sem mudança = worker parado (a tela avisa em vez de mostrar QR velho).
  // A idade vai calculada aqui: com o relógio do navegador adiantado ou
  // atrasado, a conta do lado da tela erra.
  return NextResponse.json({
    connection: s
      ? {
          status: s.status,
          qrDataUrl: s.qrDataUrl,
          phoneNumber: s.phoneNumber,
          lastError: s.lastError,
          atualizadoEm: s.updatedAt.toISOString(),
          idadeMs: Date.now() - s.updatedAt.getTime(),
        }
      : { status: "disconnected", qrDataUrl: null, phoneNumber: null, lastError: null, atualizadoEm: null, idadeMs: null },
  });
}

// Pede de novo a sessão (QR expirou ou caiu).
export async function POST(_request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { canalId } = await params;
  const canal = await prisma.canal.findFirst({ where: { id: canalId, orgId: ctx.orgId, tipo: "whatsapp_qr" }, select: { id: true } });
  if (!canal) return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });
  await prisma.canalWhatsAppQr.upsert({
    where: { canalId },
    // O QR antigo sai junto: com o worker fora, ele voltaria para a tela como se fosse novo.
    create: { canalId, status: "requesting", qrDataUrl: null },
    update: { status: "requesting", lastError: null, qrDataUrl: null },
  });
  return NextResponse.json({ ok: true });
}
