import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { POST as entradaDoAgente } from "../../[agentId]/route";

// Entrada do TikTok por canal do contrato: a URL cadastrada no portal do
// TikTok aponta para o canal, então trocar o agente não exige mexer lá.
// Descobre o agente e repassa para a entrada de sempre (que confere o token).
export async function POST(request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await params;
  const canal = await prisma.canal.findFirst({ where: { id: canalId, tipo: "tiktok" }, select: { agentId: true } });
  if (!canal?.agentId) return NextResponse.json({ ok: true });
  return entradaDoAgente(request, { params: Promise.resolve({ agentId: canal.agentId }) });
}

// Eco de validação do callback: o mesmo da entrada por agente.
export { GET } from "../../[agentId]/route";
