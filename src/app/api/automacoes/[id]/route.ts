import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { validar } from "@/lib/automacoes/validar";
import type { Definicao } from "@/lib/automacoes/tipos";
import { respostaDoErro } from "../comum";

type P = { params: Promise<{ id: string }> };
const REINSCRICOES = new Set(["uma_vez", "sempre", "intervalo"]);

export async function GET(_r: Request, { params }: P) {
  const ctx = await requirePermission("automacoes:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    const a = await prisma.automacao.findFirst({
      where: { id, orgId: ctx.orgId },
      include: { versaoPublicada: { select: { numero: true, definicao: true, createdAt: true } } },
    });
    if (!a) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
    const rascunho = a.rascunho as unknown as Definicao;
    // Rascunho diferente da publicada = há o que publicar.
    const publicada = a.versaoPublicada?.definicao ? JSON.stringify(a.versaoPublicada.definicao) : null;
    return NextResponse.json({
      automacao: {
        id: a.id,
        nome: a.nome,
        descricao: a.descricao,
        objeto: a.objeto,
        status: a.status,
        origem: a.origem,
        pausadaPor: a.pausadaPor,
        reinscricao: a.reinscricao,
        reinscricaoHoras: a.reinscricaoHoras,
        objetivo: a.objetivo,
        rascunho,
        versao: a.versaoPublicada?.numero ?? null,
        publicadaEm: a.versaoPublicada?.createdAt.toISOString() ?? null,
        alteracoesNaoPublicadas: publicada !== JSON.stringify(rascunho),
      },
      pendencias: validar(rascunho),
    });
  } catch (e) {
    return respostaDoErro(e);
  }
}

/** Salva o rascunho e as configurações (a publicada continua rodando até publicar de novo). */
export async function PATCH(request: Request, { params }: P) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  try {
    const a = await prisma.automacao.findFirst({ where: { id, orgId: ctx.orgId }, select: { objeto: true } });
    if (!a) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
    const data: Record<string, unknown> = {};
    if (typeof b.nome === "string") data.nome = b.nome.trim().slice(0, 120) || "Sem nome";
    if (typeof b.descricao === "string") data.descricao = b.descricao.slice(0, 500);
    if (b.reinscricao !== undefined) {
      if (!REINSCRICOES.has(String(b.reinscricao))) return NextResponse.json({ error: "Reinscrição inválida." }, { status: 400 });
      data.reinscricao = b.reinscricao;
    }
    if (b.reinscricaoHoras !== undefined) {
      data.reinscricaoHoras = b.reinscricaoHoras === null ? null : Math.max(1, Math.min(8760, Math.round(Number(b.reinscricaoHoras) || 24)));
    }
    if (b.objetivo !== undefined) data.objetivo = b.objetivo === null ? null : b.objetivo;
    if (b.rascunho !== undefined) {
      const r = b.rascunho as Partial<Definicao> | null;
      if (!r || typeof r !== "object" || typeof r.nos !== "object" || r.nos === null) return NextResponse.json({ error: "Rascunho inválido." }, { status: 400 });
      // O tipo de registro nasce com a automação (mudar quebraria execuções e variáveis).
      if (r.objeto !== a.objeto) return NextResponse.json({ error: "O tipo de registro da automação não muda." }, { status: 400 });
      data.rascunho = r;
    }
    const salvo = await prisma.automacao.update({ where: { id }, data, select: { rascunho: true, updatedAt: true } });
    return NextResponse.json({ ok: true, salvoEm: salvo.updatedAt.toISOString(), pendencias: validar(salvo.rascunho as unknown as Definicao) });
  } catch (e) {
    return respostaDoErro(e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  const ctx = await requirePermission("automacoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    const r = await prisma.automacao.deleteMany({ where: { id, orgId: ctx.orgId } });
    if (!r.count) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDoErro(e);
  }
}
