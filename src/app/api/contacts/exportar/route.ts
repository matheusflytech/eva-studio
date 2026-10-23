import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/server/permissions";
import { orderByDe, resolverConjunto, whereDeContatos } from "@/lib/server/filtro-crm";
import { atalhosDeContato, comBusca } from "@/lib/server/listas-crm";
import { carregarDefinicoes } from "@/lib/server/custom-fields";
import { lerOrdenacao } from "@/lib/filtro-crm";
import { disposicaoDeAnexo, hojeSP, lerIds } from "@/lib/exportar/csv";
import { LIMITE_DE_EXPORTACAO_DE_CONTATOS, csvDosContatos } from "@/lib/exportar/contatos";
import { registrarHistorico } from "@/lib/server/historico";

// GET /api/contacts/exportar — planilha (CSV) do que a lista de contatos está
// mostrando: o MESMO filtro, busca, atalhos, ordem e escopo do papel do
// GET /api/contacts, sem paginação (até LIMITE_DE_EXPORTACAO_DE_CONTATOS).
//   ?filtro=<JSON> &q= &tag= &segment= &company= &sort= &dir=
//   ?contrato=<id>  download por <a href> não passa pelo fetch do app
//   ?ids=a,b,c      só estes (ação em massa da seleção; até 500), sempre dentro do filtro/escopo
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const ctx = await requirePermission("contatos:exportar", { contrato: sp.get("contrato") });
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const ler = (k: string) => sp.get(k)?.trim() ?? "";
  const { ordenacao } = lerOrdenacao(sp.get("sort") ?? undefined, "contatos", sp.get("dir") ?? undefined);
  const orderBy = orderByDe("contatos", ordenacao) as Prisma.ContactOrderByWithRelationInput[];
  const w = await whereDeContatos(ctx, comBusca(sp.get("filtro"), ler("q")), {
    extras: atalhosDeContato({ tag: ler("tag"), segment: ler("segment"), company: ler("company") }),
  });
  const r = await resolverConjunto(w, { orderBy });
  const ids = lerIds(sp.get("ids"));

  const [linhas, defs] = await Promise.all([
    prisma.contact.findMany({
      where: ids.length ? { AND: [r.where, { id: { in: ids } }] } : r.where,
      orderBy,
      take: LIMITE_DE_EXPORTACAO_DE_CONTATOS + 1,
      select: {
        name: true,
        email: true,
        phone: true,
        phones: true,
        jobTitle: true,
        source: true,
        optIn: true,
        lastSeenAt: true,
        createdAt: true,
        customFields: true,
        company: { select: { name: true } },
        owner: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
        channels: { select: { channel: true } },
      },
    }),
    carregarDefinicoes(ctx.orgId, "contact"),
  ]);

  const cortado = linhas.length > LIMITE_DE_EXPORTACAO_DE_CONTATOS || r.truncado;
  const csv = csvDosContatos({
    contatos: linhas.slice(0, LIMITE_DE_EXPORTACAO_DE_CONTATOS).map((c) => ({
      ...c,
      empresa: c.company?.name ?? null,
      proprietario: c.owner?.name ?? null,
      etiquetas: c.tags.map((t) => t.tag.name),
      canais: c.channels.map((ch) => ch.channel),
      customFields: (c.customFields ?? {}) as Record<string, unknown>,
    })),
    defs,
    aviso: cortado
      ? `Atenção: a exportação saiu limitada aos primeiros ${LIMITE_DE_EXPORTACAO_DE_CONTATOS.toLocaleString("pt-BR")} contatos.`
      : null,
  });

  await registrarHistorico({
    orgId: ctx.orgId,
    acao: "exportou",
    objeto: "export",
    objetoId: `contatos-${Date.now()}`,
    objetoNome: "Contatos",
    detalhes: { entidade: "contatos", quantidade: Math.min(linhas.length, LIMITE_DE_EXPORTACAO_DE_CONTATOS), truncado: cortado, selecionados: ids.length || undefined, filtro: sp.get("filtro") || ler("q") || undefined },
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": disposicaoDeAnexo(`contatos-${hojeSP()}.csv`),
      "Cache-Control": "no-store",
      ...(cortado ? { "X-Exportacao-Truncada": "1" } : {}),
    },
  });
}
