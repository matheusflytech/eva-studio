"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useSearchParams } from "@/lib/contrato/navegacao";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarValor, type DefinicaoDeCampo } from "@/lib/custom-fields";
import type { LayoutDoCartao } from "@/lib/cartao-layout";
import { dataBR, dataHoraBR, diaSemFusoBR, reais } from "@/lib/exportar/csv";
import {
  descreverTarefa,
  diasNaEtapa,
  ordenarPorEtapa,
  situacaoDaEtapa,
  type EtapaParaExportar,
  type NegocioParaExportar,
} from "@/lib/exportar/negocios";

// ---------------------------------------------------------------------------
// Relatório do funil para imprimir ou salvar em PDF.
//
// Sem biblioteca de PDF: a página é o documento e o navegador imprime. Na tela
// ela parece uma prévia (folha branca sobre o fundo do app); na impressão some
// tudo o que não é a folha. A barra lateral do app some pelas regras de
// @media print do globals.css.
//
// Uma seção por etapa, cada uma começando numa página nova, com a tabela dos
// negócios: as colunas principais e os campos personalizados que o funil
// mostra no cartão ou na prévia.
// ---------------------------------------------------------------------------

interface EtapaDoRelatorio extends EtapaParaExportar {
  quantidade: number;
  totalCents: number;
  ponderadoCents: number;
}

interface DadosDoRelatorio {
  organizacao: string;
  funil: { id: string; name: string };
  geradoEm: string;
  dias: number;
  filtros: { busca?: string; dono?: string; visao?: string; arquivados?: boolean };
  truncado: boolean;
  aviso: string | null;
  resumo: {
    abertos: number;
    abertoCents: number;
    ponderadoCents: number;
    ganhos: number;
    ganhoCents: number;
    taxaDeGanho: number | null;
    cicloDeVenda: number | null;
  };
  conversao: { etapaId: string; nome: string; quantidade: number; taxaDaAnterior: number; taxaDoInicio: number }[];
  fields: DefinicaoDeCampo[];
  layout: LayoutDoCartao;
  etapas: EtapaDoRelatorio[];
  negocios: NegocioParaExportar[];
}

/** Campos personalizados que cabem numa folha A4 deitada, além das colunas fixas. */
const MAX_CAMPOS_NO_RELATORIO = 6;

const ROTULO_DA_VISAO: Record<string, string> = {
  meus: "Meus negócios",
  atencao: "Precisam de atenção",
  parados: "Parados",
  fechando: "Fechando este mês",
};

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

// useSearchParams precisa de um Suspense em volta para a página poder ser
// pré-renderizada (sem ele o build falha).
export default function RelatorioDoFunilPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-[13px] text-text-tertiary">Carregando...</div>}>
      <Relatorio />
    </React.Suspense>
  );
}

function Relatorio() {
  const parametros = useSearchParams();
  const consulta = React.useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ["pipeline", "filtro", "busca", "dono", "visao", "arquivados", "dias"]) {
      const v = parametros.get(k);
      if (v) p.set(k, v);
    }
    p.set("formato", "json");
    return p.toString();
  }, [parametros]);
  const imprimirAoAbrir = parametros.get("imprimir") === "1";

  const [dados, setDados] = React.useState<DadosDoRelatorio | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const jaImprimiu = React.useRef(false);

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/deals/exportar?${consulta}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setErro(d.error ?? "Não foi possível montar o relatório.");
        else setDados(d);
      })
      .catch(() => vivo && setErro("Sem conexão."));
    return () => {
      vivo = false;
    };
  }, [consulta]);

  // Veio do botão "Relatório (PDF)": abre a janela de impressão quando a folha
  // já está desenhada (um quadro depois do estado chegar).
  React.useEffect(() => {
    if (!dados || !imprimirAoAbrir || jaImprimiu.current) return;
    jaImprimiu.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [dados, imprimirAoAbrir]);

  const voltar = `/negocios`;

  return (
    <div className="relatorio-tela flex min-h-full flex-col gap-4 p-4 sm:p-6 print:block print:p-0">
      <style>{ESTILO_DE_IMPRESSAO}</style>

      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={voltar}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3 text-[12.5px] font-medium text-text-secondary outline-none transition-colors hover:border-border-default hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
          >
            <ArrowLeft size={14} aria-hidden /> Voltar
          </Link>
          <div>
            <h1 className="font-display text-[17px] font-semibold text-text-primary">Prévia do relatório</h1>
            <p className="text-[12px] text-text-tertiary">
              Na janela de impressão, escolha <strong className="text-text-secondary">Salvar como PDF</strong> como destino. A folha já sai em A4 deitado.
            </p>
          </div>
        </div>
        <Button onClick={() => window.print()} disabled={!dados} className="h-9 rounded-lg px-3.5 text-[13px]">
          <Printer size={15} aria-hidden /> Imprimir / salvar PDF
        </Button>
      </header>

      {erro ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger print:hidden">
          {erro}
        </p>
      ) : !dados ? (
        <div className="flex items-center gap-2 px-1 text-[13px] text-text-tertiary print:hidden" aria-busy="true">
          <Loader2 size={15} className="animate-spin" aria-hidden /> Montando o relatório...
        </div>
      ) : (
        <Documento dados={dados} />
      )}
    </div>
  );
}

