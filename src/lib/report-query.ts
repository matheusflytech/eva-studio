// ---------------------------------------------------------------------------
// Construtor de cartões (v2): a pessoa escolhe uma base de dados (Negócios,
// Negócios ↔ Tarefas, Mensagens...), os campos, filtros, como resumir,
// ordenar e limitar. Sem SQL livre: só bases e campos deste catálogo, e o
// servidor monta a consulta (src/lib/server/report-sql.ts). Sem "server-only"
// porque a tela usa o mesmo catálogo e o mesmo saneamento.
// ---------------------------------------------------------------------------

export type FieldType = "text" | "number" | "money" | "date" | "bool";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Sigla de UF: dá para pintar no mapa do Brasil. */
  geo?: "uf";
}

export interface DatasetDef {
  key: string;
  label: string;
  /** Uma linha: o que cada linha da base é. */
  description: string;
  group: "CRM" | "Relações" | "Vendas" | "Atendimento" | "Equipe";
  fields: FieldDef[];
  /** Campos personalizados que entram com o prefixo "cf:" (de que entidade). */
  customFields?: "deal" | "contact";
  /** Colunas da tabela crua quando a pessoa não escolheu (senão, os 6 primeiros campos). */
  defaultColumns?: string[];
}

const f = (key: string, label: string, type: FieldType = "text"): FieldDef => ({ key, label, type });

// Campos repetidos entre bases que juntam negócio com outra coisa.
const CAMPOS_DO_NEGOCIO: FieldDef[] = [
  f("deal_name", "Negócio"),
  f("deal_pipeline", "Funil"),
  f("deal_stage", "Etapa"),
  f("deal_status", "Situação do negócio"),
  f("deal_owner", "Responsável pelo negócio"),
  f("deal_amount", "Valor do negócio", "money"),
  f("deal_created", "Negócio criado em", "date"),
  f("deal_closed", "Negócio fechado em", "date"),
];

