import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { ehTabelaAusente } from "@/lib/server/contratos";

// Estado da sessão do WhatsApp por QR de um canal do contrato (a tela lê a
// cada poucos segundos enquanto o QR está na tela).

// Colunas do SQL 2026-11-07 (pareamento por código e histórico de quedas): sem o
// SQL rodado a leitura cai para o que existia antes, em vez de dar erro.
async function lerSessao(canalId: string) {
  const antigas = { status: true, qrDataUrl: true, phoneNumber: true, lastError: true, updatedAt: true } as const;
  try {
    const s = await prisma.canalWhatsAppQr.findUnique({
      where: { canalId },
      select: { ...antigas, pairingCode: true, pairingPhone: true, reconnectAttempts: true, lastConnectedAt: true, lastDisconnectedAt: true },
    });
    return s;
  } catch (e) {
    if (!ehTabelaAusente(e)) throw e;
    const s = await prisma.canalWhatsAppQr.findUnique({ where: { canalId }, select: antigas });
    return s ? { ...s, pairingCode: null, pairingPhone: null, reconnectAttempts: 0, lastConnectedAt: null, lastDisconnectedAt: null } : null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { canalId } = await params;

  const canal = await prisma.canal.findFirst({ where: { id: canalId, orgId: ctx.orgId, tipo: "whatsapp_qr" }, select: { id: true } });
  if (!canal) return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });
  const s = await lerSessao(canalId);
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
          pairingCode: s.pairingCode,
          pairingPhone: s.pairingPhone,
          reconnectAttempts: s.reconnectAttempts,
          lastConnectedAt: s.lastConnectedAt?.toISOString() ?? null,
          lastDisconnectedAt: s.lastDisconnectedAt?.toISOString() ?? null,
          atualizadoEm: s.updatedAt.toISOString(),
          idadeMs: Date.now() - s.updatedAt.getTime(),
        }
      : {
          status: "disconnected",
          qrDataUrl: null,
          phoneNumber: null,
          lastError: null,
          pairingCode: null,
          pairingPhone: null,
          reconnectAttempts: 0,
          lastConnectedAt: null,
          lastDisconnectedAt: null,
          atualizadoEm: null,
          idadeMs: null,
        },
  });
}

/** Número para parear por código: só dígitos, com DDI (10 a 15). Vazio/null = voltar ao QR. */
function numeroDePareamento(bruto: unknown): { ok: true; numero: string | null } | { ok: false } {
  if (bruto === undefined || bruto === null || bruto === "") return { ok: true, numero: null };
  const numero = String(bruto).replace(/\D/g, "");
  return numero.length >= 10 && numero.length <= 15 ? { ok: true, numero } : { ok: false };
}

// Pede de novo a sessão (QR expirou ou caiu). Com `pairingPhone` no corpo, pede o
// código de 8 dígitos desse número em vez do QR; sem ele, volta ao QR.
export async function POST(request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { canalId } = await params;
  const canal = await prisma.canal.findFirst({ where: { id: canalId, orgId: ctx.orgId, tipo: "whatsapp_qr" }, select: { id: true } });
  if (!canal) return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });

  const corpo = (await request.json().catch(() => ({}))) as { pairingPhone?: unknown };
  const pareamento = numeroDePareamento(corpo?.pairingPhone);
  if (!pareamento.ok) return NextResponse.json({ error: "Número inválido. Informe com DDI e DDD, só dígitos (ex.: 5511999990001)." }, { status: 400 });

  try {
    await prisma.canalWhatsAppQr.upsert({
      where: { canalId },
      // O QR (e o código) antigo sai junto: com o worker fora, ele voltaria para a tela como se fosse novo.
      create: { canalId, status: "requesting", qrDataUrl: null, pairingPhone: pareamento.numero, pairingCode: null },
      update: { status: "requesting", lastError: null, qrDataUrl: null, pairingPhone: pareamento.numero, pairingCode: null },
      select: { canalId: true },
    });
  } catch (e) {
    if (!ehTabelaAusente(e)) throw e;
    // Sem o SQL 2026-11-07 não há pareamento por código: o QR continua funcionando.
    if (pareamento.numero) {
      return NextResponse.json({ error: "O pareamento por código ainda não foi ativado no banco deste ambiente (SQL 2026-11-07). Use o QR code." }, { status: 409 });
    }
    await prisma.canalWhatsAppQr.upsert({
      where: { canalId },
      create: { canalId, status: "requesting", qrDataUrl: null },
      update: { status: "requesting", lastError: null, qrDataUrl: null },
      select: { canalId: true },
    });
  }
  return NextResponse.json({ ok: true });
}
