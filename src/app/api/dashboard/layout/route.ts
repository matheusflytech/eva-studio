import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { FONTE_POR_CHAVE } from "@/lib/server/analytics";
import { sanearConsulta, tiposPermitidos, type Consulta } from "@/lib/consulta";
import { sanearRelatorio, tipoDoCartao, type ReportQuery, type VizType } from "@/lib/report-query";
import { FONTES_DA_VISAO, alturaPadrao, lerLayoutSalvo, painelPadrao, type WidgetSalvo } from "@/lib/dashboard-layout";

// ---------------------------------------------------------------------------
// O painel que a pessoa montou.
//
// Um layout por organização, não por usuário: dashboard pessoal vira "cada um
// vê um número diferente na reunião". Quem pode editar é quem tem permissão
// de configurar; ver, todo mundo vê.
// ---------------------------------------------------------------------------

// "funil" entra aqui: sem ele, o cartão de conversão do Painel do funil voltava
// como "numero" ao salvar.
// "especial" é o desenho próprio dos cartões da visão geral (Receita, Ritmo...).
const TIPOS = new Set(["numero", "linha", "pizza", "barras", "tabela", "funil", "especial"]);
const LARGURAS = new Set([1, 2, 3, 4]);
const ALTURAS = new Set([1, 2, 3]);

export interface Widget {
  id: string;
  tipo: string;
  fonte: string;
  titulo: string;
  largura: number;
  altura?: number;
  destaque?: boolean;
  /** Só para fonte "custom": o que o cliente montou. */
  consulta?: Consulta;
  /** Só para fonte "report": o cartão do construtor (v2). */
  relatorio?: { query: ReportQuery; viz: VizType };
}

export async function GET() {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const salvo = await prisma.dashboardLayout.findUnique({ where: { orgId } });
  // Cartão montado e salvo no formato antigo (`funilId`, filtros em lista)
  // sai já no formato novo: a tela só conhece um.
  const widgets = Array.isArray(salvo?.widgets)
    ? (salvo.widgets as unknown as Widget[]).flatMap((w) => {
        if (w?.fonte === "report") {
          const relatorio = sanearRelatorio(w.relatorio);
          return relatorio ? [{ ...w, relatorio }] : [];
        }
        if (w?.fonte !== "custom") {
          // Fonte de funil salva antes da correção acima voltou como "numero" e
          // aparece vazia: devolve o tipo que a fonte desenha.
          const fonte = FONTE_POR_CHAVE.get(w?.fonte);
          return [fonte?.tipo === "funil" && w.tipo !== "funil" ? { ...w, tipo: "funil" } : w];
        }
        const consulta = sanearConsulta(w.consulta);
        return consulta ? [{ ...w, consulta }] : [];
      })
    : null;
  return NextResponse.json({ widgets: widgets ? lerLayoutSalvo(widgets as WidgetSalvo[]) : painelPadrao(), padrao: !salvo });
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
    const largura = LARGURAS.has(Number(w?.largura)) ? Number(w.largura) : 1;
    const id = String(w?.id ?? crypto.randomUUID()).slice(0, 40);
    const tamanho = (tipo: string) => ({
      largura,
      altura: ALTURAS.has(Number(w?.altura)) ? Number(w.altura) : alturaPadrao(tipo, fonte),
      ...(w?.destaque === true ? { destaque: true } : {}),
    });

    // Cartão montado pelo cliente: a consulta é saneada, e o tipo precisa
    // caber nela (não existe pizza de "por mês").
    if (fonte === "custom") {
      const consulta = sanearConsulta(w?.consulta);
      if (!consulta) continue;
      const permitidos = tiposPermitidos(consulta);
      const tipo = permitidos.find((t) => t === w?.tipo) ?? permitidos[0];
      widgets.push({ id, tipo, fonte, titulo: String(w?.titulo ?? "Meu cartão").slice(0, 80) || "Meu cartão", ...tamanho(tipo), consulta });
      continue;
    }

    if (fonte === "report") {
      const relatorio = sanearRelatorio(w?.relatorio);
      if (!relatorio) continue;
      const titulo = String(w?.titulo ?? "Meu cartão").slice(0, 80) || "Meu cartão";
      const tipo = tipoDoCartao(relatorio.viz);
      widgets.push({ id, tipo, fonte, titulo, ...tamanho(tipo), relatorio });
      continue;
    }

    const definicao = FONTE_POR_CHAVE.get(fonte);
    if (!definicao) continue;
    // Cartão da visão geral só tem o desenho dele; o resto não usa "especial".
    const tipo = FONTES_DA_VISAO.has(fonte) ? "especial" : TIPOS.has(w?.tipo) && w.tipo !== "especial" ? String(w.tipo) : "numero";
    widgets.push({
      id,
      tipo,
      fonte,
      titulo: String(w?.titulo ?? definicao.rotulo).slice(0, 80) || definicao.rotulo,
      ...tamanho(tipo),
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
  return NextResponse.json({ ok: true, widgets: painelPadrao() });
}
