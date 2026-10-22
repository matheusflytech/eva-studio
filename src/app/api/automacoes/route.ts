import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { listarAutomacoes } from "@/lib/server/automacoes/telas";
import { modeloPorId } from "@/lib/automacoes/modelos";
import { definicaoVazia, OBJETOS, type Objeto } from "@/lib/automacoes/tipos";
import { respostaDoErro, SEM_TABELA } from "./comum";

// Automações do contrato: a lista (com os números do topo) e criar uma nova
// (em branco ou a partir de um modelo da galeria). Nasce como rascunho.

export async function GET() {
  const ctx = await requirePermission("automacoes:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    return NextResponse.json({ disponivel: true, ...(await listarAutomacoes(ctx.orgId)) });
  } catch {
    return NextResponse.json({ disponivel: false, aviso: SEM_TABELA, kpis: null, automacoes: [] });
  }
}

export async function POST(request: Request) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = (await request.json().catch(() => ({}))) as { nome?: unknown; objeto?: unknown; modeloId?: unknown };
  const modelo = typeof body.modeloId === "string" ? modeloPorId(body.modeloId) : undefined;
  if (body.modeloId && !modelo) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 400 });
  const objeto = (modelo?.objeto ?? body.objeto) as Objeto;
  if (!(OBJETOS as readonly string[]).includes(objeto)) return NextResponse.json({ error: "Escolha o tipo de registro." }, { status: 400 });
  const nome = String(body.nome ?? "").trim().slice(0, 120) || modelo?.nome || "Nova automação";
  try {
    const a = await prisma.automacao.create({
      data: {
        orgId: ctx.orgId,
        nome,
        descricao: modelo?.descricao ?? "",
        objeto,
        rascunho: (modelo ? modelo.definicao() : definicaoVazia(objeto)) as object,
        reinscricao: modelo?.reinscricao ?? "uma_vez",
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: a.id }, { status: 201 });
  } catch (e) {
    return respostaDoErro(e);
  }
}
