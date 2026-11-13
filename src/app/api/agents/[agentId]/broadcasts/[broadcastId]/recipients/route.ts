import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { ROTULO_DA_SITUACAO, numeroDoDestino, paraCsv, situacaoDoItem, type Situacao } from "@/lib/disparos/situacao";

// Quem recebeu e quem não recebeu um disparo, com o motivo e a conversa.
// GET ?status=falhou|fila|enviando|enviado|entregue|lido (vazio = todos)
//     &format=csv  → arquivo para baixar (mesmo filtro)
const LIMITE = 10000;
const SITUACOES = new Set<Situacao>(["fila", "enviando", "enviado", "entregue", "lido", "falhou"]);

export async function GET(request: Request, { params }: { params: Promise<{ agentId: string; broadcastId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, broadcastId } = await params;

  const broadcast = await prisma.broadcast.findFirst({
    where: { id: broadcastId, agentId, agent: { orgId: ctx.orgId } },
    select: { id: true, channel: true, createdAt: true },
  });
  if (!broadcast) return NextResponse.json({ error: "Disparo não encontrado." }, { status: 404 });

  const url = new URL(request.url);
  const filtro = url.searchParams.get("status") as Situacao | null;
  if (filtro && !SITUACOES.has(filtro)) return NextResponse.json({ error: "Filtro inválido." }, { status: 400 });

  const itens = await prisma.outboundQueueItem.findMany({
    where: { broadcastId },
    orderBy: { createdAt: "asc" },
    take: LIMITE,
    select: { id: true, contactId: true, status: true, error: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true },
  });

  const conversas = await prisma.conversation.findMany({
    where: { agentId, channel: broadcast.channel, contactId: { in: [...new Set(itens.map((i) => i.contactId))] } },
    select: { id: true, contactId: true },
  });
  const conversaDe = new Map(conversas.map((c) => [c.contactId, c.id]));

  const contagem: Record<Situacao, number> = { fila: 0, enviando: 0, enviado: 0, entregue: 0, lido: 0, falhou: 0 };
  const linhas = itens.map((i) => {
    const situacao = situacaoDoItem(i);
    contagem[situacao] += 1;
    return {
      id: i.id,
      numero: numeroDoDestino(i.contactId),
      situacao,
      motivo: i.error ?? null,
      enviadoEm: i.sentAt?.toISOString() ?? null,
      entregueEm: i.deliveredAt?.toISOString() ?? null,
      lidoEm: i.readAt?.toISOString() ?? null,
      respondeu: !!i.repliedAt,
      conversationId: conversaDe.get(i.contactId) ?? null,
    };
  });
  const filtradas = filtro ? linhas.filter((l) => l.situacao === filtro) : linhas;

  if (url.searchParams.get("format") === "csv") {
    const csv = paraCsv(
      ["numero", "situacao", "motivo", "enviado_em", "entregue_em", "lido_em", "respondeu"],
      filtradas.map((l) => [l.numero, ROTULO_DA_SITUACAO[l.situacao], l.motivo ?? "", l.enviadoEm ?? "", l.entregueEm ?? "", l.lidoEm ?? "", l.respondeu ? "sim" : "não"])
    );
    const nome = `disparo-${broadcast.createdAt.toISOString().slice(0, 10)}-${filtro ?? "todos"}.csv`;
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"` },
    });
  }

  return NextResponse.json({ contagem, total: linhas.length, truncado: itens.length === LIMITE, destinatarios: filtradas });
}
