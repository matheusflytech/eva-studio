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
  const texto = (v: unknown) => String(v ?? "");

  let r: ResultadoDeConexao;
  switch (tipo) {
    case "telegram":
      r = await conectarTelegram(ctx.orgId, texto(b.botToken));
      break;
    case "messenger":
      r = await conectarMessenger(ctx.orgId, texto(b.pageId), texto(b.pageAccessToken));
      break;
    case "tiktok":
      r = await conectarTikTok(ctx.orgId, {
        businessId: texto(b.businessId),
        accessToken: texto(b.accessToken),
        refreshToken: texto(b.refreshToken),
        expiresIn: Number(b.expiresIn ?? 0),
        displayName: texto(b.displayName),
      });
      break;
    case "whatsapp_meta":
      r = await conectarWhatsAppOficial(ctx.orgId, { code: texto(b.code), wabaId: texto(b.wabaId), phoneNumberId: texto(b.phoneNumberId) });
      break;
    case "whatsapp_qr":
      r = await conectarWhatsAppQr(ctx.orgId);
      break;
    default:
      return NextResponse.json({ error: "Canal desconhecido." }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, canalId: r.canalId, aviso: r.aviso ?? null, webhookUrl: r.webhookUrl ?? null });
}
