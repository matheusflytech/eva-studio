import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Dados reais pro Dashboard — sem simulação. Conta mensagens de verdade
// (eva_studio_messages) por dia, e taxa de resposta = quantas conversas que
// tiveram pelo menos uma mensagem do contato também tiveram alguma resposta
// (bot ou atendente humano).
export async function GET(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 1), 90);
  const agentId = url.searchParams.get("agentId") || undefined;

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const agentFilter = agentId ? { agentId } : {};

  const messages = await prisma.message.findMany({
    where: {
      createdAt: { gte: since },
      conversation: { agent: { orgId }, ...agentFilter },
    },
    select: { role: true, createdAt: true },
  });

  const buckets = new Map<string, { contacts: number; replies: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), { contacts: 0, replies: 0 });
  }
  for (const m of messages) {
    const key = m.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (m.role === "contact") bucket.contacts += 1;
    else bucket.replies += 1;
  }

  const series = Array.from(buckets.entries()).map(([date, counts]) => ({
    label: new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    contacts: counts.contacts,
    replies: counts.replies,
  }));

  // Horário de pico — hora do dia (fuso America/Sao_Paulo) em que os
  // contatos mais escrevem, pra Insights. Só mensagens de contato contam.
  const hourFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });
  const hourCounts = new Array(24).fill(0);
  for (const m of messages) {
    if (m.role !== "contact") continue;
    const hour = Number(hourFormatter.format(m.createdAt).replace(/\D/g, ""));
    hourCounts[hour % 24] += 1;
  }
  const peakHours = hourCounts.map((value, hour) => ({ label: `${hour}h`, value }));

  const conversationCount = agentId
    ? await prisma.conversation.count({ where: { agentId, agent: { orgId } } })
    : await prisma.conversation.count({ where: { agent: { orgId } } });

  const stats = agentId
    ? await prisma.$queryRaw<{ withContact: bigint; withReply: bigint }[]>`
        select
          count(distinct case when m.role = 'contact' then m."conversationId" end) as "withContact",
          count(distinct case when m.role in ('bot', 'human') then m."conversationId" end) as "withReply"
        from "eva_studio_messages" m
        join "eva_studio_conversations" c on c.id = m."conversationId"
        join "eva_studio_agents" a on a.id = c."agentId"
        where a."orgId" = ${orgId} and c."agentId" = ${agentId}
      `
    : await prisma.$queryRaw<{ withContact: bigint; withReply: bigint }[]>`
        select
          count(distinct case when m.role = 'contact' then m."conversationId" end) as "withContact",
          count(distinct case when m.role in ('bot', 'human') then m."conversationId" end) as "withReply"
        from "eva_studio_messages" m
        join "eva_studio_conversations" c on c.id = m."conversationId"
        join "eva_studio_agents" a on a.id = c."agentId"
        where a."orgId" = ${orgId}
      `;

  const withContact = Number(stats[0]?.withContact ?? 0);
  const withReply = Number(stats[0]?.withReply ?? 0);
  const responseRate = withContact > 0 ? Math.round((Math.min(withReply, withContact) / withContact) * 100) : 0;

  return NextResponse.json({
    series,
    peakHours,
    totalConversations: conversationCount,
    totalContactMessages: withContact,
    responseRate,
  });
}
