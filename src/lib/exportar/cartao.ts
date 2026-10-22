// ---------------------------------------------------------------------------
// CSV dos cartões do dashboard.
//
// Cada cartão vira uma tabelinha com o que ele desenha: o número, os pontos da
// linha, as fatias da pizza, as etapas do funil ou as linhas da tabela. O
// "Todos os cartões" junta tudo num arquivo só, uma seção por cartão (título,
// cabeçalho, linhas e uma linha em branco).
// ---------------------------------------------------------------------------

import { formatarResultado, type ResultadoDeConsulta } from "@/lib/consulta";
import { dataBR, montarCsv, numeroCsv, reais, reaisCsv, type Celula } from "@/lib/exportar/csv";

export interface TabelaDoCartao {
  cabecalho: string[];
  linhas: Celula[][];
}

export type FormatoDaFonte = "dinheiro" | "inteiro" | "porcento" | "dias";

/** O que a fonte fixa precisa para virar tabela (subconjunto do que o painel recebe). */
export interface DadosDasFontes {
  numeros: Record<string, number | null>;
  series: Record<string, { label: string; value: number }[]>;
  quebras: Record<string, { label: string; value: number }[]>;
  tabelas: Record<
    string,
    { quando: string | null; titulo: string; contato: string; responsavel: string; valorCents: number; etapa?: string }[]
  >;
  funis: Record<string, { nome: string; quantidade: number; taxaDaAnterior: number; taxaDoInicio: number }[]>;
}

export interface FonteDoCartao {
  chave: string;
  tipo: "numero" | "serie" | "quebra" | "tabela" | "funil";
  formato?: FormatoDaFonte;
}

