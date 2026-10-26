import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { gerarRelatorio } from "@/lib/server/studio-reports";

// Relatório do Studio (aba Relatórios do builder).
//
// GET ?from=AAAA-MM-DD&to=AAAA-MM-DD&channel=  (datas no horário de Brasília,
// "to" incluso; sem datas = últimos 7 dias; channel vazio = canais reais,
// "test" = só prévia e playground)
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const inicioDoDia = (d: string) => new Date(`${d}T00:00:00-03:00`);

export async function GET(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const q = new URL(request.url).searchParams;
  const de = q.get("from") ?? "";
  const ate = q.get("to") ?? "";
  if ((de && !DIA.test(de)) || (ate && !DIA.test(ate))) {
    return NextResponse.json({ error: "Use datas no formato AAAA-MM-DD." }, { status: 400 });
  }
  const to = ate ? new Date(inicioDoDia(ate).getTime() + 86_400_000) : new Date();
  const from = de ? inicioDoDia(de) : new Date(to.getTime() - 7 * 86_400_000);
  if (from >= to) return NextResponse.json({ error: "O início precisa ser antes do fim." }, { status: 400 });

  const flow = await prisma.agentFlow.findUnique({ where: { agentId }, select: { nodes: true } });
  const nos = (Array.isArray(flow?.nodes) ? flow.nodes : []) as { id: string; data?: { label?: string } }[];

  const relatorio = await gerarRelatorio(
    { agentId, from, to, channel: (q.get("channel") ?? "").slice(0, 50) },
    nos.map((n) => ({ id: n.id, label: n.data?.label ?? "" }))
  );
  return NextResponse.json(relatorio);
}
