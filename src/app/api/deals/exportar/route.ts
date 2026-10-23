import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { coletarFunil } from "@/lib/server/funil-dados";
import { carregarExportacao, lerFiltrosDaUrl } from "@/lib/exportar/dados";
import { disposicaoDeAnexo, hojeSP, lerIds, slugDoArquivo } from "@/lib/exportar/csv";
import {
  LIMITE_DE_EXPORTACAO,
  csvDosItens,
  csvDosNegocios,
  resumoDaExportacao,
  totaisPorEtapa,
} from "@/lib/exportar/negocios";
import { registrarHistorico } from "@/lib/server/historico";

const DIA = 86_400_000;

// Exportação do funil de negócios.
//   ?pipeline=<id>         padrão: o funil padrão da org
//   ?formato=csv|json      csv baixa a planilha; json alimenta o relatório em PDF
//   ?filtro=<JSON>         o filtro do motor (o mesmo da tela: barra, avançados, visão, busca)
//   ?ids=a,b,c             só estes (exportar a seleção; até 500)
//   ?busca= &dono= &visao= filtros antigos (quando não há ?filtro=; links e relatórios antigos)
//   ?arquivados=1          inclui arquivados
//   ?itens=1               (csv) uma linha por item/produto do negócio
//   ?dias=90               janela do relatório (ganho, taxa de ganho, ciclo, conversão)
export async function GET(request: Request) {
  // Download por <a href> não passa pelo fetch do app: o contrato vem na query.
  const ctx = await requirePermission("negocios:exportar", { contrato: new URL(request.url).searchParams.get("contrato") });
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const pipelineId = url.searchParams.get("pipeline")?.trim() || undefined;
  const formato = url.searchParams.get("formato") === "json" ? "json" : "csv";
  const filtros = lerFiltrosDaUrl(url.searchParams);
  const agora = new Date();

  const filtroDoMotor = url.searchParams.get("filtro");
  const ids = lerIds(url.searchParams.get("ids"));
  const dados = await carregarExportacao(ctx, pipelineId, filtros, agora, {
    itens: formato === "csv",
    ...(filtroDoMotor !== null ? { filtro: filtroDoMotor } : {}),
    ...(ids.length ? { ids } : {}),
  });
  if (!dados) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });
  await registrarHistorico({
    orgId: ctx.orgId,
    acao: "exportou",
    objeto: "export",
    objetoId: `negocios-${agora.getTime()}`,
    objetoNome: `Negócios · ${dados.funil.name}`,
    detalhes: { entidade: "negocios", funil: dados.funil.name, formato: formato === "csv" ? (url.searchParams.get("itens") === "1" ? "csv por item" : "csv") : "relatório", quantidade: dados.negocios.length, truncado: dados.truncado, selecionados: ids.length || undefined },
  });

  const aviso = dados.truncado
    ? `Atenção: a exportação saiu limitada aos primeiros ${LIMITE_DE_EXPORTACAO.toLocaleString("pt-BR")} negócios do funil.`
    : null;

  if (formato === "csv") {
    // ?itens=1: uma linha por item (produto) em vez de uma por negócio.
    const porItem = url.searchParams.get("itens") === "1";
    const opcoes = {
      funil: dados.funil.name,
      etapas: dados.etapas,
      negocios: dados.negocios,
      defs: dados.defs,
      agora,
      comArquivados: filtros.arquivados,
      aviso,
    };
    const csv = porItem ? csvDosItens(opcoes) : csvDosNegocios(opcoes);
    const arquivo = `${porItem ? "itens" : "negocios"}-${slugDoArquivo(dados.funil.name)}-${hojeSP(agora)}.csv`;
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