export const DATASETS: DatasetDef[] = [
  {
    key: "deals",
    label: "Negócios",
    description: "Cada linha é um negócio.",
    group: "CRM",
    customFields: "deal",
    fields: [
      f("name", "Nome"),
      f("pipeline", "Funil"),
      f("stage", "Etapa"),
      f("status", "Situação"),
      f("owner", "Responsável"),
      f("company", "Empresa"),
      f("category", "Categoria"),
      f("amount", "Valor", "money"),
      f("weighted", "Valor ponderado", "money"),
      f("probability", "Probabilidade (%)", "number"),
      f("lost_reason", "Motivo da perda"),
      f("created", "Criado em", "date"),
      f("closed", "Fechado em", "date"),
      f("expected", "Previsão de fechamento", "date"),
      f("days_in_stage", "Dias na etapa", "number"),
    ],
  },
  {
    key: "contacts",
    label: "Contatos",
    description: "Cada linha é um contato.",
    group: "CRM",
    customFields: "contact",
    fields: [
      f("name", "Nome"),
      f("email", "E-mail"),
      f("phone", "Telefone"),
      f("ddd", "DDD"),
      { ...f("ddd_uf", "UF (pelo DDD)"), geo: "uf" },
      f("job_title", "Cargo"),
      f("company", "Empresa"),
      f("owner", "Responsável"),
      f("source", "Origem"),
      f("lead_stage", "Estágio do lead"),
      f("lead_channel", "Canal do lead"),
      f("opt_in", "Aceita mensagens", "bool"),
      f("created", "Criado em", "date"),
      f("lead_at", "Virou lead em", "date"),
      f("last_seen", "Visto por último em", "date"),
    ],
  },
  {
    key: "companies",
    label: "Empresas",
    description: "Cada linha é uma empresa.",
    group: "CRM",
    fields: [
      f("name", "Nome"),
      f("cnpj", "CNPJ"),
      f("sector", "Setor"),
      f("size", "Funcionários", "number"),
      f("city", "Cidade"),
      { ...f("uf", "UF"), geo: "uf" },
      f("owner", "Responsável"),
      f("created", "Criada em", "date"),
    ],
  },
  {
    key: "tasks",
    label: "Tarefas",
    description: "Cada linha é uma tarefa.",
    group: "CRM",
    fields: [
      f("type", "Tipo"),
      f("text", "Descrição"),
      f("status", "Situação"),
      f("assignee", "Responsável"),
      f("due", "Vence em", "date"),
      f("done", "Concluída em", "date"),
      f("created", "Criada em", "date"),
    ],
  },
  {
    key: "products",
    label: "Produtos",
    description: "Cada linha é um produto do catálogo.",
    group: "CRM",
    fields: [
      f("name", "Nome"),
      f("sku", "SKU"),
      f("category", "Categoria"),
      f("price", "Preço", "money"),
      f("unit", "Unidade"),
      f("recurrence", "Recorrência"),
      f("archived", "Arquivado", "bool"),
      f("created", "Criado em", "date"),
    ],
  },
  {
    key: "deal_stage_events",
    label: "Transições de etapa",
    description: "Cada linha é uma mudança de etapa de um negócio.",
    group: "CRM",
    fields: [
      f("deal_name", "Negócio"),
      f("pipeline", "Funil"),
      f("from_stage", "De"),
      f("to_stage", "Para"),
      f("origin", "Quem mudou"),
      f("at", "Quando", "date"),
    ],
  },
  {
    key: "deal_losses",
    label: "Motivos de perda",
    description: "Cada linha é um negócio perdido, com o motivo.",
    group: "CRM",
    fields: [
      f("reason", "Motivo"),
      f("note", "Observação"),
      f("pipeline", "Funil"),
      f("deal_name", "Negócio"),
      f("deal_owner", "Responsável"),
      f("deal_amount", "Valor perdido", "money"),
      f("lost_at", "Perdido em", "date"),
    ],
  },
  {
    key: "deals_tasks",
    label: "Negócios ↔ Tarefas",
    description: "Cada linha é uma tarefa ligada a um negócio.",
    group: "Relações",
    defaultColumns: ["deal_name", "deal_stage", "task_type", "task_text", "task_status", "task_due"],
    fields: [
      ...CAMPOS_DO_NEGOCIO,
      f("task_type", "Tipo da tarefa"),
      f("task_text", "Tarefa"),
      f("task_status", "Situação da tarefa"),
      f("task_assignee", "Responsável pela tarefa"),
      f("task_due", "Tarefa vence em", "date"),
      f("task_done", "Tarefa concluída em", "date"),
    ],
  },
  {
    key: "deals_products",
    label: "Produtos ↔ Negócios",
    description: "Cada linha é um produto dentro de um negócio.",
    group: "Relações",
    defaultColumns: ["deal_name", "deal_status", "product", "quantity", "unit_price", "total"],
    fields: [
      ...CAMPOS_DO_NEGOCIO,
      f("product", "Produto"),
      f("sku", "SKU"),
      f("quantity", "Quantidade", "number"),
      f("unit_price", "Preço unitário", "money"),
      f("total", "Total do item", "money"),
      f("recurrence", "Recorrência"),
    ],
  },
  {
    key: "deals_contacts",
    label: "Negócios ↔ Contatos",
    description: "Cada linha é um contato ligado a um negócio.",
    group: "Relações",
    defaultColumns: ["deal_name", "deal_stage", "contact_name", "contact_email", "contact_phone", "role"],
    fields: [
      ...CAMPOS_DO_NEGOCIO,
      f("contact_name", "Contato"),
      f("contact_email", "E-mail do contato"),
      f("contact_phone", "Telefone do contato"),
      f("contact_ddd", "DDD do contato"),
      { ...f("contact_ddd_uf", "UF do contato (pelo DDD)"), geo: "uf" },
      f("contact_source", "Origem do contato"),
      f("role", "Papel no negócio"),
    ],
  },
  {
    key: "deals_multiselect",
    label: "Negócios ↔ Opções marcadas",
    description: "Cada linha é uma opção marcada num campo de múltipla escolha de um negócio.",
    group: "Relações",
    defaultColumns: ["deal_name", "deal_stage", "field", "option"],
    fields: [f("field", "Campo"), f("option", "Opção"), ...CAMPOS_DO_NEGOCIO],
  },
  {
    key: "contacts_multiselect",
    label: "Contatos ↔ Opções marcadas",
    description: "Cada linha é uma opção marcada num campo de múltipla escolha de um contato.",
    group: "Relações",
    defaultColumns: ["contact_name", "field", "option", "contact_created"],
    fields: [
      f("field", "Campo"),
      f("option", "Opção"),
      f("contact_name", "Contato"),
      f("contact_source", "Origem do contato"),
      f("contact_owner", "Responsável pelo contato"),
      f("contact_created", "Contato criado em", "date"),
    ],
  },
  {
    key: "contacts_tags",
    label: "Contatos ↔ Etiquetas",
    description: "Cada linha é uma etiqueta num contato.",
    group: "Relações",
    fields: [
      f("tag", "Etiqueta"),
      f("contact_name", "Contato"),
      f("contact_source", "Origem do contato"),
      f("contact_created", "Contato criado em", "date"),
      f("added_at", "Etiquetado em", "date"),
    ],
  },
  {
    key: "sales",
    label: "Vendas (Hotmart)",
    description: "Cada linha é uma transação.",
    group: "Vendas",
    defaultColumns: ["approved", "product", "buyer_name", "status", "amount", "channel"],
    fields: [
      f("product", "Produto"),
      f("status", "Status"),
      f("amount", "Valor", "money"),
      f("amount_original", "Valor na moeda", "number"),
      f("currency", "Moeda"),
      f("offer", "Oferta"),
      f("plan", "Plano"),
      f("recurrence", "Nº da cobrança", "number"),
      f("payment_type", "Forma de pagamento"),
      f("installments", "Parcelas", "number"),
      f("channel", "Canal de origem"),
      f("src", "src"),
      f("sck", "sck"),
      f("buyer_email", "E-mail do comprador"),
      f("buyer_name", "Comprador"),
      f("ordered", "Data do pedido", "date"),
      f("approved", "Data de aprovação", "date"),
      f("is_paid", "Paga", "bool"),
    ],
  },
  {
    key: "conversations",
    label: "Conversas",
    description: "Cada linha é uma conversa de um agente com um cliente.",
    group: "Atendimento",
    fields: [
      f("agent", "Agente"),
      f("channel", "Canal"),
      f("status", "Situação"),
      f("assignee", "Atendente"),
      f("lead_stage", "Estágio do lead"),
      f("created", "Começou em", "date"),
      f("last_message", "Última mensagem em", "date"),
    ],
  },
  {
    key: "messages",
    label: "Mensagens",
    description: "Cada linha é uma mensagem de uma conversa.",
    group: "Atendimento",
    fields: [
      f("role", "Quem mandou"),
      f("agent", "Agente"),
      f("channel", "Canal"),
      f("media", "Tipo de anexo"),
      f("delivery", "Entrega"),
      f("author", "Atendente"),
      f("created", "Enviada em", "date"),
    ],
  },
  {
    key: "broadcasts",
    label: "Disparos",
    description: "Cada linha é um disparo de mensagens.",
    group: "Atendimento",
    fields: [
      f("agent", "Agente"),
      f("channel", "Canal"),
      f("status", "Situação"),
      f("kind", "Tipo"),
      f("total", "Destinatários", "number"),
      f("sent", "Enviadas", "number"),
      f("delivered", "Entregues", "number"),
      f("read", "Lidas", "number"),
      f("failed", "Falharam", "number"),
      f("created", "Criado em", "date"),
    ],
  },
  {
    key: "studio_events",
    label: "Eventos do Studio",
    description: "Cada linha é um evento registrado num Bloco do Studio.",
    group: "Atendimento",
    fields: [
      f("agent", "Agente"),
      f("category", "Categoria"),
      f("action", "Ação"),
      f("value", "Valor"),
      f("channel", "Canal"),
      f("created", "Quando", "date"),
    ],
  },
  {
    key: "users",
    label: "Usuários",
    description: "Cada linha é uma pessoa do contrato.",
    group: "Equipe",
    fields: [f("name", "Nome"), f("email", "E-mail"), f("role", "Papel"), f("status", "Situação"), f("created", "Entrou em", "date")],
  },
  {
    key: "users_teams",
    label: "Usuários ↔ Equipes",
    description: "Cada linha é uma pessoa numa equipe.",
    group: "Equipe",
    fields: [f("team", "Equipe"), f("user", "Pessoa"), f("email", "E-mail"), f("leader", "Líder da equipe"), f("since", "Na equipe desde", "date")],
  },
];

