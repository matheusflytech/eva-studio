import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// Marca a conversa como vista. Chamada quando alguém abre a conversa, e de
// novo quando chega mensagem nova com ela aberta na tela.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  // updateMany pra não responder 404 num clique rápido numa conversa apagada, e
  // porque não precisa do registro de volta. O Prisma atualiza `updatedAt`
  // junto, e é bom que atualize: é isso que faz a lista dos OUTROS atendentes
  // tirar o contador de não lidas quando alguém abre a conversa.
  const r = await prisma.conversation.updateMany({
    where: { id, agent: { orgId: ctx.orgId } },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: r.count > 0 });
}
