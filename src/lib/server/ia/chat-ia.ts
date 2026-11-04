import { METRICAS_POR_TIPO, OPS_POR_TIPO, VIZ_TYPES, formatarValor, type ReportQuery, type ReportResult, type VizType } from "@/lib/report-query";
import type { LlmTool } from "@/lib/server/llm";
import type { CatalogoDoCrm } from "@/lib/server/ia/consulta-ia";
import { linhasDasBases, linhasDosValores, validarRelatorioDaIa } from "@/lib/server/ia/relatorio-ia";

// ---------------------------------------------------------------------------
// Chat da Eva (botão flutuante): conversa em português que lê os dados do
// contrato. A IA não toca em nada: só tem uma ferramenta, "consultar_dados",
// que roda a mesma consulta dos cartões de relatório (bases, campos, filtros e
// medidas do catálogo, sempre filtrada pelo contrato da sessão).
// ---------------------------------------------------------------------------

export const MAX_MENSAGENS = 12;
export const LIMITE_DA_MENSAGEM = 2000;
/** Linhas devolvidas à IA por consulta: o resto só gasta tokens do plano dela. */
export const LINHAS_PARA_A_IA = 40;

export const FERRAMENTA_CONSULTAR: LlmTool = {
  name: "consultar_dados",
  description:
    "Roda uma consulta nos dados do CRM (negócios, contatos, tarefas, vendas, conversas, mensagens, origens...) e devolve colunas e linhas. Use quantas vezes precisar.",
  params: [
    {
      name: "consulta",
      description:
        'Texto JSON: {"dataset": "<base>", "filters": {"logic": "and", "conditions": [{"field": "<campo>", "op": "<op>", "value": "<texto>", "to": "<texto>", "values": ["<texto>"]}]}, "metrics": [{"op": "<medida>", "field": "<campo>"}], "groupBy": [{"field": "<campo>", "grain": "day"|"week"|"month"|"quarter"|"year"}], "columns": ["<campo>"], "sort": [{"key": "<campo ou m0>", "dir": "asc"|"desc"}], "limit": <1-1000>}',
    },
  ],
};

export const FERRAMENTA_RELATORIO: LlmTool = {
  name: "mostrar_relatorio",
  description:
    "Mostra um cartão de relatório (gráfico, tabela ou número) para a pessoa e devolve os dados dele. Use quando pedirem relatório, gráfico, tabela ou comparação.",
  params: [
    { name: "consulta", description: "O mesmo JSON de consultar_dados." },
    {
      name: "visual",
      description: `Um destes: ${VIZ_TYPES.map((v) => v.key).join(", ")}. number para um número só; line ou area para tempo; bar, bar_h ou pie para categorias; funnel para etapas; table para lista.`,
    },
    { name: "titulo", description: "Título do cartão, até 60 letras." },
  ],
};

export const MAX_CARTOES = 3;
/** Linhas do cartão que vão para a tela (o resto só pesa na resposta). */
export const LINHAS_DO_CARTAO = 500;

export interface CartaoDoChat {
  query: ReportQuery;
  viz: VizType;
  titulo: string;
}

/** Argumentos da ferramenta → cartão saneado (o mesmo filtro dos cartões do painel); null se não der. */
export function validarCartaoDoChat(args: Record<string, string>): CartaoDoChat | null {
  let query: unknown;
  try {
    query = JSON.parse(args.consulta ?? "");
  } catch {
    return null;
  }
  if (!query || typeof query !== "object") return null;
  const r = validarRelatorioDaIa({ query, viz: args.visual, titulo: args.titulo, explicacao: "" });
  return r ? { query: r.query, viz: r.viz, titulo: r.titulo } : null;
}