function Documento({ dados }: { dados: DadosDoRelatorio }) {
  const agora = React.useMemo(() => new Date(dados.geradoEm), [dados.geradoEm]);
  const defsPorChave = React.useMemo(() => new Map(dados.fields.map((d) => [d.key, d])), [dados.fields]);

  // Os campos que o funil escolheu mostrar (cartão primeiro, depois a prévia).
  const campos = React.useMemo(() => {
    const vistos = new Set<string>();
    const out: DefinicaoDeCampo[] = [];
    for (const c of [...dados.layout.campos, ...dados.layout.previa]) {
      if (!c.startsWith("cf:")) continue;
      const def = defsPorChave.get(c.slice(3));
      if (!def || vistos.has(def.key)) continue;
      vistos.add(def.key);
      out.push(def);
    }
    return out;
  }, [dados.layout, defsPorChave]);
  const camposNaTabela = campos.slice(0, MAX_CAMPOS_NO_RELATORIO);

  const negociosPorEtapa = React.useMemo(() => {
    const m = new Map<string, NegocioParaExportar[]>();
    for (const n of ordenarPorEtapa(dados.etapas, dados.negocios)) {
      const lista = m.get(n.stageId) ?? [];
      lista.push(n);
      m.set(n.stageId, lista);
    }
    return m;
  }, [dados.etapas, dados.negocios]);

  const etapas = [...dados.etapas].sort((a, b) => a.position - b.position);
  const total = dados.negocios.length;
  const filtros = [
    dados.filtros.busca ? `Busca: “${dados.filtros.busca}”` : null,
    dados.filtros.dono ? `Responsável: ${dados.filtros.dono === "__sem" ? "sem responsável" : nomeDoDono(dados.negocios, dados.filtros.dono)}` : null,
    dados.filtros.visao ? `Visão: ${ROTULO_DA_VISAO[dados.filtros.visao] ?? dados.filtros.visao}` : null,
    dados.filtros.arquivados ? "Inclui arquivados" : null,
  ].filter(Boolean) as string[];
  const maiorConversao = Math.max(1, ...dados.conversao.map((c) => c.quantidade));

  return (
    <article className="relatorio-folha mx-auto w-full max-w-[297mm] bg-white text-[10.5pt] leading-snug text-zinc-900 shadow-2xl ring-1 ring-black/10 print:max-w-none print:shadow-none print:ring-0">
      {/* ── Capa ───────────────────────────────────────────────── */}
      <section className="relatorio-capa px-[14mm] py-[12mm] print:p-0">
        <p className="text-[9pt] font-semibold uppercase tracking-[0.12em] text-zinc-500">{dados.organizacao || "Relatório"}</p>
        <h1 className="mt-1 font-display text-[22pt] font-bold leading-tight text-zinc-950">Funil {dados.funil.name}</h1>
        <p className="mt-1 text-[10pt] text-zinc-600">
          Gerado em {dataHoraBR(agora)} · {total.toLocaleString("pt-BR")} {total === 1 ? "negócio" : "negócios"}
          {filtros.length > 0 && <> · {filtros.join(" · ")}</>}
        </p>
        {dados.aviso && <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-[9.5pt] text-amber-900">{dados.aviso}</p>}

        <dl className="mt-6 grid grid-cols-5 gap-3">
          <Indicador rotulo="Em aberto" valor={reais(dados.resumo.abertoCents)} detalhe={`${dados.resumo.abertos.toLocaleString("pt-BR")} negócio(s)`} />
          <Indicador rotulo="Ponderado" valor={reais(dados.resumo.ponderadoCents)} detalhe="valor × chance de fechar" />
          <Indicador
            rotulo={`Ganho em ${dados.dias} dias`}
            valor={reais(dados.resumo.ganhoCents)}
            detalhe={`${dados.resumo.ganhos.toLocaleString("pt-BR")} negócio(s)`}
          />
          <Indicador rotulo="Taxa de ganho" valor={pct(dados.resumo.taxaDeGanho)} detalhe={`fechados em ${dados.dias} dias`} />
          <Indicador
            rotulo="Ciclo de venda"
            valor={dados.resumo.cicloDeVenda === null ? "—" : `${dados.resumo.cicloDeVenda.toLocaleString("pt-BR")} dias`}
            detalhe="mediana, da criação ao ganho"
          />
        </dl>

        {dados.conversao.length > 0 && (
          <div className="relatorio-bloco mt-7">
            <h2 className="text-[11pt] font-semibold text-zinc-950">Conversão por etapa</h2>
            <p className="text-[9pt] text-zinc-500">Negócios criados nos últimos {dados.dias} dias e até onde chegaram.</p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {dados.conversao.map((c, i) => (
                <div key={c.etapaId} className="grid grid-cols-[42mm_1fr_34mm] items-center gap-3 text-[9.5pt]">
                  <span className="truncate text-zinc-700">{c.nome}</span>
                  <div className="h-[5mm] rounded bg-zinc-100">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.max(2, (c.quantidade / maiorConversao) * 100)}%`,
                        background: i === dados.conversao.length - 1 ? "#10b981" : "#5b8def",
                      }}
                    />
                  </div>
                  <span className="text-right tabular-nums">
                    <strong>{c.quantidade.toLocaleString("pt-BR")}</strong>
                    <span className="ml-1.5 text-zinc-500">{i === 0 ? "início" : `${pct(c.taxaDaAnterior)} da anterior`}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relatorio-bloco mt-7">
          <h2 className="text-[11pt] font-semibold text-zinc-950">Resumo por etapa</h2>
          <table className="relatorio-tabela mt-2 w-full border-collapse text-[9.5pt]">
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Situação</th>
                <th className="text-right">Negócios</th>
                <th className="text-right">Valor</th>
                <th className="text-right">Ponderado</th>
              </tr>
            </thead>
            <tbody>
              {etapas.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.name}</td>
                  <td>{situacaoDaEtapa(e.type)}</td>
                  <td className="text-right tabular-nums">{e.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="text-right tabular-nums">{reais(e.totalCents)}</td>
                  <td className="text-right tabular-nums">{e.type === "open" ? reais(e.ponderadoCents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {campos.length > MAX_CAMPOS_NO_RELATORIO && (
            <p className="mt-2 text-[8.5pt] text-zinc-500">
              As tabelas mostram {MAX_CAMPOS_NO_RELATORIO} dos {campos.length} campos personalizados do cartão. A planilha (CSV) traz todos.
            </p>
          )}
        </div>
      </section>

      {/* ── Uma seção por etapa ─────────────────────────────────── */}
      {etapas.map((e) => (
        <SecaoDaEtapa
          key={e.id}
          etapa={e}
          negocios={negociosPorEtapa.get(e.id) ?? []}
          campos={camposNaTabela}
          agora={agora}
        />
      ))}
    </article>
  );
}

function nomeDoDono(negocios: NegocioParaExportar[], id: string): string {
  return negocios.find((n) => n.owner?.id === id)?.owner?.name || "selecionado";
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-md border border-zinc-200 px-3 py-2.5">
      <dt className="text-[8.5pt] font-medium uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd className="mt-0.5 text-[14pt] font-semibold tabular-nums text-zinc-950">{valor}</dd>
      <dd className="text-[8.5pt] text-zinc-500">{detalhe}</dd>
    </div>
  );
}

function SecaoDaEtapa({
  etapa,
  negocios,
  campos,
  agora,
}: {
  etapa: EtapaDoRelatorio;
  negocios: NegocioParaExportar[];
  campos: DefinicaoDeCampo[];
  agora: Date;
}) {
  const aberta = etapa.type === "open";
  const perdida = etapa.type === "lost";

  return (
    <section className="relatorio-etapa border-t border-zinc-200 px-[14mm] py-[10mm] print:border-0 print:p-0">
      <header className="flex items-baseline justify-between gap-4 border-b-2 border-zinc-900 pb-1.5">
        <h2 className="text-[14pt] font-bold text-zinc-950">
          {etapa.name} <span className="ml-1 text-[10pt] font-medium text-zinc-500">{situacaoDaEtapa(etapa.type)}</span>
        </h2>
        <p className="text-[10pt] tabular-nums text-zinc-700">
          <strong>{etapa.quantidade.toLocaleString("pt-BR")}</strong> {etapa.quantidade === 1 ? "negócio" : "negócios"} ·{" "}
          <strong>{reais(etapa.totalCents)}</strong>
          {aberta && <> · ponderado {reais(etapa.ponderadoCents)}</>}
        </p>
      </header>

      {negocios.length === 0 ? (
        <p className="py-4 text-[9.5pt] text-zinc-500">Nenhum negócio nesta etapa.</p>
      ) : (
        <table className="relatorio-tabela mt-2 w-full border-collapse text-[8.5pt]">
          <thead>
            <tr>
              <th>Negócio</th>
              <th>Contato</th>
              <th>Responsável</th>
              <th className="text-right">Valor</th>
              <th className="text-right">Chance</th>
              <th>Previsão</th>
              <th>{aberta ? "Na etapa" : "Fechado em"}</th>
              <th>{perdida ? "Motivo da perda" : "Próxima tarefa"}</th>
              {campos.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {negocios.map((n) => {
              const contato = n.contacts[0];
              const dias = diasNaEtapa(n, agora);
              return (
                <tr key={n.id}>
                  <td>
                    <span className="font-medium text-zinc-950">{n.name}</span>
                    {n.company && <span className="block text-zinc-500">{n.company.name}</span>}
                  </td>
                  <td>
                    {contato ? (
                      <>
                        {contato.name || "Sem nome"}
                        {(contato.phone || contato.email) && <span className="block text-zinc-500">{contato.phone || contato.email}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{n.owner?.name || "—"}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{reais(n.amountCents)}</td>
                  <td className="text-right tabular-nums">{n.probability}%</td>
                  <td className="whitespace-nowrap">{diaSemFusoBR(n.expectedClosingAt) || "—"}</td>
                  <td className="whitespace-nowrap">
                    {aberta ? `${dias} ${dias === 1 ? "dia" : "dias"}` : dataBR(n.closedAt) || "—"}
                  </td>
                  <td>
                    {perdida ? (
                      n.lostReason || "—"
                    ) : n.nextTask ? (
                      <>
                        {descreverTarefa(n.nextTask)}
                        {n.nextTask.dueAt && <span className="block text-zinc-500">{dataHoraBR(n.nextTask.dueAt)}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  {campos.map((c) => (
                    <td key={c.key}>{formatarValor(c, n.customFields?.[c.key]) || "—"}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// Regras só desta página: folha A4 deitada, uma etapa por página, linha de
// tabela nunca partida ao meio e cabeçalho repetido quando a tabela continua.
// O número da página vai na margem (Chrome e Edge; outros navegadores ignoram).
const ESTILO_DE_IMPRESSAO = `
.relatorio-tabela th {
  text-align: left;
  font-weight: 600;
  color: #52525b;
  border-bottom: 1px solid #a1a1aa;
  padding: 4px 6px;
  font-size: 0.92em;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.relatorio-tabela th.text-right { text-align: right; }
.relatorio-tabela td {
  border-bottom: 1px solid #e4e4e7;
  padding: 4px 6px;
  vertical-align: top;
}
.relatorio-tabela tbody tr:nth-child(even) td { background: #fafafa; }
@media print {
  @page {
    size: A4 landscape;
    margin: 12mm 12mm 14mm;
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8pt; color: #71717a; }
    @bottom-left { content: "Eva Studio"; font-size: 8pt; color: #a1a1aa; }
  }
  .relatorio-tela { background: #fff !important; }
  .relatorio-folha { font-size: 9.5pt; }
  .relatorio-etapa { break-before: page; }
  .relatorio-etapa > header { break-after: avoid; }
  .relatorio-bloco { break-inside: avoid; }
  .relatorio-tabela thead { display: table-header-group; }
  .relatorio-tabela tr { break-inside: avoid; }
}
`;
