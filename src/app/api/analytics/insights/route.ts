import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Insights.
//
// A tela anterior tinha três painéis e dois eram inventados, com um parágrafo
// explicando por que eram inventados. Um painel que pede desculpa não é um
// insight: é ruído ocupando o lugar de um.
//
// Tudo aqui sai de tabela. Nenhum número precisa de LLM — o que precisaria
// (classificar tema, medir sentimento) simplesmente não está aqui, em vez de
// aparecer com um selo de "simulado".
// ---------------------------------------------------------------------------

const DIA = 24 * 60 * 60 * 1000;

/**
 * Canais que não são cliente: o Playground e a prévia do builder são você
 * mesmo testando. Contar isso como atendimento infla o volume e, pior,
 * envenena a taxa de resolução — teste sempre "resolve sozinho", porque quem
 * testa não pede atendente.
 */
const CANAIS_INTERNOS = ["playground", "builder_preview"];

/** Palavras que aparecem em toda conversa e não dizem nada sobre o assunto. */
const VAZIAS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","é","em","um","uma","uns","umas","para","pra","por",
  "com","sem","no","na","nos","nas","ao","aos","que","qual","quais","se","sim","nao","não","ok","oi",
  "ola","olá","bom","boa","dia","tarde","noite","obrigado","obrigada","por favor","favor","eu","voce",
  "você","vc","meu","minha","seu","sua","me","te","lhe","isso","isto","aqui","ali","mais","menos","ja",
  "já","tem","ter","tenho","quero","queria","gostaria","pode","posso","vou","vai","ser","estou","esta",
  "está","sou","foi","era","como","onde","quando","porque","por que","mas","tambem","também","so","só",
  "bem","muito","todo","toda","tudo","nada","entao","então","ai","aí","la","lá","ne","né","ta","tá",
]);

export async function GET(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get("dias")) || 30, 1), 180);
  const desde = new Date(Date.now() - dias * DIA);

  const [conversas, mensagensContato, execucoes, porHora] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        agent: { orgId },
        updatedAt: { gte: desde },
        channel: { notIn: CANAIS_INTERNOS },
      },
      select: { id: true, channel: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.message.findMany({
      where: {
        role: "contact",
        createdAt: { gte: desde },
        conversation: { agent: { orgId }, channel: { notIn: CANAIS_INTERNOS } },
      },
      select: { text: true },
      take: 4000,
    }),
    prisma.flowExecution.findMany({
      where: { agent: { orgId }, createdAt: { gte: desde } },
      select: { status: true, steps: true },
      orderBy: { createdAt: "desc" },
      take: 800,
    }),
    // Hora do dia no fuso de São Paulo: às 3h da manhã UTC ninguém escreve, e
    // um gráfico de pico em UTC manda a pessoa atender no horário errado.
    prisma.$queryRaw<{ hora: number; total: number }[]>`
      SELECT EXTRACT(HOUR FROM (m."createdAt" AT TIME ZONE 'America/Sao_Paulo'))::int AS hora,
             COUNT(*)::int AS total
        FROM eva_studio_messages m
        JOIN eva_studio_conversations c ON c.id = m."conversationId"
        JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId}
         AND m.role = 'contact'
         AND c.channel <> ALL(${CANAIS_INTERNOS})
         AND m."createdAt" >= ${desde}
       GROUP BY 1
       ORDER BY 1
    `,
  ]);

  // ── Quanto o agente resolve sozinho ──────────────────────────────────────
  // É O número de um produto de atendimento automático. Tudo o mais é detalhe
  // ao lado de "de cada dez conversas, quantas não precisaram de gente".
  const escalaram = conversas.filter((c) => c.status === "waiting_human" || c.status === "human").length;
  const autonomia = conversas.length > 0 ? 1 - escalaram / conversas.length : null;

  // ── Por canal ────────────────────────────────────────────────────────────
  const canais = new Map<string, { total: number; escalou: number }>();
  for (const c of conversas) {
    const atual = canais.get(c.channel) ?? { total: 0, escalou: 0 };
    atual.total += 1;
    if (c.status === "waiting_human" || c.status === "human") atual.escalou += 1;
    canais.set(c.channel, atual);
  }

  // ── Onde a conversa para ─────────────────────────────────────────────────
  // O último bloco de cada execução. Um bloco que aparece muito aqui é onde as
  // pessoas desistem — e é a coisa mais acionável desta tela, porque aponta
  // para uma pergunta específica que está travando gente.
  interface Passo { nodeId: string; kind: string; label: string; error?: string }
  const paradas = new Map<string, { label: string; kind: string; total: number; erros: number }>();
  for (const e of execucoes) {
    const passos = (e.steps as unknown as Passo[]) ?? [];
    const ultimo = passos[passos.length - 1];
    if (!ultimo) continue;
    const atual = paradas.get(ultimo.nodeId) ?? {
      label: ultimo.label,
      kind: ultimo.kind,
      total: 0,
      erros: 0,
    };
    atual.total += 1;
    if (passos.some((p) => p.error)) atual.erros += 1;
    paradas.set(ultimo.nodeId, atual);
  }

  // ── Termos mais repetidos ────────────────────────────────────────────────
  // Contagem de palavra, não classificação de tema. A diferença importa: isto
  // é verificável, e "tema" sem um modelo lendo as conversas seria chute.
  const contagem = new Map<string, number>();
  for (const m of mensagensContato) {
    const palavras = (m.text ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length >= 4 && !VAZIAS.has(p) && !/^\d+$/.test(p));
    // Uma palavra repetida cinco vezes na mesma mensagem conta uma vez: senão
    // um cliente nervoso define o ranking sozinho.
    for (const p of new Set(palavras)) contagem.set(p, (contagem.get(p) ?? 0) + 1);
  }

  return NextResponse.json({
    periodo: dias,
    volume: {
      conversas: conversas.length,
      mensagensDeContato: mensagensContato.length,
      escalaram,
      autonomia,
    },
    porCanal: Array.from(canais.entries())
      .map(([canal, v]) => ({ label: canal, value: v.total, escalou: v.escalou }))
      .sort((a, b) => b.value - a.value),
    ondePara: Array.from(paradas.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    termos: Array.from(contagem.entries())
      .map(([termo, total]) => ({ label: termo, value: total }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
    porHora: Array.from({ length: 24 }, (_, h) => ({
      label: `${String(h).padStart(2, "0")}h`,
      value: Number(porHora.find((p) => Number(p.hora) === h)?.total ?? 0),
    })),
  });
}