export const DATASET_BY_KEY = new Map(DATASETS.map((d) => [d.key, d]));

/** Bases de negócio: os filtros de funil e responsável da barra do painel valem nelas. */
export const BASES_COM_FILTROS_DO_PAINEL = new Set([
  "deals",
  "deal_stage_events",
  "deal_losses",
  "deals_tasks",
  "deals_products",
  "deals_contacts",
  "deals_multiselect",
]);

// ── Consulta ───────────────────────────────────────────────────────────────

export type FilterOp =
  | "eq" | "neq" | "contains" | "not_contains" | "in" | "not_in"
  | "gt" | "gte" | "lt" | "lte" | "between"
  | "last_days" | "next_days" | "panel" | "this_month"
  | "is_true" | "is_false"
  | "is_set" | "is_empty";

export interface ReportFilter {
  field: string;
  op: FilterOp;
  value?: string;
  values?: string[];
  /** Fim do "entre". */
  to?: string;
}

export type MetricOp = "count" | "count_distinct" | "sum" | "avg" | "median" | "min" | "max";
export interface Metric {
  op: MetricOp;
  /** Obrigatório fora de "count". */
  field?: string;
}

export type Grain = "day" | "week" | "month" | "quarter" | "year";
export interface GroupBy {
  field: string;
  /** Só para campo de data. */
  grain?: Grain;
}

