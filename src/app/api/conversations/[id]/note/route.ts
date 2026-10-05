import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { registrarMensagens } from "@/lib/server/inbox";
import { INCLUDE_MENSAGEM, serializarMensagens } from "@/lib/server/conversas";

// Nota interna: recado da equipe dentro da conversa. Fica na linha do tempo
// mas NUNCA sai pro cliente e NUNCA entra no contexto da IA.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const conversa = await prisma.conversation.findFirst({ where: { id, agent: { orgId: ctx.orgId } } });
  if (!conversa) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const { text } = await request.json().catch(() => ({ text: "" }));
  const texto = typeof text === "string" ? text.trim() : "";
  if (!texto) return NextResponse.json({ error: "Escreva a nota." }, { status: 400 });
  if (texto.length > 4000) return NextResponse.json({ error: "A nota passa de 4000 caracteres." }, { status: 400 });

  const [criada] = await registrarMensagens(conversa.id, [
    { role: "note", text: texto, authorId: ctx.userId, deliveryStatus: "sent" },
  ]);

  const final = await prisma.message.findUniqueOrThrow({ where: { id: criada.id }, include: INCLUDE_MENSAGEM });
  const [serializada] = await serializarMensagens([final]);
  return NextResponse.json({ ok: true, message: serializada });
}
