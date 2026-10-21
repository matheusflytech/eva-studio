import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { registrarMensagemSemAgente } from "@/lib/server/canais/sem-agente";
import { POST as entradaDoAgente } from "../../[agentId]/route";

// Entrada do Telegram por canal do contrato. O webhook do bot aponta para o
// canal (não para o agente): trocar o agente que atende não exige registrar
// de novo. Aqui só descobre o agente e repassa para a entrada de sempre, que
// confere o secret_token e responde.
export async function POST(request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await params;
  const canal = await prisma.canal.findFirst({ where: { id: canalId, tipo: "telegram" }, select: { agentId: true } });
  // Sempre 200 quando não há o que fazer: erro faria o Telegram repetir.
  if (!canal) return NextResponse.json({ ok: true });
  if (!canal.agentId) {
    await registrarMensagemSemAgente({ canalId });
    return NextResponse.json({ ok: true });
  }
  return entradaDoAgente(request, { params: Promise.resolve({ agentId: canal.agentId }) });
}