export interface SortBy {
  /** Campo (tabela sem resumo ou agrupamento) ou "m0", "m1"... (métrica). */
  key: string;
  dir: "asc" | "desc";
}

export interface ReportQuery {
  v: 2;
  dataset: string;
  /** Tabela sem resumo: os campos mostrados, na ordem. */
  columns: string[];
  filters: { logic: "and" | "or"; conditions: ReportFilter[] };
  /** Vazio (sem métricas nem agrupamento) = linhas cruas. */
  metrics: Metric[];
  groupBy: GroupBy[];
  sort: SortBy[];
  limit: number;
}

export type VizType =
  | "table" | "detail" | "number" | "bar" | "bar_h" | "line" | "area" | "pie"
  | "combo" | "trend" | "gauge" | "progress" | "funnel" | "pivot" | "scatter" | "waterfall" | "sankey" | "map";

export const VIZ_TYPES: { key: VizType; label: string }[] = [
  { key: "table", label: "Tabela" },
  { key: "funnel", label: "Funil" },
  { key: "detail", label: "Detalhe" },
  { key: "bar", label: "Barra" },
  { key: "line", label: "Linha" },
  { key: "pie", label: "Pizza" },
  { key: "number", label: "Número" },
  { key: "bar_h", label: "Barra horizontal" },
  { key: "area", label: "Área" },
  { key: "combo", label: "Combo" },
  { key: "pivot", label: "Tabela dinâmica" },
  { key: "trend", label: "Tendência" },
  { key: "gauge", label: "Indicador" },
  { key: "progress", label: "Progresso" },
  { key: "scatter", label: "Dispersão" },
  { key: "waterfall", label: "Cascata" },
  { key: "sankey", label: "Sankey" },
  { key: "map", label: "Mapa" },
];

/** Visuais que comparam com uma meta. */
export const VIZ_COM_META: VizType[] = ["gauge", "progress"];

export const METRIC_LABEL: Record<MetricOp, string> = {
  count: "Contagem",
  count_distinct: "Valores distintos de",
  sum: "Soma de",
  avg: "Média de",
  median: "Mediana de",
  min: "Mínimo de",
  max: "Máximo de",
};

export const GRAIN_LABEL: Record<Grain, string> = { day: "dia", week: "semana", month: "mês", quarter: "trimestre", year: "ano" };

export const LIMITE_MAXIMO = 1000;
export const LIMITE_DE_FILTROS = 12;
export const LIMITE_DE_METRICAS = 4;
export const LIMITE_DE_AGRUPAMENTOS = 2;
export const LIMITE_DE_COLUNAS = 20;

export const QUERY_PADRAO = (dataset = "deals"): ReportQuery => ({
  v: 2,
  dataset,
  columns: [],
  filters: { logic: "and", conditions: [] },
  metrics: [{ op: "count" }],
  groupBy: [],
  sort: [],
  limit: 100,
});

/** Operadores que cabem em cada tipo de campo. */
export const OPS_POR_TIPO: Record<FieldType, FilterOp[]> = {
  text: ["eq", "neq", "contains", "not_contains", "in", "not_in", "is_set", "is_empty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_set", "is_empty"],
  money: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_set", "is_empty"],
  date: ["panel", "this_month", "last_days", "next_days", "between", "is_set", "is_empty"],
  bool: ["is_true", "is_false"],
};

export const OP_LABEL: Record<FilterOp, string> = {
  eq: "é", neq: "não é", contains: "contém", not_contains: "não contém", in: "é qualquer de", not_in: "não é nenhum de",
  gt: "maior que", gte: "a partir de", lt: "menor que", lte: "até", between: "entre",
  last_days: "nos últimos (dias)", next_days: "nos próximos (dias)", panel: "no período do painel", this_month: "neste mês",
  is_true: "é sim", is_false: "é não", is_set: "está preenchido", is_empty: "está vazio",
};

/** Que métricas fazem sentido em cada tipo de campo (contagem não precisa de campo). */
export const METRICAS_POR_TIPO: Record<FieldType, MetricOp[]> = {
  text: ["count_distinct"],
  number: ["sum", "avg", "median", "min", "max", "count_distinct"],
  money: ["sum", "avg", "median", "min", "max"],
  date: ["min", "max", "count_distinct"],
  bool: ["count_distinct"],
};

/** Campo personalizado como chegou da tela de campos (entidade do dataset). */
export interface CampoPersonalizado {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
}