/** O número de uma fonte fixa como texto (igual ao cartão). Dinheiro vem em centavos. */
export function formatarNumeroDaFonte(valor: number | null, formato?: FormatoDaFonte): string {
  if (valor === null || valor === undefined) return "";
  if (formato === "dinheiro") return reais(valor);
  if (formato === "porcento") return `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (formato === "dias") return `${valor.toLocaleString("pt-BR")} ${valor === 1 ? "dia" : "dias"}`;
  return valor.toLocaleString("pt-BR");
}

/** O mesmo número só como número (dinheiro em reais, porcentagem em %). */
function numeroDaFonte(valor: number | null, formato?: FormatoDaFonte): string {
  if (valor === null || valor === undefined) return "";
  if (formato === "dinheiro") return reaisCsv(valor);
  if (formato === "porcento") return numeroCsv(Math.round(valor * 1000) / 10);
  return numeroCsv(valor);
}

const semEspacoFixo = (t: string) => t.replace(/\u00a0/g, " ");
const pct = (v: number) => numeroCsv(Math.round(v * 1000) / 10);

/** Cartão de fonte fixa (o catálogo do painel). `rotular` traduz rótulos de canal etc. */
export function tabelaDaFonte(
  fonte: FonteDoCartao,
  dados: DadosDasFontes,
  rotular: (label: string) => string = (l) => l
): TabelaDoCartao {
  const chave = fonte.chave;
  switch (fonte.tipo) {
    case "numero": {
      const v = dados.numeros[chave] ?? null;
      return {
        cabecalho: ["Valor", fonte.formato === "porcento" ? "Valor (%)" : "Valor (número)"],
        linhas: [[formatarNumeroDaFonte(v, fonte.formato), numeroDaFonte(v, fonte.formato)]],
      };
    }
    case "serie":
      return {
        cabecalho: ["Período", "Valor"],
        linhas: (dados.series[chave] ?? []).map((p) => [p.label, p.value]),
      };
    case "quebra":
      return {
        cabecalho: ["Rótulo", fonte.formato === "dias" ? "Dias" : "Valor"],
        linhas: (dados.quebras[chave] ?? []).map((p) => [rotular(p.label), p.value]),
      };
    case "funil":
      return {
        cabecalho: ["Etapa", "Negócios", "% da anterior", "% do início"],
        linhas: (dados.funis[chave] ?? []).map((e, i) => [e.nome, e.quantidade, i === 0 ? "" : pct(e.taxaDaAnterior), pct(e.taxaDoInicio)]),
      };
    case "tabela": {
      const linhas = dados.tabelas[chave] ?? [];
      const porEtapa = linhas.some((l) => l.etapa !== undefined);
      return {
        cabecalho: [porEtapa ? "Parado desde" : "Quando", "Negócio", porEtapa ? "Etapa" : "Contato", "Responsável", "Valor", "Valor (número)"],
        linhas: linhas.map((l) => [
          dataBR(l.quando),
          l.titulo,
          porEtapa ? l.etapa ?? "" : l.contato,
          l.responsavel,
          reais(l.valorCents),
          reaisCsv(l.valorCents),
        ]),
      };
    }
  }
}

/** Cartão montado pela pessoa (resultado do /api/analytics/consulta). */
export function tabelaDoResultado(r: ResultadoDeConsulta): TabelaDoCartao {
  if (r.tipo === "numero") {
    const comparando = r.anterior !== undefined;
    const numero = (v: number | null | undefined) =>
      v === null || v === undefined ? "" : r.formato === "porcento" ? numeroCsv(Math.round(v * 1000) / 10) : numeroCsv(v);
    return {
      cabecalho: [
        "Valor",
        r.formato === "porcento" ? "Valor (%)" : "Valor (número)",
        "Negócios considerados",
        ...(comparando ? ["Período anterior", "Variação %"] : []),
      ],
      linhas: [
        [
          r.valor === null ? "" : semEspacoFixo(formatarResultado(r.valor, r.formato)),
          numero(r.valor),
          r.negocios,
          ...(comparando
            ? [numero(r.anterior), r.variacao === null || r.variacao === undefined ? "" : pct(r.variacao)]
            : []),
        ],
      ],
    };
  }
  if (r.tipo === "pontos") {
    return {
      cabecalho: ["Rótulo", "Valor", r.formato === "porcento" ? "Valor (%)" : "Valor (número)"],
      linhas: r.pontos.map((p) => [
        p.label,
        semEspacoFixo(formatarResultado(p.value, r.formato)),
        r.formato === "porcento" ? numeroCsv(Math.round(p.value * 1000) / 10) : numeroCsv(p.value),
      ]),
    };
  }
  return {
    cabecalho: ["Negócio", "Etapa", "Responsável", "Quando", "Valor", "Valor (número)"],
    linhas: r.linhas.map((l) => [l.titulo, l.etapa, l.responsavel, dataBR(l.quando), reais(l.valorCents), reaisCsv(l.valorCents)]),
  };
}

/** O CSV de um cartão só. */
export function csvDoCartao(t: TabelaDoCartao): string {
  return montarCsv([t.cabecalho, ...t.linhas]);
}

export interface SecaoDoCartao {
  titulo: string;
  tabela: TabelaDoCartao | null;
  /** Por que não há dados (fonte removida, erro ao calcular). */
  erro?: string;
}

/** Todos os cartões num arquivo: as linhas do topo (período, filtros) e uma seção por cartão. */
export function csvDeTodosOsCartoes(topo: Celula[][], secoes: SecaoDoCartao[]): string {
  const linhas: Celula[][] = [...topo];
  if (topo.length) linhas.push([]);
  for (const s of secoes) {
    linhas.push([`Cartão: ${s.titulo}`]);
    if (!s.tabela) linhas.push([s.erro ?? "Sem dados."]);
    else if (s.tabela.linhas.length === 0) linhas.push(s.tabela.cabecalho, ["Sem dados no período."]);
    else linhas.push(s.tabela.cabecalho, ...s.tabela.linhas);
    linhas.push([]);
  }
  return montarCsv(linhas);
}

/** Dispara o download de um texto no navegador (sem dependência nova). */
export function baixarArquivo(conteudo: string, arquivo: string, tipo = "text/csv;charset=utf-8") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
