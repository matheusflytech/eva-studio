import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { coletarFunil } from "@/lib/server/funil-dados";
import { carregarExportacao, lerFiltrosDaUrl } from "@/lib/exportar/dados";
import { disposicaoDeAnexo, hojeSP, slugDoArquivo } from "@/lib/exportar/csv";
import {
  LIMITE_DE_EXPORTACAO,
  csvDosNegocios,
  resumoDaExportacao,
  totaisPorEtapa,
} from "@/lib/exportar/negocios";

const DIA = 86_400_000;

// Exportação do funil de negócios.
//   ?pipeline=<id>         padrão: o funil padrão da org
//   ?formato=csv|json      csv baixa a planilha; json alimenta o relatório em PDF
//   ?busca= &dono= &visao= os mesmos filtros da tela de Negócios (opcionais)
//   ?arquivados=1          inclui arquivados
//   ?dias=90               janela do relatório (ganho, taxa de ganho, ciclo, conversão)
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const pipelineId = url.searchParams.get("pipeline")?.trim() || undefined;
  const formato = url.searchParams.get("formato") === "json" ? "json" : "csv";
  const filtros = lerFiltrosDaUrl(url.searchParams);
  const agora = new Date();

  const dados = await carregarExportacao(ctx, pipelineId, filtros, agora);
  if (!dados) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });

  const aviso = dados.truncado
    ? `Atenção: a exportação saiu limitada aos primeiros ${LIMITE_DE_EXPORTACAO.toLocaleString("pt-BR")} negócios do funil.`
    : null;

  if (formato === "csv") {
    const csv = csvDosNegocios({
      funil: dados.funil.name,
      etapas: dados.etapas,
      negocios: dados.negocios,
      defs: dados.defs,
      agora,
      comArquivados: filtros.arquivados,
      aviso,
    });
    const arquivo = `negocios-${slugDoArquivo(dados.funil.name)}-${hojeSP(agora)}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": disposicaoDeAnexo(arquivo),
        "Cache-Control": "no-store",
        ...(dados.truncado ? { "X-Exportacao-Truncada": "1" } : {}),
      },
    });
  }

  // Relatório: além dos negócios, os números da capa e a faixa de conversão.
  const dias = Math.min(Math.max(Number(url.searchParams.get("dias")) || 90, 7), 365);
  const desde = new Date(agora.getTime() - dias * DIA);
  const donos = filtros.dono ? [filtros.dono === "__sem" ? "__nenhum" : filtros.dono] : undefined;
  const [org, funil] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } }),
    coletarFunil(ctx.orgId, desde, agora, dados.funil.id, { donos }),
  ]);
  const totais = new Map(totaisPorEtapa(dados.etapas, dados.negocios).map((t) => [t.etapaId, t]));
  const resumo = resumoDaExportacao(dados.etapas, dados.negocios, desde);

  return NextResponse.json(
    {
      organizacao: org?.name ?? "",
      funil: dados.funil,
      geradoEm: agora.toISOString(),
      dias,
      filtros,
      truncado: dados.truncado,
      aviso,
      resumo: {
        ...resumo,
        taxaDeGanho: funil.numeros.taxaDeGanho,
        cicloDeVenda: funil.numeros.cicloDeVenda,
      },
      conversao: funil.funis.funilConversao,
      fields: dados.defs,
      layout: dados.layout,
      etapas: dados.etapas.map((e) => ({
        ...e,
        quantidade: totais.get(e.id)?.quantidade ?? 0,
        totalCents: totais.get(e.id)?.totalCents ?? 0,
        ponderadoCents: totais.get(e.id)?.ponderadoCents ?? 0,
      })),
      negocios: dados.negocios,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