/** Tipo do campo personalizado na consulta. */
export function tipoDoPersonalizado(t: string): FieldType {
  if (t === "number") return "number";
  if (t === "currency") return "money";
  if (t === "date" || t === "datetime") return "date";
  if (t === "checkbox") return "bool";
  return "text";
}

/** Os campos de um dataset, com os personalizados (chave "cf:<chave>"). */
export function camposDoDataset(dataset: string, personalizados: CampoPersonalizado[] = []): FieldDef[] {
  const d = DATASET_BY_KEY.get(dataset);
  if (!d) return [];
  const cf = d.customFields ? personalizados.map((c) => ({ key: `cf:${c.key}`, label: c.label, type: tipoDoPersonalizado(c.type) })) : [];
  return [...d.fields, ...cf];
}

/** Colunas da tabela crua: as escolhidas ou as padrão da base. */
export function colunasEfetivas(q: Pick<ReportQuery, "dataset" | "columns">, campos: FieldDef[]): string[] {
  if (q.columns.length) return q.columns;
  return DATASET_BY_KEY.get(q.dataset)?.defaultColumns ?? campos.slice(0, 6).map((c) => c.key);
}

const CHAVE_CF = /^cf:[a-z0-9_]{1,60}$/;

/**
 * Saneia uma consulta vinda da tela ou do banco. Campo personalizado só passa
 * no formato da chave; se ele existe de fato, o servidor confere ao rodar.
 * Devolve null se a base não existe.
 */
export function sanearReportQuery(bruta: unknown): ReportQuery | null {
  if (!bruta || typeof bruta !== "object") return null;
  const q = bruta as Partial<ReportQuery>;
  const d = DATASET_BY_KEY.get(String(q.dataset ?? ""));
  if (!d) return null;
  const tipos = new Map(d.fields.map((c) => [c.key, c.type]));
  const valido = (campo: unknown): campo is string =>
    typeof campo === "string" && (tipos.has(campo) || (!!d.customFields && CHAVE_CF.test(campo)));
  const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);

  const conditions: ReportFilter[] = [];
  for (const c of Array.isArray(q.filters?.conditions) ? q.filters!.conditions.slice(0, LIMITE_DE_FILTROS) : []) {
    if (!valido(c?.field) || !(c.op in OP_LABEL)) continue;
    conditions.push({
      field: c.field,
      op: c.op,
      ...(texto(c.value) !== undefined ? { value: texto(c.value) } : {}),
      ...(Array.isArray(c.values) ? { values: c.values.slice(0, 50).map((v) => String(v).slice(0, 200)) } : {}),
      ...(texto(c.to) !== undefined ? { to: texto(c.to) } : {}),
    });
  }

  const metrics: Metric[] = [];
  for (const m of Array.isArray(q.metrics) ? q.metrics.slice(0, LIMITE_DE_METRICAS) : []) {
    if (!m || !(m.op in METRIC_LABEL)) continue;
    if (m.op === "count") metrics.push({ op: "count" });
    else if (valido(m.field)) metrics.push({ op: m.op, field: m.field });
  }

  const groupBy: GroupBy[] = [];
  for (const g of Array.isArray(q.groupBy) ? q.groupBy.slice(0, LIMITE_DE_AGRUPAMENTOS) : []) {
    if (!valido(g?.field)) continue;
    groupBy.push(g.grain && g.grain in GRAIN_LABEL ? { field: g.field, grain: g.grain } : { field: g.field });
  }

  const columns = (Array.isArray(q.columns) ? q.columns : []).filter(valido).slice(0, LIMITE_DE_COLUNAS);
  const resumo = metrics.length > 0 || groupBy.length > 0;
  const sort: SortBy[] = [];
  for (const s of Array.isArray(q.sort) ? q.sort.slice(0, 3) : []) {
    const k = String(s?.key ?? "");
    const ok = resumo ? /^m[0-3]$/.test(k) ? Number(k.slice(1)) < metrics.length : groupBy.some((g) => g.field === k) : valido(k);
    if (ok) sort.push({ key: k, dir: s.dir === "asc" ? "asc" : "desc" });
  }

  return {
    v: 2,
    dataset: d.key,
    columns,
    filters: { logic: q.filters?.logic === "or" ? "or" : "and", conditions },
    metrics,
    groupBy,
    sort,
    limit: Math.min(Math.max(Math.floor(Number(q.limit) || 100), 1), LIMITE_MAXIMO),
  };
}

