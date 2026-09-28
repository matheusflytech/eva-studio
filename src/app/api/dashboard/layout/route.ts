import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { FONTE_POR_CHAVE } from "@/lib/server/analytics";

// ---------------------------------------------------------------------------
// O painel que a pessoa montou.
//
// Um layout por organização, não por usuário: dashboard pessoal vira "cada um
// vê um número diferente na reunião". Quem pode editar é quem tem permissão
// de configurar; ver, todo mundo vê.
// ---------------------------------------------------------------------------

const TIPOS = new Set(["numero", "linha", "pizza", "barras", "tabela"]);
const LARGURAS = new Set([1, 2, 3]);

export interface Widget {
  id: string;
  tipo: string;
  fonte: string;
  titulo: string;
  largura: number;
}

/** O painel de quem nunca mexeu. Mostra o essencial de venda sem pedir configuração. */
const PADRAO: Widget[] = [
  { id: "p1", tipo: "numero", fonte: "vendas", titulo: "Vendas fechadas", largura: 1 },
  { id: "p2", tipo: "numero", fonte: "receita", titulo: "Receita", largura: 1 },
  { id: "p3", tipo: "numero", fonte: "ticket", titulo: "Ticket médio", largura: 1 },
  { id: "p4", tipo: "linha", fonte: "receitaPorDia", titulo: "Receita por dia", largura: 2 },
  { id: "p5", tipo: "barras", fonte: "porEtapa", titulo: "Onde o dinheiro está parado", largura: 1 },
  { id: "p6", tipo: "pizza", fonte: "porCanalVendas", titulo: "Vendas por canal", largura: 1 },
  { id: "p7", tipo: "tabela", fonte: "vendasRecentes", titulo: "Últimas vendas", largura: 2 },
];

export async function GET() {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const salvo = await prisma.dashboardLayout.findUnique({ where: { orgId } });
  return NextResponse.json({
    widgets: (salvo?.widgets as unknown as Widget[]) ?? PADRAO,
    padrao: !salvo,
  });
}

export async function PUT(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const bruto = Array.isArray(body.widgets) ? body.widgets : null;
  if (!bruto) return NextResponse.json({ error: "Formato inválido." }, { status: 400 });

  // Saneamento no servidor, não só no formulário: um painel apontando pra uma
  // fonte que não existe quebraria a tela de todo mundo da organização, e a
  // tela é compartilhada.
  const widgets: Widget[] = [];
  for (const w of bruto.slice(0, 40)) {
    const fonte = String(w?.fonte ?? "");
    const definicao = FONTE_POR_CHAVE.get(fonte);
    if (!definicao) continue;
    const tipo = TIPOS.has(w?.tipo) ? String(w.tipo) : "numero";
    const largura = LARGURAS.has(Number(w?.largura)) ? Number(w.largura) : 1;
    widgets.push({
      id: String(w?.id ?? crypto.randomUUID()).slice(0, 40),
      tipo,
      fonte,
      titulo: String(w?.titulo ?? definicao.rotulo).slice(0, 80) || definicao.rotulo,
      largura,
    });
  }

  await prisma.dashboardLayout.upsert({
    where: { orgId: ctx.orgId },
    create: { orgId: ctx.orgId, widgets: widgets as unknown as object },
    update: { widgets: widgets as unknown as object },
  });

  return NextResponse.json({ ok: true, widgets });
}

export async function DELETE() {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  await prisma.dashboardLayout.deleteMany({ where: { orgId: ctx.orgId } });
  return NextResponse.json({ ok: true, widgets: PADRAO });
}
