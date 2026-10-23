import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { listarHistorico } from "@/lib/server/historico";
import { itensDoHistorico } from "@/lib/server/historico-leitura";
import { listarMembros } from "@/lib/server/membros";
import { ACOES_DO_FILTRO, OBJETOS_DO_FILTRO, type TipoDoAtor } from "@/lib/historico/tipos";

// Auditoria do contrato (Configurações → Auditoria): tudo o que foi feito, de
// quem, mais recente primeiro. Filtros pela query:
//   de, ate (AAAA-MM-DD, dia de São Paulo), ator (id da pessoa), atorTipo
//   (agente|automacao|api|integracao|sistema), tipo (deal|contact|company|
//   acesso|api_key|export), acao (criou|alterou|apagou|restaurou|exportou),
//   q (nome do registro), cursor. 50 por página.

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS_DE_ATOR = new Set<TipoDoAtor>(["usuario", "agente", "automacao", "api", "integracao", "sistema"]);

// São Paulo não tem horário de verão desde 2019: o dia vai de 00h a 23h59 em -03:00.
const inicioDoDia = (d: string | null) => (d && DIA.test(d) ? new Date(`${d}T00:00:00.000-03:00`) : undefined);
const fimDoDia = (d: string | null) => (d && DIA.test(d) ? new Date(`${d}T23:59:59.999-03:00`) : undefined);

export async function GET(request: Request) {
  const ctx = await requirePermission("auditoria:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const tipo = sp.get("tipo") as keyof typeof OBJETOS_DO_FILTRO | null;
  const acao = sp.get("acao") as keyof typeof ACOES_DO_FILTRO | null;
  const atorTipo = sp.get("atorTipo") as TipoDoAtor | null;
  const cursor = sp.get("cursor");

  const [pagina, membros] = await Promise.all([
    listarHistorico(ctx.orgId, {
      objeto: tipo && OBJETOS_DO_FILTRO[tipo] ? OBJETOS_DO_FILTRO[tipo] : undefined,
      acoes: acao && ACOES_DO_FILTRO[acao] ? ACOES_DO_FILTRO[acao] : undefined,
      atorId: sp.get("ator") || undefined,
      atorTipo: atorTipo && TIPOS_DE_ATOR.has(atorTipo) ? atorTipo : undefined,
      de: inicioDoDia(sp.get("de")),
      ate: fimDoDia(sp.get("ate")),
      busca: sp.get("q") ?? undefined,
      cursor,
      limite: 50,
    }),
    // Para o filtro "Quem": só na primeira página.
    cursor ? Promise.resolve(null) : listarMembros(ctx.orgId).catch(() => []),
  ]);
  const itens = await itensDoHistorico(ctx.orgId, pagina.linhas);
  return NextResponse.json({
    disponivel: pagina.disponivel,
    itens,
    proximo: pagina.proximo,
    ...(membros ? { pessoas: membros.map((m) => ({ id: m.id, nome: m.name || m.email })) } : {}),
  });
}
