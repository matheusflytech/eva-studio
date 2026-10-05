import type { DefinicaoDeCampo } from "@/lib/custom-fields";

// ---------------------------------------------------------------------------
// Cartão de dashboard montado pelo cliente: "some o consumo mensal dos
// negócios ganhos, por tipo de imóvel". Sem SQL, sem fórmula livre: a pessoa
// escolhe medida, campo, agrupamento e filtros, e o servidor calcula só com
// consultas que ele mesmo monta. Sem `server-only` porque a tela usa as mesmas
// regras pra saber que tipos de gráfico cabem e pra descrever a consulta.
// ---------------------------------------------------------------------------

export type Medida = "contagem" | "soma" | "media";
export type StatusDoNegocio = "abertos" | "ganhos" | "perdidos" | "todos";
export type OperadorDeFiltro = "eq" | "neq" | "gt" | "lt" | "vazio" | "preenchido";

export interface FiltroDeConsulta {
  /** "etapa" | "responsavel" | "cf:<chave>" */
  campo: string;
  op: OperadorDeFiltro;
  valor?: string;
}

export interface Consulta {
  medida: Medida;
  /** Só para soma e média: "valor" | "ponderado" | "cf:<chave>". */
  campo?: string;
  /** "" = um número só. "etapa" | "responsavel" | "mes" | "dia" | "cf:<chave>". */
  agrupar: string;
  status: StatusDoNegocio;
  funilId?: string;
  /** "painel" = só o período escolhido no dashboard; "tudo" = todo o histórico. */
  periodo: "painel" | "tudo";
  filtros: FiltroDeConsulta[];
}

export const CONSULTA_PADRAO: Consulta = {
  medida: "contagem",
  agrupar: "etapa",
  status: "abertos",
  periodo: "tudo",
  filtros: [],
};

export type FormatoDeValor = "inteiro" | "dinheiro" | "decimal";

export type ResultadoDeConsulta =
  | { tipo: "numero"; valor: number | null; formato: FormatoDeValor; negocios: number }
  | { tipo: "pontos"; pontos: { label: string; value: number }[]; formato: FormatoDeValor; negocios: number }
  | { tipo: "tabela"; linhas: LinhaDeConsulta[]; negocios: number };

export interface LinhaDeConsulta {
  id: string;
  titulo: string;
  etapa: string;
  responsavel: string;
  valorCents: number;
  quando: string | null;
}

export const MEDIDAS: { id: Medida; rotulo: string; descricao: string }[] = [
  { id: "contagem", rotulo: "Quantidade", descricao: "Quantos negócios." },
  { id: "soma", rotulo: "Soma", descricao: "Somar um valor ou número." },
  { id: "media", rotulo: "Média", descricao: "A média de um valor ou número." },
];

export const STATUS: { id: StatusDoNegocio; rotulo: string }[] = [
  { id: "abertos", rotulo: "Em andamento" },
  { id: "ganhos", rotulo: "Ganhos" },
  { id: "perdidos", rotulo: "Perdidos" },
  { id: "todos", rotulo: "Todos" },
];

export const CAMPOS_BASE_NUMERICOS = [
  { id: "valor", rotulo: "Valor do negócio", formato: "dinheiro" as const },
  { id: "ponderado", rotulo: "Valor ponderado pela chance", formato: "dinheiro" as const },
];

export const AGRUPAMENTOS_BASE = [
  { id: "", rotulo: "Sem agrupar (um número só)" },
  { id: "etapa", rotulo: "Por etapa do funil" },
  { id: "responsavel", rotulo: "Por responsável" },
  { id: "mes", rotulo: "Por mês" },
  { id: "dia", rotulo: "Por dia" },
];

export const OPERADORES: { id: OperadorDeFiltro; rotulo: string }[] = [
  { id: "eq", rotulo: "é" },
  { id: "neq", rotulo: "não é" },
  { id: "gt", rotulo: "maior que" },
  { id: "lt", rotulo: "menor que" },
  { id: "preenchido", rotulo: "está preenchido" },
  { id: "vazio", rotulo: "está vazio" },
];

export type TipoDeCartao = "numero" | "linha" | "pizza" | "barras" | "tabela";

export function agrupamentoTemporal(agrupar: string): boolean {
  return agrupar === "mes" || agrupar === "dia";
}

