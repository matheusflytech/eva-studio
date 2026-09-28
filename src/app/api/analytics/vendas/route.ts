import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Números de venda para o Dashboard.
//
// O painel veio do dashboard antigo de vendas do usuário, que era alimentado
// por uma plataforma de checkout. Aqui a fonte é o CRM, que é o que o Eva
// Studio realmente sabe: negócio ganho é venda, valor do negócio é receita.
//
// Nada é inventado. Onde o painel antigo tinha coisa que não existe aqui
// (SCK, produto), o lugar foi ocupado por algo que existe e responde uma
// pergunta parecida: por qual canal a pessoa chegou, e em que etapa o
// dinheiro está parado.
// ---------------------------------------------------------------------------

const DIA = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const dias = Math.min(Math.max(Number(url.searchParams.get("dias")) || 30, 1), 365);

  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setTime(desde.getTime() - (dias - 1) * DIA);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [ganhosNoPeriodo, criadosNoPeriodo, abertos, recentes, porCanal] = await Promise.all([
    prisma.deal.findMany({
      where: { orgId, closedAt: { gte: desde }, stage: { type: "won" } },
      select: { id: true, amountCents: true, closedAt: true },
    }),
    prisma.deal.count({ where: { orgId, createdAt: { gte: desde } } }),
    prisma.deal.findMany({
      where: { orgId, closedAt: null, archivedAt: null },
      select: { amountCents: true, probability: true, stage: { select: { name: true, position: true } } },
    }),
    prisma.deal.findMany({
      where: { orgId, closedAt: { gte: desde }, stage: { type: "won" } },
      include: {
        stage: { select: { name: true } },
        pipeline: { select: { name: true } },
        owner: { select: { name: true } },
        contacts: {
          take: 1,
          include: { contact: { select: { name: true, phone: true, email: true } } },
        },
      },
      orderBy: { closedAt: "desc" },
      take: 12,
    }),
    // De onde a pessoa veio: o canal do contato ligado ao negócio ganho. É o
    // equivalente honesto de "fontes de tráfego" num produto de conversa.
    prisma.$queryRaw<{ canal: string; total: number; valor: number }[]>`
      SELECT COALESCE(ch.channel, 'sem canal') AS canal,
             COUNT(DISTINCT d.id)::int         AS total,
             COALESCE(SUM(d."amountCents"), 0)::int AS valor
        FROM eva_studio_deals d
        JOIN eva_studio_pipeline_stages st ON st.id = d."stageId"
        LEFT JOIN eva_studio_deal_contacts dc ON dc."dealId" = d.id
        LEFT JOIN eva_studio_contact_channels ch ON ch."contactId" = dc."contactId"
       WHERE d."orgId" = ${orgId}
         AND st.type = 'won'
         AND d."closedAt" >= ${desde}
       GROUP BY 1
       ORDER BY 2 DESC
    `,
  ]);

  const receitaTotal = ganhosNoPeriodo.reduce((s, d) => s + d.amountCents, 0);
  const ganhosHoje = ganhosNoPeriodo.filter((d) => d.closedAt && d.closedAt >= hoje);

  // Série diária de receita. Baldes fixos: dia sem venda tem que aparecer como
  // zero, senão o gráfico "pula" o dia ruim e a linha mente.
  const baldes = new Map<string, number>();
  for (let i = 0; i < dias; i += 1) {
    const d = new Date(desde.getTime() + i * DIA);
    baldes.set(d.toISOString().slice(0, 10), 0);
  }
  for (const d of ganhosNoPeriodo) {
    if (!d.closedAt) continue;
    const chave = d.closedAt.toISOString().slice(0, 10);
    if (baldes.has(chave)) baldes.set(chave, (baldes.get(chave) ?? 0) + d.amountCents);
  }

  // Onde o dinheiro está parado, por etapa — ocupa o lugar de "top produtos".
  const porEtapa = new Map<string, { valor: number; total: number; posicao: number }>();
  for (const d of abertos) {
    const atual = porEtapa.get(d.stage.name) ?? { valor: 0, total: 0, posicao: d.stage.position };
    atual.valor += d.amountCents;
    atual.total += 1;
    porEtapa.set(d.stage.name, atual);
  }

  return NextResponse.json({
    kpis: {
      vendas: ganhosNoPeriodo.length,
      receitaCents: receitaTotal,
      ticketMedioCents: ganhosNoPeriodo.length
        ? Math.round(receitaTotal / ganhosNoPeriodo.length)
        : 0,
      vendasHoje: ganhosHoje.length,
      receitaHojeCents: ganhosHoje.reduce((s, d) => s + d.amountCents, 0),
      // Conversão de verdade: dos negócios abertos no período, quantos viraram
      // venda. Sem negócio criado não existe taxa — devolver 0 seria mentira
      // mais bonita que null, e null a tela sabe explicar.
      conversao: criadosNoPeriodo > 0 ? ganhosNoPeriodo.length / criadosNoPeriodo : null,
      criados: criadosNoPeriodo,
      emAbertoCents: abertos.reduce((s, d) => s + d.amountCents, 0),
      emAbertoPonderadoCents: abertos.reduce(
        (s, d) => s + Math.round((d.amountCents * d.probability) / 100),
        0
      ),
    },
    serie: Array.from(baldes.entries()).map(([data, cents]) => ({
      label: new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      value: Math.round(cents / 100),
    })),
    porEtapa: Array.from(porEtapa.entries())
      .sort((a, b) => a[1].posicao - b[1].posicao)
      .map(([nome, v]) => ({ label: nome, value: Math.round(v.valor / 100), total: v.total })),
    porCanal: porCanal.map((c) => ({
      label: c.canal,
      value: Number(c.total),
      valorCents: Number(c.valor),
    })),
    recentes: recentes.map((d) => ({
      id: d.id,
      nome: d.name,
      quando: d.closedAt?.toISOString() ?? null,
      contato: d.contacts[0]?.contact.name || d.contacts[0]?.contact.phone || "—",
      funil: d.pipeline.name,
      etapa: d.stage.name,
      responsavel: d.owner?.name ?? "—",
      valorCents: d.amountCents,
    })),
  });
}
