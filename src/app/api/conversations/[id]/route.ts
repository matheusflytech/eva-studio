import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { INCLUDE_CONVERSA, montarItens } from "@/lib/server/conversas";

// Uma conversa, no mesmo formato da lista. É o que a tela usa pra abrir
// direto numa conversa por link (/conversas?c=ID) e pra atualizar o cabeçalho
// depois de uma ação.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const linha = await prisma.conversation.findFirst({
    where: { id, agent: { orgId: ctx.orgId } },
    include: INCLUDE_CONVERSA,
  });
  if (!linha) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const [item] = await montarItens([linha]);
  return NextResponse.json({ conversation: item });
}