/** Que gráficos cabem nessa consulta. Pizza de série temporal não é uma opção. */
export function tiposPermitidos(c: Consulta): TipoDeCartao[] {
  if (!c.agrupar) return ["numero", "tabela"];
  if (agrupamentoTemporal(c.agrupar)) return ["linha", "barras"];
  return ["pizza", "barras"];
}

export function formatoDaConsulta(c: Consulta, defs: Pick<DefinicaoDeCampo, "key" | "type">[]): FormatoDeValor {
  if (c.medida === "contagem") return "inteiro";
  if (c.campo === "valor" || c.campo === "ponderado") return "dinheiro";
  const def = defs.find((d) => `cf:${d.key}` === c.campo);
  if (def?.type === "currency") return "dinheiro";
  return "decimal";
}

export function formatarResultado(valor: number | null, formato: FormatoDeValor): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  if (formato === "dinheiro") return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  if (formato === "decimal") return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return valor.toLocaleString("pt-BR");
}

const CHAVE_CF = /^cf:[a-z0-9_]{1,40}$/;

/** Saneia uma consulta vinda do navegador. Devolve null se não for aproveitável. */
export function sanearConsulta(bruto: unknown): Consulta | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;

  const medida = (["contagem", "soma", "media"] as const).find((m) => m === b.medida);
  if (!medida) return null;
  const status = (["abertos", "ganhos", "perdidos", "todos"] as const).find((s) => s === b.status) ?? "todos";

  const agrupar = String(b.agrupar ?? "");
  if (agrupar && !["etapa", "responsavel", "mes", "dia"].includes(agrupar) && !CHAVE_CF.test(agrupar)) return null;

  let campo: string | undefined;
  if (medida !== "contagem") {
    const c = String(b.campo ?? "");
    if (c !== "valor" && c !== "ponderado" && !CHAVE_CF.test(c)) return null;
    campo = c;
  }

  const filtros: FiltroDeConsulta[] = [];
  if (Array.isArray(b.filtros)) {
    for (const f of b.filtros.slice(0, 6)) {
      const campoF = String((f as { campo?: unknown })?.campo ?? "");
      const op = OPERADORES.find((o) => o.id === (f as { op?: unknown })?.op)?.id;
      if (!op) continue;
      if (campoF !== "etapa" && campoF !== "responsavel" && !CHAVE_CF.test(campoF)) continue;
      const valor = String((f as { valor?: unknown })?.valor ?? "").slice(0, 120);
      // Filtro sem valor escolhido ainda é rascunho: ignora, em vez de zerar o cartão.
      if (op !== "vazio" && op !== "preenchido" && !valor.trim()) continue;
      filtros.push({ campo: campoF, op, valor });
    }
  }

  return {
    medida,
    campo,
    agrupar,
    status,
    funilId: typeof b.funilId === "string" && b.funilId ? b.funilId.slice(0, 60) : undefined,
    periodo: b.periodo === "painel" ? "painel" : "tudo",
    filtros,
  };
}

/** Frase que resume a consulta, mostrada no cartão e no construtor. */
export function descreverConsulta(
  c: Consulta,
  defs: Pick<DefinicaoDeCampo, "key" | "label">[],
  funis: { id: string; name: string }[] = []
): string {
  const rotuloCampo = (id?: string) =>
    CAMPOS_BASE_NUMERICOS.find((x) => x.id === id)?.rotulo ?? defs.find((d) => `cf:${d.key}` === id)?.label ?? "campo removido";
  const o =
    c.medida === "contagem"
      ? "Quantidade de negócios"
      : `${c.medida === "soma" ? "Soma" : "Média"} de ${rotuloCampo(c.campo).toLowerCase()}`;
  const partes = [o];
  if (c.agrupar) {
    const g =
      AGRUPAMENTOS_BASE.find((a) => a.id === c.agrupar)?.rotulo.replace("Por ", "").toLowerCase() ??
      defs.find((d) => `cf:${d.key}` === c.agrupar)?.label.toLowerCase() ??
      "campo removido";
    partes.push(`por ${g}`);
  }
  partes.push(STATUS.find((s) => s.id === c.status)?.rotulo.toLowerCase() ?? "");
  if (c.funilId) partes.push(`no funil ${funis.find((f) => f.id === c.funilId)?.name ?? "removido"}`);
  if (c.filtros.length > 0) partes.push(`${c.filtros.length} filtro(s)`);
  return partes.filter(Boolean).join(", ");
}
