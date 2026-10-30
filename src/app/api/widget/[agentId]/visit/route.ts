import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";
import { ipHash } from "@/lib/server/marketing";
import { cleanTouch, newCode } from "@/lib/marketing/touch";

// Visita do site com origem conhecida (UTM, id de clique, referrer). O script
// do widget pede um código e reescreve os links wa.me da página com
// "(ref: CODE)": quem sai do site para o WhatsApp leva a origem junto.
// Pública como a rota de mensagem: só vale para agente com widget ligado.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { orgId: true, widgetEnabled: true } });
  if (!agent || !agent.widgetEnabled) {
    return NextResponse.json({ error: "Widget não disponível." }, { status: 404, headers: CORS_HEADERS });
  }

  const ip = getClientIp(request);
  const limite = await checkRateLimit(`widget-visit:${agentId}:${ip}`, 10, 60);
  if (!limite.allowed) return NextResponse.json({ error: "Muitas visitas." }, { status: 429, headers: CORS_HEADERS });

  const body = await request.json().catch(() => ({}));
  const touch = cleanTouch(body?.touch);
  if (!Object.keys(touch).some((k) => k !== "landingUrl")) {
    return NextResponse.json({ error: "Sem origem." }, { status: 400, headers: CORS_HEADERS });
  }

  // Código de 8 letras: colisão é rara, mas o índice único decide; tenta de novo uma vez.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const code = newCode(8);
    try {
      await prisma.linkClick.create({
        data: {
          orgId: agent.orgId,
          code,
          gclid: touch.gclid ?? null,
          fbclid: touch.fbclid ?? null,
          referrer: touch.referrer ?? null,
          ipHash: ipHash(ip, code),
          raw: touch as object,
        },
      });
      return NextResponse.json({ code }, { headers: CORS_HEADERS });
    } catch (e) {
      if (tentativa === 1) {
        console.error("[widget/visit] falha ao gravar a visita", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Falha ao gravar." }, { status: 500, headers: CORS_HEADERS });
      }
    }
  }
  return NextResponse.json({ error: "Falha ao gravar." }, { status: 500, headers: CORS_HEADERS });
}