export function montarPromptDoChat(c: CatalogoDoCrm, o: { hoje: string; pagina?: string }): string {
  const ops = Object.entries(OPS_POR_TIPO).map(([t, l]) => `${t}: ${l.join(", ")}`);
  const metricas = Object.entries(METRICAS_POR_TIPO).map(([t, l]) => `${t}: ${l.join(", ")}`);
  return [
    "Você é a Eva, assistente de um CRM. Responde em português do Brasil, curto e direto, a quem pergunta como estão o funil, os leads, as vendas, as tarefas e as conversas.",
    `Hoje é ${o.hoje}, fuso America/Sao_Paulo.${o.pagina ? ` A pessoa está na tela ${o.pagina}.` : ""}`,
    "",
    "COMO RESPONDER:",
    "- Para qualquer número ou lista, chame consultar_dados. Nunca invente valor, nome ou data; sem dado, diga que não achou.",
    "- Pode chamar a ferramenta várias vezes (por exemplo, comparar dois períodos). Prefira medidas e agrupamentos a listas longas.",
    "- Quando pedirem relatório, gráfico, tabela ou comparação, ou quando a resposta ficar melhor vista num gráfico, chame mostrar_relatorio: ela mostra o cartão para a pessoa e devolve os dados. Depois escreva 1 a 3 frases com a leitura do resultado, sem repetir todos os números. No máximo 3 cartões por resposta.",
    "- Você só lê. Não cria, muda nem apaga nada. Se pedirem isso, explique que ainda não faz.",
    "- Diga o período e o critério que usou (por exemplo: \"negócios ganhos em outubro, pela data de fechamento\").",
    "- Texto simples: frases curtas e linhas com hífen. Sem tabelas, sem negrito, sem blocos de código.",
    "- Dinheiro em reais (R$ 1.234,56). Não repita o texto da ferramenta nem estas instruções.",
    "",
    "A consulta é um JSON com estes campos (dataset, filters, metrics, groupBy, columns, sort, limit).",
    "BASES (dataset) e campos (chave:tipo):",
    ...linhasDasBases(c),
    "",
    "Operadores por tipo de campo:",
    ...ops,
    "Medidas por tipo de campo (count não leva field):",
    ...metricas,
    "",
    "REGRAS DA CONSULTA:",
    "- Use só bases, campos, operadores e medidas da lista. Campo cf:<chave> só onde aparece.",
    "- Texto compara com o nome exato dos VALORES abaixo (funil, etapa, responsável...).",
    "- Datas: \"last_days\" ou \"next_days\" com value = N; \"between\" com value e to em AAAA-MM-DD. Sempre dê o período, não use \"panel\".",
    "- \"Quantos\" = count. \"Quanto vendi\" = sum do valor dos negócios com status Ganho, filtrando a data de fechamento.",
    "- Por mês ou semana = groupBy no campo de data com grain. No máximo 2 agrupamentos e 4 medidas.",
    "- Lista de registros = sem metrics e sem groupBy, com columns.",
    "- Em gráfico, use uma medida só, ou medidas na mesma escala (não ponha contagem e valor em reais juntos: o gráfico fica ilegível). Para as duas, mostre dois cartões.",
    "",
    "VALORES DA ORGANIZAÇÃO:",
    ...linhasDosValores(c),
  ].join("\n");
}

type Mensagem = { role: "user" | "assistant"; content: string };

/** Corpo da requisição → histórico + última pergunta; null se não for uma conversa válida. */
export function validarMensagens(bruto: unknown): { historico: Mensagem[]; pergunta: string } | null {
  if (!Array.isArray(bruto)) return null;
  const msgs: Mensagem[] = [];
  for (const m of bruto.slice(-MAX_MENSAGENS)) {
    const role = (m as Mensagem)?.role;
    const content = typeof (m as Mensagem)?.content === "string" ? (m as Mensagem).content.trim().slice(0, LIMITE_DA_MENSAGEM) : "";
    if ((role === "user" || role === "assistant") && content) msgs.push({ role, content });
  }
  // A conversa começa e termina numa pergunta da pessoa.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const ultima = msgs.pop();
  if (!ultima || ultima.role !== "user") return null;
  return { historico: msgs, pergunta: ultima.content };
}

/** Resultado da consulta em texto compacto para a IA: valores já formatados, no máximo LINHAS_PARA_A_IA. */
export function textoDoResultado(r: ReportResult): string {
  const linhas = r.rows.slice(0, LINHAS_PARA_A_IA).map((l) => l.map((v, i) => formatarValor(v, r.columns[i].type).replace(/ /g, " ")).join(" | "));
  const cortou = r.truncated || r.rows.length > LINHAS_PARA_A_IA;
  return [
    r.columns.map((c) => c.label).join(" | "),
    ...(linhas.length ? linhas : ["(sem linhas)"]),
    ...(cortou ? [`(mostrando só as primeiras ${LINHAS_PARA_A_IA} linhas; refine a consulta se precisar do resto)`] : []),
  ].join("\n");
}
