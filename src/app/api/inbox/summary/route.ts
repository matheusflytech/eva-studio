import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { CANAIS_DE_TESTE } from "@/lib/server/conversas";

// Os números da caixa de entrada: o que o menu lateral mostra ao lado de
// "Conversas" e o que as abas da tela mostram. Antes o menu tinha um "+99"
// escrito à mão, igual pra todo mundo, o tempo todo.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const reais = { agent: { orgId: ctx.orgId }, channel: { notIn: CANAIS_DE_TESTE } };

  const [esperando, minhas, naoLidas] = await Promise.all([
    prisma.conversation.count({ where: { ...reais, status: "waiting_human" } }),
    prisma.conversation.count({
      where: { ...reais, assignedToId: ctx.userId, status: { in: ["human", "waiting_human"] } },
    }),
    // Conversas cuja última mensagem é do contato e chegou depois da última
    // abertura. É por conversa, não por mensagem: o menu diz "3 conversas
    // esperando você olhar", que é o que se quer saber de relance.
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
        FROM eva_studio_conversations c
        JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${ctx.orgId}
         AND c.channel <> ALL(${CANAIS_DE_TESTE})
         AND c."lastMessageRole" = 'contact'
         AND (c."readAt" IS NULL OR c."lastMessageAt" > c."readAt")
    `,
  ]);

  return NextResponse.json({ esperando, minhas, naoLidas: Number(naoLidas[0]?.n ?? 0) });
}