/** Formato do resultado, que decide os gráficos possíveis. */
export function vizPermitidas(q: ReportQuery): VizType[] {
  const resumo = q.metrics.length > 0 || q.groupBy.length > 0;
  if (!resumo) return ["table", "detail"];
  if (q.groupBy.length === 0) return q.metrics.length === 1 ? ["number", "gauge", "progress", "table"] : ["table", "detail"];
  if (q.metrics.length === 0) return ["table"];
  const base: VizType[] = ["bar", "bar_h", "line", "area"];
  const uma = q.metrics.length === 1;
  if (q.groupBy.length === 1) {
    // Tendência compara o último período com o anterior: só faz sentido no tempo.
    const tempo = !!q.groupBy[0].grain;
    const noMapa = !!DATASET_BY_KEY.get(q.dataset)?.fields.find((c) => c.key === q.groupBy[0].field)?.geo;
    return uma
      ? [...base, "pie", "funnel", "waterfall", ...(tempo ? (["trend"] as VizType[]) : []), ...(noMapa ? (["map"] as VizType[]) : []), "table"]
      : [...base, "combo", "scatter", "table"];
  }
  return uma ? [...base, "pivot", "sankey", "table"] : [...base, "table"];
}

// ── Resultado ──────────────────────────────────────────────────────────────

export interface ReportColumn {
  key: string;
  label: string;
  type: FieldType;
  /** "dimension" (agrupamento ou campo) ou "metric". */
  role: "dimension" | "metric";
  /** Data agrupada: o valor vem como "AAAA-MM-DD" do início do período. */
  grain?: Grain;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: (string | number | boolean | null)[][];
  /** Passou do limite: há mais linhas do que as mostradas. */
  truncated: boolean;
}

/** Nome de uma métrica em português: "Soma de Valor". */
export function rotuloDaMetrica(m: Metric, campos: FieldDef[]): string {
  if (m.op === "count") return "Contagem";
  return `${METRIC_LABEL[m.op]} ${campos.find((c) => c.key === m.field)?.label ?? m.field}`;
}

/** Tipo do valor de uma métrica (contagem é número; soma de dinheiro é dinheiro). */
export function tipoDaMetrica(m: Metric, campos: FieldDef[]): FieldType {
  if (m.op === "count" || m.op === "count_distinct") return "number";
  const t = campos.find((c) => c.key === m.field)?.type ?? "number";
  return t === "date" && (m.op === "min" || m.op === "max") ? "date" : t === "money" ? "money" : "number";
}

// ── Formatação e séries (tela) ─────────────────────────────────────────────

type Valor = string | number | boolean | null;

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_CURTO = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const NUM_CURTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Valor de uma célula. Sem dado é "—", nunca um 0 inventado. `curto` para eixos. */
export function formatarValor(v: Valor, tipo: FieldType, curto = false): string {
  if (v === null || v === "") return "—";
  if (tipo === "bool") return v ? "Sim" : "Não";
  if (tipo === "money" && typeof v === "number") return (curto ? BRL_CURTO : BRL).format(v);
  if (tipo === "number" && typeof v === "number") return (curto ? NUM_CURTO : NUM).format(v);
  if (tipo === "date" && typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/.exec(v);
    if (m) return `${m[3]}/${m[2]}/${m[1]}${m[4] && m[4] !== "00:00" ? ` ${m[4]}` : ""}`;
  }
  return String(v);
}

/** Rótulo de um grupo (eixo, fatia, linha da tabela). Data agrupada vira "out/26". */
export function formatarDimensao(v: Valor, col: ReportColumn): string {
  if (v === null || v === "") return "(vazio)";
  if (col.type === "date" && col.grain && typeof v === "string") {
    const [a, m, d] = v.split("-");
    const mes = MESES[Number(m) - 1] ?? m;
    if (col.grain === "year") return a;
    if (col.grain === "quarter") return `T${Math.floor((Number(m) - 1) / 3) + 1}/${a.slice(2)}`;
    if (col.grain === "month") return `${mes}/${a.slice(2)}`;
    if (col.grain === "week") return `sem. ${d}/${m}`;
    return `${d}/${m}`;
  }
  return formatarValor(v, col.type);
}

export interface Serie {
  nome: string;
  tipo: FieldType;
  valores: (number | null)[];
}

export const LIMITE_DE_SERIES = 12;

/**
 * Resultado → categorias do eixo e séries. Um agrupamento: uma série por
 * métrica. Dois agrupamentos e uma métrica: o segundo vira as séries
 * (as 12 primeiras; `cortadas` diz se sobrou).
 */
