import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";
import { mensagensDoAtendente } from "@/lib/server/site-atendimento";

// O chat do site busca aqui, de tempos em tempos, o que um atendente escreveu
// pela Caixa de entrada (o site não recebe mensagem empurrada).
//   GET ?contactId=site-live-abc&depois=2026-10-22T12:00:00.000Z
// Pública como a rota de mensagem: exige o widget ligado e o id da conversa,
// que só o navegador do visitante tem.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const MAX_CONTACT_ID = 128;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { widgetEnabled: true } });
  if (!agent?.widgetEnabled) {
    return NextResponse.json({ error: "Widget não disponível." }, { status: 404, headers: CORS_HEADERS });
  }

  // Busca a cada poucos segundos com a aba aberta: folga maior que a da mensagem.
  const limite = await checkRateLimit(`widget-novas:${agentId}:${getClientIp(request)}`, 40, 60);
  if (!limite.allowed) {
    return NextResponse.json({ error: "Muitas buscas. Aguarde um instante." }, { status: 429, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const contactId = url.searchParams.get("contactId") ?? "";
  if (!contactId || contactId.length > MAX_CONTACT_ID) {
    return NextResponse.json({ error: "contactId inválido." }, { status: 400, headers: CORS_HEADERS });
  }
  const novas = await mensagensDoAtendente(agentId, contactId, url.searchParams.get("depois"));
  return NextResponse.json(novas, { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}
