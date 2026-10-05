import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { INCLUDE_MENSAGEM, serializarMensagens } from "@/lib/server/conversas";

// Mensagens de uma conversa, da mais antiga pra mais nova.
//
//   (sem parâmetro)   as últimas `limite`
//   ?antes=ISO        as `limite` anteriores a essa data (rolar pra cima)
//
// A tela se mantém atualizada pedindo as últimas de novo e juntando por id, em
// vez de pedir só "depois de X". Pedir só as novas não pegaria a mudança de
// estado de uma mensagem antiga (enviada -> entregue -> lida), e é esse o
// tique que o atendente olha pra saber se o cliente viu.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({ where: { id, agent: { orgId: ctx.orgId } } });
  if (!conversation) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const sp = new URL(request.url).searchParams;
  const limite = Math.min(Math.max(Number(sp.get("limite")) || 60, 1), 200);
  const antes = sp.get("antes") ? new Date(sp.get("antes")!) : null;

  const linhas = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(antes && !Number.isNaN(antes.getTime()) ? { createdAt: { lt: antes } } : {}),
    },
    include: INCLUDE_MENSAGEM,
    orderBy: { createdAt: "desc" },
    take: limite + 1,
  });

  const temMais = linhas.length > limite;
  const pagina = (temMais ? linhas.slice(0, limite) : linhas).reverse();

  return NextResponse.json({ messages: await serializarMensagens(pagina), temMais });
}