export function seriesDoResultado(r: ReportResult): { categorias: string[]; series: Serie[]; cortadas: boolean; semData: number } {
  const dims = r.columns.map((c, i) => ({ c, i })).filter((x) => x.c.role === "dimension");
  // Linha sem data não é um ponto no tempo: sai do eixo e a tela avisa quantas.
  const tempo = dims[0]?.c.grain ? dims[0].i : -1;
  const rows = tempo >= 0 ? r.rows.filter((l) => l[tempo] !== null) : r.rows;
  const semData = r.rows.length - rows.length;
  const mets = r.columns.map((c, i) => ({ c, i })).filter((x) => x.c.role === "metric");
  const num = (v: Valor) => (typeof v === "number" ? v : null);
  if (dims.length === 2 && mets.length === 1) {
    const [d0, d1] = dims;
    const m = mets[0];
    const categorias: string[] = [];
    const nomes: string[] = [];
    const celulas = new Map<string, number | null>();
    for (const l of rows) {
      const cat = formatarDimensao(l[d0.i], d0.c);
      const nome = formatarDimensao(l[d1.i], d1.c);
      if (!categorias.includes(cat)) categorias.push(cat);
      if (!nomes.includes(nome)) nomes.push(nome);
      celulas.set(`${cat}\u0000${nome}`, num(l[m.i]));
    }
    return {
      categorias,
      series: nomes.slice(0, LIMITE_DE_SERIES).map((nome) => ({
        nome,
        tipo: m.c.type,
        valores: categorias.map((cat) => celulas.get(`${cat}\u0000${nome}`) ?? null),
      })),
      cortadas: nomes.length > LIMITE_DE_SERIES,
      semData,
    };
  }
  const d0 = dims[0];
  return {
    categorias: rows.map((l) => (d0 ? formatarDimensao(l[d0.i], d0.c) : "")),
    series: mets.map((m) => ({ nome: m.c.label, tipo: m.c.type, valores: rows.map((l) => num(l[m.i])) })),
    cortadas: false,
    semData,
  };
}

/** Cartão salvo no painel: consulta saneada, um visual que caiba nela e a meta (Indicador e Progresso). */
export function sanearRelatorio(bruto: unknown): { query: ReportQuery; viz: VizType; meta?: number } | null {
  const r = bruto && typeof bruto === "object" ? (bruto as { query?: unknown; viz?: unknown; meta?: unknown }) : null;
  const query = sanearReportQuery(r?.query);
  if (!query) return null;
  const permitidas = vizPermitidas(query);
  const viz = permitidas.find((v) => v === r?.viz) ?? permitidas[0];
  const meta = Number(r?.meta);
  return VIZ_COM_META.includes(viz) && Number.isFinite(meta) && meta > 0 ? { query, viz, meta } : { query, viz };
}

// ── Cartões prontos ────────────────────────────────────────────────────────

export interface ReportTemplate {
  title: string;
  description: string;
  viz: VizType;
  query: ReportQuery;
}

const venda = (parcial: Partial<ReportQuery>): ReportQuery => ({ ...QUERY_PADRAO("sales"), metrics: [{ op: "sum", field: "amount" }], ...parcial });
const PAGAS: ReportFilter = { field: "is_paid", op: "is_true" };
const NO_MES: ReportFilter = { field: "approved", op: "this_month" };
const NO_PERIODO: ReportFilter = { field: "approved", op: "panel" };

/** Vendas da Hotmart no "Adicionar cartão". Meta por produto: duplique o cartão e filtre o produto. */
export const SALES_TEMPLATES: ReportTemplate[] = [
  {
    title: "Receita do mês",
    description: "Soma das vendas pagas no mês. Defina a meta ao editar.",
    viz: "gauge",
    query: venda({ filters: { logic: "and", conditions: [PAGAS, NO_MES] } }),
  },
  {
    title: "Meta do mês",
    description: "Quanto da meta de receita do mês já entrou.",
    viz: "progress",
    query: venda({ filters: { logic: "and", conditions: [PAGAS, NO_MES] } }),
  },
  {
    title: "Receita por produto por mês",
    description: "Vendas pagas, mês a mês, por produto.",
    viz: "bar",
    query: venda({
      filters: { logic: "and", conditions: [PAGAS, NO_PERIODO] },
      groupBy: [{ field: "approved", grain: "month" }, { field: "product" }],
      sort: [{ key: "approved", dir: "asc" }],
      limit: 500,
    }),
  },
  {
    title: "Reembolsos e chargebacks",
    description: "Quantas vendas voltaram, por status.",
    viz: "bar",
    query: venda({
      metrics: [{ op: "count" }],
      filters: { logic: "and", conditions: [{ field: "status", op: "in", values: ["Reembolsada", "Chargeback"] }, NO_PERIODO] },
      groupBy: [{ field: "status" }],
      sort: [{ key: "m0", dir: "desc" }],
    }),
  },
  {
    title: "Vendas por canal",
    description: "Vendas pagas por canal de origem.",
    viz: "bar_h",
    query: venda({
      metrics: [{ op: "count" }],
      filters: { logic: "and", conditions: [PAGAS, NO_PERIODO] },
      groupBy: [{ field: "channel" }],
      sort: [{ key: "m0", dir: "desc" }],
    }),
  },
];

