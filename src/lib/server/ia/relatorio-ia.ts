import {
  DATASETS,
  GRAIN_LABEL,
  METRICAS_POR_TIPO,
  OPS_POR_TIPO,
  VIZ_TYPES,
  camposDoDataset,
  sanearRelatorio,
  type ReportQuery,
  type VizType,
} from "@/lib/report-query";
import { ROTULO_CANAL } from "@/lib/consulta";
import type { CatalogoDoCrm } from "@/lib/server/ia/consulta-ia";

// ---------------------------------------------------------------------------
// "Pergunte à Eva" do construtor v2: frase em português → ReportQuery + visual.
// O modelo só escolhe entre as bases e campos do catálogo; a resposta passa
// por sanearRelatorio, o mesmo filtro do que a tela salva.
// ---------------------------------------------------------------------------

export interface RelatorioDaIa {
  query: ReportQuery;
  viz: VizType;
  meta?: number;
  titulo: string;
  explicacao: string;
}

/** Campos personalizados que a IA conhece: só os de negócio (o catálogo só carrega esses). */
const personalizadosDa = (dataset: string, c: CatalogoDoCrm) =>
  DATASETS.find((d) => d.key === dataset)?.customFields === "deal"
    ? c.campos.map((x) => ({ key: x.key, label: x.label, type: x.type, options: x.options ?? [] }))
    : [];

function linhasDasBases(c: CatalogoDoCrm): string[] {
  return DATASETS.map((d) => {
    const campos = camposDoDataset(d.key, personalizadosDa(d.key, c))
      .map((f) => `${f.key}:${f.type}`)
      .join(", ");
    return `- ${d.key} (${d.label}: ${d.description}) campos: ${campos}`;
  });
}

function linhasDosValores(c: CatalogoDoCrm): string[] {
  const nomes = (l: { name: string }[]) => l.map((x) => x.name).join(" | ") || "(nenhum)";
  return [
    `Funis: ${nomes(c.funis)}`,
    ...c.funis.map((f) => `Etapas de ${f.name}: ${nomes(f.stages)}`),
    `Responsáveis: ${nomes(c.membros)}`,
    `Motivos de perda: ${c.motivosDePerda.join(" | ") || "(nenhum)"}`,
    `Canais: ${c.canais.map((k) => ROTULO_CANAL[k] ?? k).join(" | ") || "(nenhum)"}`,
    `Situação do negócio (status): Em aberto | Ganho | Perdido`,
  ];
}

export function montarPromptDeRelatorio(c: CatalogoDoCrm, o: { hoje: string; atual?: unknown }): string {
  const ops = Object.entries(OPS_POR_TIPO).map(([t, l]) => `${t}: ${l.join(", ")}`);
  const metricas = Object.entries(METRICAS_POR_TIPO).map(([t, l]) => `${t}: ${l.join(", ")}`);
  const partes = [
    "Você é a Eva, assistente de um CRM. Transforme o pedido da pessoa, em português, num cartão de painel.",
    `Hoje é ${o.hoje}, fuso America/Sao_Paulo.`,
    "",
    "Responda SÓ um JSON, sem markdown:",
    `{"query": {"dataset": "<base>", "filters": {"logic": "and"|"or", "conditions": [{"field": "<campo>", "op": "<op>", "value": "<texto>", "to": "<texto>", "values": ["<texto>"]}]}, "metrics": [{"op": "<medida>", "field": "<campo>"}], "groupBy": [{"field": "<campo>", "grain": "day"|"week"|"month"|"quarter"|"year"}], "columns": ["<campo>"], "sort": [{"key": "<campo ou m0>", "dir": "asc"|"desc"}], "limit": <1-1000>}, "viz": "<visual>", "titulo": "<até 60 letras>", "explicacao": "<uma frase do que o cartão mostra>"}`,
    "",
    "BASES (dataset) e campos (chave:tipo):",
    ...linhasDasBases(c),
    "",
    "Operadores por tipo de campo:",
    ...ops,
    "Medidas por tipo de campo (count não leva field):",
    ...metricas,
    `Visuais: ${VIZ_TYPES.map((v) => v.key).join(", ")}. Granularidade de data: ${Object.keys(GRAIN_LABEL).join(", ")}.`,
    "",
    "REGRAS:",
    "- Use só bases, campos, operadores e medidas da lista. Campo cf:<chave> só onde aparece.",
    "- Texto compara com o nome exato que aparece nos VALORES abaixo (funil, etapa, responsável...).",
    "- Datas: \"panel\" = período escolhido no painel (use quando o pedido não citar período); \"last_days\"/\"next_days\" com value = N; \"between\" com value e to em AAAA-MM-DD.",
    "- Dinheiro em reais, número puro: \"10 mil\" = \"10000\".",
    "- \"Quantos\" = count. \"Quanto vendi\" = sum do valor dos negócios com status Ganho, filtrando a data de fechamento.",
    "- \"Por mês/semana\" = groupBy no campo de data com grain. \"Por <campo>\" = groupBy nesse campo. No máximo 2 agrupamentos e 4 medidas.",
    "- Lista de registros (\"quais\", \"liste\") = sem metrics e sem groupBy, com columns, viz \"table\".",
    "- Visual: number para um número só; line ou area para tempo; bar, bar_h ou pie para categorias; funnel para etapas; table para lista.",
    "",
    "VALORES DA ORGANIZAÇÃO:",
    ...linhasDosValores(c),
  ];
  if (o.atual) {
    partes.push("", "CARTÃO ATUAL (se o pedido for um ajuste, parta dele; se for novo, ignore):", JSON.stringify(o.atual));
  }
  return partes.join("\n");
}

const textoCurto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Resposta do modelo → cartão saneado; null se não deu para aproveitar. */
export function validarRelatorioDaIa(resposta: Record<string, unknown>): RelatorioDaIa | null {
  const q = resposta.query && typeof resposta.query === "object" ? { v: 2, ...(resposta.query as object) } : null;
  const r = sanearRelatorio({ query: q, viz: resposta.viz, meta: resposta.meta });
  if (!r) return null;
  return {
    ...r,
    titulo: textoCurto(resposta.titulo, 60) || DATASETS.find((d) => d.key === r.query.dataset)!.label,
    explicacao: textoCurto(resposta.explicacao, 240),
  };
}
