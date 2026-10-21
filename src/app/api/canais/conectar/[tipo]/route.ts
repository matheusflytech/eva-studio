import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import {
  conectarMessenger,
  conectarTelegram,
  conectarTikTok,
  conectarWhatsAppOficial,
  conectarWhatsAppQr,
  type ResultadoDeConexao,
} from "@/lib/server/canais/conectar";

// Conecta um canal no CONTRATO (Configurações → Canais). O canal nasce sem
// agente; cada agente escolhe o seu na aba Canais. O Instagram conecta pelo
// OAuth (/api/instagram/oauth/start?modo=contrato).
export async function POST(request: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { tipo } = await params;
  const b = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  let r: ResultadoDeConexao | null;
  try {
    r = await conectarPorTipo(ctx.orgId, tipo, b);
  } catch {
    // Sem a tabela de canais o contrato ainda não conecta canais.
    return NextResponse.json(
      { error: "Os canais do contrato ainda não foram ativados no banco (SQL 2026-10-22-canais-do-contrato.sql)." },
      { status: 409 }
    );
  }
  if (!r) return NextResponse.json({ error: "Canal desconhecido." }, { status: 400 });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, canalId: r.canalId, aviso: r.aviso ?? null, webhookUrl: r.webhookUrl ?? null });
}

async function conectarPorTipo(orgId: string, tipo: string, b: Record<string, unknown>): Promise<ResultadoDeConexao | null> {
  const texto = (v: unknown) => String(v ?? "");
  switch (tipo) {
    case "telegram":
      return conectarTelegram(orgId, texto(b.botToken));
    case "messenger":
      return conectarMessenger(orgId, texto(b.pageId), texto(b.pageAccessToken));
    case "tiktok":
      return conectarTikTok(orgId, {
        businessId: texto(b.businessId),
        accessToken: texto(b.accessToken),
        refreshToken: texto(b.refreshToken),
        expiresIn: Number(b.expiresIn ?? 0),
        displayName: texto(b.displayName),
      });
    case "whatsapp_meta":
      return conectarWhatsAppOficial(orgId, { code: texto(b.code), wabaId: texto(b.wabaId), phoneNumberId: texto(b.phoneNumberId) });
    case "whatsapp_qr":
      return conectarWhatsAppQr(orgId);
    default:
      return null;
  }
}