/** Tipo do cartão antigo mais parecido (o painel usa para a largura inicial e o CSV). */
export function tipoDoCartao(viz: VizType): "numero" | "linha" | "pizza" | "barras" | "tabela" {
  if (viz === "number" || viz === "trend" || viz === "gauge" || viz === "progress") return "numero";
  if (viz === "pie") return "pizza";
  if (viz === "line" || viz === "area") return "linha";
  if (viz === "table" || viz === "detail" || viz === "pivot") return "tabela";
  return "barras";
}

// ── Formas dos visuais da Fase 2 (puras, para testar) ─────────────────────

/** Tabela dinâmica: 1º agrupamento nas linhas, 2º nas colunas, 1ª métrica nas células. */
export function tabelaDinamica(r: ReportResult): { linhas: string[]; colunas: string[]; celulas: (number | null)[][]; tipo: FieldType } {
  const { categorias, series } = seriesDoResultado(r);
  return {
    linhas: categorias,
    colunas: series.map((s) => s.nome),
    celulas: categorias.map((_, i) => series.map((s) => s.valores[i])),
    tipo: series[0]?.tipo ?? "number",
  };
}

/**
 * Ligações do Sankey (1º agrupamento → 2º, valor da métrica). Um diagrama de
 * fluxo não aceita volta (A → B e B → A): fica a ligação de maior valor e a
 * que fecharia um ciclo sai, contada em `descartadas`.
 */
export function ligacoesDoSankey(r: ReportResult): { nos: string[]; ligacoes: { source: string; target: string; value: number }[]; descartadas: number } {
  const dims = r.columns.map((c, i) => ({ c, i })).filter((x) => x.c.role === "dimension");
  const m = r.columns.findIndex((c) => c.role === "metric");
  if (dims.length < 2 || m < 0) return { nos: [], ligacoes: [], descartadas: 0 };
  const [a, b] = dims;
  const brutas = r.rows
    .map((l) => ({ source: formatarDimensao(l[a.i], a.c), target: formatarDimensao(l[b.i], b.c), value: typeof l[m] === "number" ? (l[m] as number) : 0 }))
    .filter((x) => x.value > 0)
    .sort((x, y) => y.value - x.value);
  const saidas = new Map<string, Set<string>>();
  const alcanca = (de: string, ate: string): boolean => {
    const pilha = [de];
    const visto = new Set<string>();
    while (pilha.length) {
      const n = pilha.pop()!;
      if (n === ate) return true;
      if (visto.has(n)) continue;
      visto.add(n);
      pilha.push(...(saidas.get(n) ?? []));
    }
    return false;
  };
  const ligacoes: { source: string; target: string; value: number }[] = [];
  let descartadas = 0;
  for (const l of brutas) {
    if (l.source === l.target || alcanca(l.target, l.source)) {
      descartadas++;
      continue;
    }
    if (!saidas.has(l.source)) saidas.set(l.source, new Set());
    saidas.get(l.source)!.add(l.target);
    ligacoes.push(l);
  }
  const nos = [...new Set(ligacoes.flatMap((l) => [l.source, l.target]))];
  return { nos, ligacoes, descartadas };
}

/** Cascata: cada grupo soma (ou tira) do anterior; a barra invisível é a base. */
export function degrausDaCascata(valores: (number | null)[]): { base: number; valor: number; acumulado: number }[] {
  let acumulado = 0;
  return valores.map((v) => {
    const n = v ?? 0;
    const antes = acumulado;
    acumulado += n;
    return { base: Math.min(antes, acumulado), valor: Math.abs(n), acumulado };
  });
}

/** Tendência: último período contra o anterior (variação em %, null se o anterior é 0 ou falta). */
export function tendencia(r: ReportResult): { atual: number | null; anterior: number | null; variacao: number | null; rotuloAtual: string; rotuloAnterior: string; valores: (number | null)[]; tipo: FieldType } {
  const { categorias, series } = seriesDoResultado(r);
  const s = series[0];
  const valores = s?.valores ?? [];
  const n = valores.length;
  const atual = n ? valores[n - 1] : null;
  const anterior = n > 1 ? valores[n - 2] : null;
  const variacao = atual !== null && anterior ? (atual - anterior) / Math.abs(anterior) : null;
  return { atual, anterior, variacao, rotuloAtual: categorias[n - 1] ?? "", rotuloAnterior: categorias[n - 2] ?? "", valores, tipo: s?.tipo ?? "number" };
}
