import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { registrarMensagemSemAgente } from "@/lib/server/canais/sem-agente";
import { tokenDoWebhookTikTok, tokenDoWebhookTikTokConfere } from "@/lib/server/tiktok-token";
import { POST as entradaDoAgente } from "../../[agentId]/route";

// Entrada do TikTok por canal do contrato: a URL cadastrada no portal do
// TikTok aponta para o canal, então trocar o agente não exige mexer lá.
// Confere o token do canal, descobre o agente e repassa para a entrada de
// sempre com o token daquele agente.
export async function POST(request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await params;
  const url = new URL(request.url);
  if (!tokenDoWebhookTikTokConfere(`canal:${canalId}`, url.searchParams.get("token"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const canal = await prisma.canal.findFirst({ where: { id: canalId, tipo: "tiktok" }, select: { agentId: true } });
  if (!canal) return NextResponse.json({ ok: true });
  if (!canal.agentId) {
    await registrarMensagemSemAgente({ canalId });
    return NextResponse.json({ ok: true });
  }
  const doAgente = tokenDoWebhookTikTok(`agente:${canal.agentId}`);
  if (doAgente) url.searchParams.set("token", doAgente);
  const repassado = new Request(url, { method: "POST", headers: request.headers, body: await request.text() });
  return entradaDoAgente(repassado, { params: Promise.resolve({ agentId: canal.agentId }) });
}

// Eco de validação do callback: o mesmo da entrada por agente.
export { GET } from "../../[agentId]/route";
