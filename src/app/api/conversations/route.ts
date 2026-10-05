import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { CANAIS_DE_TESTE, INCLUDE_CONVERSA, montarItens } from "@/lib/server/conversas";
import type { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Lista da caixa de entrada.
//
//   ?filtro=todas|esperando|minhas|agente|encerradas
//   ?q=texto              nome, telefone, e-mail ou trecho da última mensagem
//   ?canal=whatsapp_meta
//   ?testes=1             inclui Playground e prévia do Builder
//   ?limite=40&antes=ISO  paginação: as mais antigas que a data
//   ?desde=ISO            só as que mudaram depois (é o que a tela usa pra
//                         se manter atualizada sem baixar a lista toda)
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const params = new URL(request.url).searchParams;
  const filtro = params.get("filtro") ?? "todas";
  const q = params.get("q")?.trim() ?? "";
  const canal = params.get("canal") ?? "";
  const comTestes = params.get("testes") === "1";
  const limite = Math.min(Math.max(Number(params.get("limite")) || 40, 1), 100);
  const antes = params.get("antes");
  const desde = params.get("desde");

  const e: Prisma.ConversationWhereInput[] = [{ agent: { orgId: ctx.orgId } }];

  if (!comTestes) e.push({ channel: { notIn: CANAIS_DE_TESTE } });
  if (canal) e.push({ channel: canal });

  if (filtro === "esperando") e.push({ status: "waiting_human" });
  else if (filtro === "minhas") e.push({ assignedToId: ctx.userId, status: { in: ["human", "waiting_human"] } });
  else if (filtro === "agente") e.push({ status: "active" });
  else if (filtro === "encerradas") e.push({ status: "ended" });

  if (q) {
    e.push({
      OR: [
        { contactId: { contains: q, mode: "insensitive" } },
        { lastMessageText: { contains: q, mode: "insensitive" } },
        { contact: { name: { contains: q, mode: "insensitive" } } },
        { contact: { phone: { contains: q } } },
        { contact: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const dData = (v: string | null) => {
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };

  // Atualização incremental: tudo que mexeu depois do corte, de qualquer
  // jeito (mensagem nova, assumida, encerrada). `updatedAt` cobre as mudanças
  // de estado; `lastMessageAt` as mensagens.
  const dDesde = dData(desde);
  if (dDesde) e.push({ OR: [{ updatedAt: { gt: dDesde } }, { lastMessageAt: { gt: dDesde } }] });

  const dAntes = dData(antes);
  if (dAntes && !dDesde) e.push({ lastMessageAt: { lt: dAntes } });

  const linhas = await prisma.conversation.findMany({
    where: { AND: e },
    include: INCLUDE_CONVERSA,
    orderBy: { lastMessageAt: "desc" },
    // Um a mais que o pedido: é como se sabe se tem outra página sem contar tudo.
    take: limite + 1,
  });

  const temMais = linhas.length > limite;
  const pagina = temMais ? linhas.slice(0, limite) : linhas;

  return NextResponse.json({
    conversations: await montarItens(pagina),
    temMais,
    agora: new Date().toISOString(),
  });
}
