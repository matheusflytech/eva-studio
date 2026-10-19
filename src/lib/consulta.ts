import { dataExiste, parseNumero, type DefinicaoDeCampo, type OpcaoDeCampo } from "@/lib/custom-fields";

// ---------------------------------------------------------------------------
// Cartão de dashboard montado pelo cliente: "some o consumo mensal dos
// negócios ganhos, por tipo de imóvel". Sem SQL, sem fórmula livre: a pessoa
// escolhe medida, campo, agrupamento e filtros, e o servidor calcula só com
// consultas que ele mesmo monta. Sem `server-only` porque a tela usa as mesmas
// regras pra saber que tipos de gráfico cabem, que operadores cabem em cada
// campo e pra descrever a consulta em português.
// ---------------------------------------------------------------------------

export type Medida = "contagem" | "soma" | "media" | "mediana" | "minimo" | "maximo" | "taxaGanho";
export type StatusDoNegocio = "abertos" | "ganhos" | "perdidos" | "todos";
export type DataBase = "criacao" | "fechamento" | "previsao";

export type OperadorDeFiltro =
  // texto, número e sim/não
  | "eq"
  | "neq"
  // texto
  | "contem"
  | "naoContem"
  // listas: "é qualquer de" / "não é nenhum de"; multiselect: "contém qualquer" / "não contém"
  | "qualquer"
  | "nenhum"
  // multiselect: "contém todos"
  | "todos"
  // número
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  // número e data
  | "entre"
  // data
  | "em"
  | "antes"
  | "depois"
  | "ultimos"
  | "proximos"
  // todos
  | "preenchido"
  | "vazio";

/** Uma condição: "Valor ≥ 5000", "Etapa é qualquer de [Proposta, Negociação]". */
export interface FiltroDeConsulta {
  /** Campo base (ver CAMPOS_DE_FILTRO) ou "cf:<chave>". */
  campo: string;
  op: OperadorDeFiltro;
  /** Texto, número, data (AAAA-MM-DD), N de "últimos N dias", "true"/"false". */
  valor?: string;
  /** Listas: os itens escolhidos. */
  valores?: string[];
  /** Fim do "entre". */
  ate?: string;
}

export type Logica = "e" | "ou";

export interface GrupoDeFiltros {
  logica: Logica;
  condicoes: FiltroDeConsulta[];
}

/** Grupos de condições. Dentro do grupo e entre grupos, "e" ou "ou". */
export interface FiltrosDeConsulta {
  logica: Logica;
  grupos: GrupoDeFiltros[];
}

export interface Intervalo {
  /** AAAA-MM-DD, no fuso de São Paulo, inclusive. */
  de: string;
  ate: string;
}

export interface Consulta {
  medida: Medida;
  /** Para soma, média, mediana, mínimo e máximo: "valor" | "ponderado" | "cf:<chave>". */
  campo?: string;
  /** "" = um número só. Ver AGRUPAMENTOS_BASE, ou "cf:<chave>". */
  agrupar: string;
  status: StatusDoNegocio;
  /** Vazio = todos os funis. */
  funilIds: string[];
  /** "painel" = o período escolhido no dashboard; "tudo" = todo o histórico; ou um intervalo fixo. */
  periodo: "painel" | "tudo" | Intervalo;
  /** Qual data conta pro período e pros agrupamentos no tempo. Sem valor: criação, ou fechamento para ganhos e perdidos. */
  dataBase?: DataBase;
  filtros: FiltrosDeConsulta;
  /** Cartão de número: mostra também o período anterior equivalente. */
  comparar?: boolean;
}

export const FILTROS_VAZIOS: FiltrosDeConsulta = { logica: "e", grupos: [] };

export const CONSULTA_PADRAO: Consulta = {
  medida: "contagem",
  agrupar: "etapa",
  status: "abertos",
  funilIds: [],
  periodo: "tudo",
  filtros: FILTROS_VAZIOS,
};

export const LIMITE_DE_GRUPOS = 5;
export const LIMITE_DE_CONDICOES = 8;
/** Valor especial das listas de responsável e empresa: "sem responsável", "sem empresa". */
export const SEM_VALOR = "__nenhum";
/** Quantos negócios uma consulta lê no máximo. Passou disso, a resposta vem com `truncado`. */
export const LIMITE_DE_NEGOCIOS = 5000;

export type FormatoDeValor = "inteiro" | "dinheiro" | "decimal" | "porcento";

export type ResultadoDeConsulta =
  | {
      tipo: "numero";
      valor: number | null;
      formato: FormatoDeValor;
      negocios: number;
      truncado?: boolean;
      /** Só com `comparar`: o mesmo cálculo no período anterior de mesmo tamanho. */
      anterior?: number | null;
      /** (atual − anterior) ÷ anterior. null quando o anterior é zero ou não existe. */
      variacao?: number | null;
      janelaAnterior?: Intervalo;
    }
  | { tipo: "pontos"; pontos: { label: string; value: number }[]; formato: FormatoDeValor; negocios: number; truncado?: boolean }
  | { tipo: "tabela"; linhas: LinhaDeConsulta[]; negocios: number; truncado?: boolean };

export interface LinhaDeConsulta {
  id: string;
  titulo: string;
  etapa: string;
  responsavel: string;
  valorCents: number;
  quando: string | null;
}

export const MEDIDAS: { id: Medida; rotulo: string; descricao: string; precisaCampo: boolean }[] = [
  { id: "contagem", rotulo: "Quantidade", descricao: "Quantos negócios.", precisaCampo: false },
  { id: "soma", rotulo: "Soma", descricao: "Somar um valor ou número.", precisaCampo: true },
  { id: "media", rotulo: "Média", descricao: "A média de um valor.", precisaCampo: true },
  { id: "mediana", rotulo: "Mediana", descricao: "O valor do meio, sem os extremos puxarem.", precisaCampo: true },
  { id: "minimo", rotulo: "Mínimo", descricao: "O menor valor.", precisaCampo: true },
  { id: "maximo", rotulo: "Máximo", descricao: "O maior valor.", precisaCampo: true },
  { id: "taxaGanho", rotulo: "Taxa de ganho", descricao: "Ganhos ÷ fechados (ganhos + perdidos).", precisaCampo: false },
];

export function medidaPrecisaCampo(m: Medida): boolean {
  return MEDIDAS.find((x) => x.id === m)?.precisaCampo ?? false;
}

export const STATUS: { id: StatusDoNegocio; rotulo: string }[] = [
  { id: "abertos", rotulo: "Em andamento" },
  { id: "ganhos", rotulo: "Ganhos" },
  { id: "perdidos", rotulo: "Perdidos" },
  { id: "todos", rotulo: "Todos" },
];

export const DATAS_BASE: { id: DataBase; rotulo: string }[] = [
  { id: "criacao", rotulo: "Criação do negócio" },
  { id: "fechamento", rotulo: "Fechamento" },
  { id: "previsao", rotulo: "Previsão de fechamento" },
];

export const CAMPOS_BASE_NUMERICOS = [
  { id: "valor", rotulo: "Valor do negócio", formato: "dinheiro" as const },
  { id: "ponderado", rotulo: "Valor ponderado pela chance", formato: "dinheiro" as const },
];

export const AGRUPAMENTOS_BASE: { id: string; rotulo: string; grupo: "" | "Negócio" | "Tempo" | "Valor" }[] = [
  { id: "", rotulo: "Sem agrupar (um número só)", grupo: "" },
  { id: "etapa", rotulo: "Por etapa do funil", grupo: "Negócio" },
  { id: "funil", rotulo: "Por funil", grupo: "Negócio" },
  { id: "tipoEtapa", rotulo: "Por situação (aberto, ganho, perdido)", grupo: "Negócio" },
  { id: "responsavel", rotulo: "Por responsável", grupo: "Negócio" },
  { id: "empresa", rotulo: "Por empresa", grupo: "Negócio" },
  { id: "motivoPerda", rotulo: "Por motivo de perda", grupo: "Negócio" },
  { id: "canal", rotulo: "Por canal do contato", grupo: "Negócio" },
  { id: "produto", rotulo: "Por produto", grupo: "Negócio" },
  { id: "dia", rotulo: "Por dia", grupo: "Tempo" },
  { id: "semana", rotulo: "Por semana", grupo: "Tempo" },
  { id: "mes", rotulo: "Por mês", grupo: "Tempo" },
  { id: "trimestre", rotulo: "Por trimestre", grupo: "Tempo" },
  { id: "faixaValor", rotulo: "Por faixa de valor", grupo: "Valor" },
];

const AGRUPAMENTOS_VALIDOS = new Set(AGRUPAMENTOS_BASE.map((a) => a.id).filter(Boolean));

export const ROTULO_CANAL: Record<string, string> = {
  whatsapp_meta: "WhatsApp oficial", whatsapp_qr: "WhatsApp", instagram: "Instagram",
  messenger: "Messenger", telegram: "Telegram", tiktok: "TikTok",
  webchat: "Site", website: "Site", playground: "Teste", builder_preview: "Teste",
  "sem canal": "Sem canal",
};

export const ROTULO_TIPO_ETAPA: Record<string, string> = { open: "Em aberto", won: "Ganha", lost: "Perdida" };

// ── Campos de filtro ───────────────────────────────────────────────────────

export type TipoDeFiltro = "texto" | "lista" | "multi" | "numero" | "data" | "sim_nao";
export type GrupoDeCampo = "Negócio" | "Datas" | "Contato" | "Campos personalizados";
/** De onde a tela tira as opções de uma lista. */
export type FonteDeOpcoes = "funis" | "etapas" | "tiposEtapa" | "membros" | "empresas" | "etiquetas" | "canais" | "campo";

export interface CampoDeFiltro {
  id: string;
  rotulo: string;
  tipo: TipoDeFiltro;
  grupo: GrupoDeCampo;
  /** Campo que nunca fica vazio (valor, criado em): sem "preenchido"/"vazio". */
  semVazio?: boolean;
  formato?: "dinheiro" | "porcento" | "dias";
  opcoes?: FonteDeOpcoes;
  /** Só de campo personalizado. */
  def?: Pick<DefinicaoDeCampo, "key" | "label" | "type" | "options">;
}

export const CAMPOS_DE_FILTRO: CampoDeFiltro[] = [
  { id: "funil", rotulo: "Funil", tipo: "lista", grupo: "Negócio", semVazio: true, opcoes: "funis" },
  { id: "etapa", rotulo: "Etapa", tipo: "lista", grupo: "Negócio", semVazio: true, opcoes: "etapas" },
  { id: "tipoEtapa", rotulo: "Situação da etapa", tipo: "lista", grupo: "Negócio", semVazio: true, opcoes: "tiposEtapa" },
  { id: "responsavel", rotulo: "Responsável", tipo: "lista", grupo: "Negócio", opcoes: "membros" },
  { id: "empresa", rotulo: "Empresa", tipo: "lista", grupo: "Negócio", opcoes: "empresas" },
  { id: "valor", rotulo: "Valor", tipo: "numero", grupo: "Negócio", semVazio: true, formato: "dinheiro" },
  { id: "probabilidade", rotulo: "Probabilidade (%)", tipo: "numero", grupo: "Negócio", semVazio: true, formato: "porcento" },
  { id: "diasNaEtapa", rotulo: "Dias na etapa atual", tipo: "numero", grupo: "Negócio", semVazio: true, formato: "dias" },
  { id: "motivoPerda", rotulo: "Motivo de perda", tipo: "texto", grupo: "Negócio" },
  { id: "nome", rotulo: "Nome do negócio", tipo: "texto", grupo: "Negócio", semVazio: true },
  { id: "criadoEm", rotulo: "Criado em", tipo: "data", grupo: "Datas", semVazio: true },
  { id: "fechadoEm", rotulo: "Fechado em", tipo: "data", grupo: "Datas" },
  { id: "previsao", rotulo: "Previsão de fechamento", tipo: "data", grupo: "Datas" },
  { id: "etiqueta", rotulo: "Etiqueta do contato", tipo: "lista", grupo: "Contato", opcoes: "etiquetas" },
  { id: "canal", rotulo: "Canal do contato", tipo: "lista", grupo: "Contato", opcoes: "canais" },
];

const CAMPO_BASE_POR_ID = new Map(CAMPOS_DE_FILTRO.map((c) => [c.id, c]));

export function tipoDeFiltroDoCampoPersonalizado(tipo: string): TipoDeFiltro {
  if (tipo === "number" || tipo === "currency") return "numero";
  if (tipo === "date") return "data";
  if (tipo === "select") return "lista";
  if (tipo === "multiselect") return "multi";
  if (tipo === "checkbox") return "sim_nao";
  return "texto";
}

type DefParaFiltro = Pick<DefinicaoDeCampo, "key" | "label"> & { type?: string; options?: OpcaoDeCampo[] };

/** O campo de um filtro, base ou personalizado. undefined = campo que não existe (mais). */
export function campoDeFiltro(id: string, defs: DefParaFiltro[] | Map<string, DefParaFiltro>): CampoDeFiltro | undefined {
  const base = CAMPO_BASE_POR_ID.get(id);
  if (base) return base;
  if (!id.startsWith("cf:")) return undefined;
  const chave = id.slice(3);
  const def = defs instanceof Map ? defs.get(chave) : defs.find((d) => d.key === chave);
  if (!def) return undefined;
  const type = def.type ?? "text";
  return {
    id,
    rotulo: def.label,
    tipo: tipoDeFiltroDoCampoPersonalizado(type),
    grupo: "Campos personalizados",
    formato: type === "currency" ? "dinheiro" : undefined,
    opcoes: type === "select" || type === "multiselect" ? "campo" : undefined,
    def: { key: def.key, label: def.label, type: type as DefinicaoDeCampo["type"], options: def.options ?? [] },
  };
}

export const OPERADORES_POR_TIPO: Record<TipoDeFiltro, { id: OperadorDeFiltro; rotulo: string }[]> = {
  texto: [
    { id: "eq", rotulo: "é" },
    { id: "neq", rotulo: "não é" },
    { id: "contem", rotulo: "contém" },
    { id: "naoContem", rotulo: "não contém" },
    { id: "preenchido", rotulo: "está preenchido" },
    { id: "vazio", rotulo: "está vazio" },
  ],
  lista: [
    { id: "qualquer", rotulo: "é qualquer de" },
    { id: "nenhum", rotulo: "não é nenhum de" },
    { id: "preenchido", rotulo: "está preenchido" },
    { id: "vazio", rotulo: "está vazio" },
  ],
  multi: [
    { id: "qualquer", rotulo: "contém qualquer de" },
    { id: "todos", rotulo: "contém todos" },
    { id: "nenhum", rotulo: "não contém" },
    { id: "preenchido", rotulo: "está preenchido" },
    { id: "vazio", rotulo: "está vazio" },
  ],
  numero: [
    { id: "eq", rotulo: "=" },
    { id: "neq", rotulo: "≠" },
    { id: "gt", rotulo: ">" },
    { id: "gte", rotulo: "≥" },
    { id: "lt", rotulo: "<" },
    { id: "lte", rotulo: "≤" },
    { id: "entre", rotulo: "entre" },
    { id: "preenchido", rotulo: "está preenchido" },
    { id: "vazio", rotulo: "está vazio" },
  ],
  data: [
    { id: "em", rotulo: "é no dia" },
    { id: "antes", rotulo: "antes de" },
    { id: "depois", rotulo: "depois de" },
    { id: "entre", rotulo: "entre" },
    { id: "ultimos", rotulo: "nos últimos" },
    { id: "proximos", rotulo: "nos próximos" },
    { id: "preenchido", rotulo: "está preenchido" },
    { id: "vazio", rotulo: "está vazio" },
  ],
  sim_nao: [{ id: "eq", rotulo: "é" }],
};

/** Operadores que cabem no campo (sem "vazio" em campo que nunca fica vazio). */
export function operadoresDoCampo(campo: Pick<CampoDeFiltro, "tipo" | "semVazio">): { id: OperadorDeFiltro; rotulo: string }[] {
  const ops = OPERADORES_POR_TIPO[campo.tipo];
  return campo.semVazio ? ops.filter((o) => o.id !== "vazio" && o.id !== "preenchido") : ops;
}

const TODOS_OS_OPERADORES = new Set<string>([
  ...Object.values(OPERADORES_POR_TIPO).flatMap((l) => l.map((o) => o.id)),
]);

/**
 * Traz uma condição antiga (ou de outro tipo) pro vocabulário do tipo do
 * campo. Filtro salvo antes dos grupos ("Etapa é X", "Data > Y") continua
 * valendo igual: "é" numa lista vira "é qualquer de [X]", "maior que" numa
 * data vira "depois de".
 */
export function normalizarCondicao(f: FiltroDeConsulta, tipo: TipoDeFiltro): FiltroDeConsulta {
  const valores = f.valores && f.valores.length > 0 ? f.valores : f.valor ? [f.valor] : [];
  if (tipo === "lista" || tipo === "multi") {
    if (f.op === "eq") return { campo: f.campo, op: "qualquer", valores };
    if (f.op === "neq") return { campo: f.campo, op: "nenhum", valores };
    if (f.op === "qualquer" || f.op === "nenhum" || f.op === "todos") return { campo: f.campo, op: f.op, valores };
    return f;
  }
  if (tipo === "data") {
    if (f.op === "gt" || f.op === "gte") return { ...f, op: "depois" };
    if (f.op === "lt" || f.op === "lte") return { ...f, op: "antes" };
    if (f.op === "eq") return { ...f, op: "em" };
    return f;
  }
  if (tipo === "sim_nao" && f.op === "neq") return { ...f, op: "eq", valor: f.valor === "true" ? "false" : "true" };
  return f;
}

// ── Datas no fuso de São Paulo ─────────────────────────────────────────────

export const FUSO = "America/Sao_Paulo";
const DIA_MS = 24 * 60 * 60 * 1000;

/** "AAAA-MM-DD" do instante, no fuso de São Paulo. */
export function diaLocal(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: FUSO });
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Meia-noite do dia em São Paulo (UTC−3; o Brasil não tem horário de verão desde 2019). */
export function inicioDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`);
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA_MS) + 1;
}

/** Período do painel: um intervalo escolhido ou os últimos N dias, contando hoje. */
export function janelaDoPainel(dias: number, de?: string, ate?: string, agora = new Date()): Intervalo {
  if (de && ate && dataExiste(de) && dataExiste(ate)) return de <= ate ? { de, ate } : { de: ate, ate: de };
  const hoje = diaLocal(agora);
  return { de: somarDias(hoje, -(Math.max(1, dias) - 1)), ate: hoje };
}

/** O período de mesmo tamanho logo antes. */
export function janelaAnterior(j: Intervalo): Intervalo {
  const tamanho = diasEntre(j.de, j.ate);
  const ate = somarDias(j.de, -1);
  return { de: somarDias(ate, -(tamanho - 1)), ate };
}

// ── Filtros globais do painel ──────────────────────────────────────────────

/** Barra do topo do dashboard: vale pra todos os cartões. Mora na URL, não no layout. */
export interface FiltrosGlobais {
  /** Preset de "últimos N dias"; ignorado quando há `de` e `ate`. */
  dias: number;
  de?: string;
  ate?: string;
  funis: string[];
  /** Responsáveis; SEM_VALOR = sem responsável. */
  donos: string[];
}

export const FILTROS_GLOBAIS_PADRAO: FiltrosGlobais = { dias: 30, funis: [], donos: [] };

const ID = /^[A-Za-z0-9_-]{1,60}$/;

function listaDeIds(bruto: unknown, max = 50): string[] {
  const lista = Array.isArray(bruto) ? bruto : typeof bruto === "string" ? bruto.split(",") : [];
  return [...new Set(lista.map((x) => String(x).trim()).filter((x) => ID.test(x)))].slice(0, max);
}

/** Saneia os filtros globais vindos da URL ou de um corpo JSON. */
export function sanearFiltrosGlobais(bruto: Record<string, unknown> | URLSearchParams | null | undefined): FiltrosGlobais {
  const ler = (k: string): unknown => (bruto instanceof URLSearchParams ? bruto.get(k) ?? undefined : bruto?.[k]);
  const dias = Math.min(Math.max(Math.round(Number(ler("dias"))) || 30, 1), 365);
  const de = String(ler("de") ?? "");
  const ate = String(ler("ate") ?? "");
  const intervalo = dataExiste(de) && dataExiste(ate) ? (de <= ate ? { de, ate } : { de: ate, ate: de }) : null;
  return {
    dias,
    ...(intervalo ?? {}),
    funis: listaDeIds(ler("funis")),
    donos: listaDeIds(ler("donos")),
  };
}

/** Filtros globais → query string (sem os valores padrão), pro link compartilhável. */
export function filtrosGlobaisParaQuery(f: FiltrosGlobais): string {
  const p = new URLSearchParams();
  if (f.de && f.ate) {
    p.set("de", f.de);
    p.set("ate", f.ate);
  } else if (f.dias !== 30) p.set("dias", String(f.dias));
  if (f.funis.length) p.set("funis", f.funis.join(","));
  if (f.donos.length) p.set("donos", f.donos.join(","));
  return p.toString();
}

// ── Saneamento ─────────────────────────────────────────────────────────────

export type TipoDeCartao = "numero" | "linha" | "pizza" | "barras" | "tabela";

export const AGRUPAMENTOS_TEMPORAIS = ["dia", "semana", "mes", "trimestre"] as const;

export function agrupamentoTemporal(agrupar: string): boolean {
  return (AGRUPAMENTOS_TEMPORAIS as readonly string[]).includes(agrupar);
}

/** Que gráficos cabem nessa consulta. Pizza de série temporal não é uma opção. */
export function tiposPermitidos(c: Consulta): TipoDeCartao[] {
  if (!c.agrupar) return ["numero", "tabela"];
  if (agrupamentoTemporal(c.agrupar)) return ["linha", "barras"];
  return ["pizza", "barras"];
}

export function formatoDaConsulta(c: Consulta, defs: Pick<DefinicaoDeCampo, "key" | "type">[]): FormatoDeValor {
  if (c.medida === "contagem") return "inteiro";
  if (c.medida === "taxaGanho") return "porcento";
  if (c.campo === "valor" || c.campo === "ponderado") return "dinheiro";
  const def = defs.find((d) => `cf:${d.key}` === c.campo);
  if (def?.type === "currency") return "dinheiro";
  return "decimal";
}

export function formatarResultado(valor: number | null, formato: FormatoDeValor): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  if (formato === "dinheiro") return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  if (formato === "porcento") return `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (formato === "decimal") return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return valor.toLocaleString("pt-BR");
}

const CHAVE_CF = /^cf:[a-z0-9_]{1,40}$/;
const OPS_SEM_VALOR = new Set<OperadorDeFiltro>(["preenchido", "vazio"]);
const OPS_DE_LISTA = new Set<OperadorDeFiltro>(["qualquer", "nenhum", "todos"]);

function texto(v: unknown, max = 120): string {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v).slice(0, max) : "";
}

/** Catálogo de campos base que o saneamento conhece (o do dashboard, ou o das listas do CRM). */
export type CatalogoDeCampos = ReadonlyMap<string, Pick<CampoDeFiltro, "tipo" | "semVazio">>;

/** Por que uma condição foi descartada (para o aviso que volta à tela). */
export type MotivoDeDescarte = "campo" | "operador" | "valor";

/**
 * Uma condição vinda do navegador. null = inválida ou ainda rascunho (sem valor).
 * `catalogo`: campos base aceitos (padrão: os do dashboard). `motivo` recebe
 * por que a condição foi descartada, para quem quer avisar.
 */
export function sanearCondicao(
  bruto: unknown,
  catalogo: CatalogoDeCampos = CAMPO_BASE_POR_ID,
  motivo?: (m: MotivoDeDescarte) => void
): FiltroDeConsulta | null {
  if (!bruto || typeof bruto !== "object") {
    motivo?.("campo");
    return null;
  }
  const b = bruto as Record<string, unknown>;
  const campo = texto(b.campo, 44);
  const base = catalogo.get(campo);
  if (!base && !CHAVE_CF.test(campo)) {
    motivo?.("campo");
    return null;
  }
  const opBruto = texto(b.op, 20);
  if (!TODOS_OS_OPERADORES.has(opBruto)) {
    motivo?.("operador");
    return null;
  }

  let f: FiltroDeConsulta = { campo, op: opBruto as OperadorDeFiltro };
  const valor = texto(b.valor).trim();
  const ate = texto(b.ate).trim();
  const valores = Array.isArray(b.valores)
    ? [...new Set(b.valores.map((v) => texto(v).trim()).filter(Boolean))].slice(0, 50)
    : [];
  if (valor) f.valor = valor;
  if (ate) f.ate = ate;
  if (valores.length) f.valores = valores;

  // Campo base: o tipo é conhecido aqui, então o operador já sai no
  // vocabulário certo. Campo personalizado é normalizado onde a definição
  // existe (servidor e tela), porque o tipo depende dela.
  if (base) {
    f = normalizarCondicao(f, base.tipo);
    if (!operadoresDoCampo(base).some((o) => o.id === f.op)) {
      motivo?.("operador");
      return null;
    }
  }

  const invalido = (): null => {
    motivo?.("valor");
    return null;
  };
  // Filtro sem valor escolhido ainda é rascunho: ignora, em vez de zerar o cartão.
  if (OPS_SEM_VALOR.has(f.op)) return { campo, op: f.op };
  if (OPS_DE_LISTA.has(f.op)) {
    const lista = f.valores ?? (f.valor ? [f.valor] : []);
    return lista.length ? { campo, op: f.op, valores: lista } : invalido();
  }
  if (!f.valor) return invalido();
  if (f.op === "entre" && !f.ate) return invalido();
  if (f.op === "ultimos" || f.op === "proximos") {
    const n = Math.round(Number(f.valor));
    if (!Number.isFinite(n) || n < 1 || n > 3650) return invalido();
    return { campo, op: f.op, valor: String(n) };
  }
  if (base?.tipo === "data" && (!dataExiste(f.valor) || (f.op === "entre" && !dataExiste(f.ate ?? "")))) return invalido();
  if (base?.tipo === "numero" && (!Number.isFinite(parseNumero(f.valor)) || (f.op === "entre" && !Number.isFinite(parseNumero(f.ate ?? ""))))) return invalido();
  return { campo, op: f.op, valor: f.valor, ...(f.op === "entre" ? { ate: f.ate } : {}) };
}

export interface OpcoesDeSaneamento {
  /** Campos base aceitos (padrão: os do dashboard). */
  catalogo?: CatalogoDeCampos;
  /** Recebe um aviso em português por condição descartada. */
  avisar?: (aviso: string) => void;
}

const TEXTO_DO_MOTIVO: Record<MotivoDeDescarte, string> = {
  campo: "campo desconhecido",
  operador: "operador não cabe no campo",
  valor: "valor ausente ou inválido",
};

/** Filtros no formato novo (grupos) ou no antigo (lista = um grupo "e"). */
export function sanearFiltros(bruto: unknown, opcoes: OpcoesDeSaneamento = {}): FiltrosDeConsulta {
  const catalogo = opcoes.catalogo ?? CAMPO_BASE_POR_ID;
  const sanear = (c: unknown): FiltroDeConsulta | null =>
    sanearCondicao(c, catalogo, (m) => {
      const nome = c && typeof c === "object" ? texto((c as Record<string, unknown>).campo, 44) : "";
      opcoes.avisar?.(`Condição ${nome ? `“${nome}” ` : ""}ignorada: ${TEXTO_DO_MOTIVO[m]}.`);
    });
  if (Array.isArray(bruto)) {
    const condicoes = bruto.slice(0, LIMITE_DE_CONDICOES).map(sanear).filter((f): f is FiltroDeConsulta => !!f);
    return { logica: "e", grupos: condicoes.length ? [{ logica: "e", condicoes }] : [] };
  }
  if (!bruto || typeof bruto !== "object") return { logica: "e", grupos: [] };
  const b = bruto as Record<string, unknown>;
  const grupos: GrupoDeFiltros[] = [];
  for (const g of Array.isArray(b.grupos) ? b.grupos.slice(0, LIMITE_DE_GRUPOS) : []) {
    const gg = (g ?? {}) as Record<string, unknown>;
    const condicoes = (Array.isArray(gg.condicoes) ? gg.condicoes.slice(0, LIMITE_DE_CONDICOES) : [])
      .map(sanear)
      .filter((f): f is FiltroDeConsulta => !!f);
    if (condicoes.length) grupos.push({ logica: gg.logica === "ou" ? "ou" : "e", condicoes });
  }
  return { logica: b.logica === "ou" ? "ou" : "e", grupos };
}

function sanearPeriodo(bruto: unknown): Consulta["periodo"] {
  if (bruto === "painel") return "painel";
  if (bruto && typeof bruto === "object") {
    const de = texto((bruto as Record<string, unknown>).de, 10);
    const ate = texto((bruto as Record<string, unknown>).ate, 10);
    if (dataExiste(de) && dataExiste(ate)) return de <= ate ? { de, ate } : { de: ate, ate: de };
  }
  return "tudo";
}

/** Saneia uma consulta vinda do navegador (ou salva no formato antigo). Devolve null se não for aproveitável. */
export function sanearConsulta(bruto: unknown): Consulta | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;

  const medida = MEDIDAS.find((m) => m.id === b.medida)?.id;
  if (!medida) return null;
  const status = STATUS.find((s) => s.id === b.status)?.id ?? "todos";

  const agrupar = String(b.agrupar ?? "");
  if (agrupar && !AGRUPAMENTOS_VALIDOS.has(agrupar) && !CHAVE_CF.test(agrupar)) return null;

  let campo: string | undefined;
  if (medidaPrecisaCampo(medida)) {
    const c = String(b.campo ?? "");
    if (c !== "valor" && c !== "ponderado" && !CHAVE_CF.test(c)) return null;
    campo = c;
  }

  // `funilId` (um só) é do formato antigo; vira a lista.
  const funilIds = listaDeIds(Array.isArray(b.funilIds) ? b.funilIds : typeof b.funilId === "string" && b.funilId ? [b.funilId] : [], 20);
  const dataBase = DATAS_BASE.find((d) => d.id === b.dataBase)?.id;

  return {
    medida,
    campo,
    agrupar,
    status,
    funilIds,
    periodo: sanearPeriodo(b.periodo),
    ...(dataBase ? { dataBase } : {}),
    filtros: sanearFiltros(b.filtros),
    ...(b.comparar === true ? { comparar: true } : {}),
  };
}

/** Data que conta: a escolhida ou, sem escolha, a de antes (fechamento para ganhos e perdidos). */
export function dataBaseEfetiva(c: Pick<Consulta, "dataBase" | "status">): DataBase {
  if (c.dataBase) return c.dataBase;
  return c.status === "ganhos" || c.status === "perdidos" ? "fechamento" : "criacao";
}

export function totalDeCondicoes(f: FiltrosDeConsulta): number {
  return f.grupos.reduce((s, g) => s + g.condicoes.length, 0);
}

// ── Descrição em português ─────────────────────────────────────────────────

export interface RotulosDaConsulta {
  campos: DefParaFiltro[];
  funis: { id: string; name: string; stages?: { id: string; name: string }[] }[];
  membros?: { id: string; name: string }[];
  empresas?: { id: string; name: string }[];
  etiquetas?: { id: string; name: string }[];
}

function dataBr(dia: string | undefined): string {
  if (!dia || !dataExiste(dia)) return dia ?? "";
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function numeroBr(v: string | undefined, formato?: CampoDeFiltro["formato"]): string {
  const n = parseNumero(v ?? "");
  if (!Number.isFinite(n)) return v ?? "";
  if (formato === "dinheiro") {
    const casas = Number.isInteger(n) ? 0 : 2;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  if (formato === "porcento") return `${n.toLocaleString("pt-BR")}%`;
  if (formato === "dias") return `${n.toLocaleString("pt-BR")} ${n === 1 ? "dia" : "dias"}`;
  return n.toLocaleString("pt-BR");
}

/** Rótulo de um item de lista (etapa, responsável, opção do campo...). */
export function rotuloDoItem(campo: CampoDeFiltro, valor: string, r: RotulosDaConsulta): string {
  if (valor === SEM_VALOR) return campo.id === "empresa" ? "sem empresa" : "sem responsável";
  const achar = (l?: { id: string; name: string }[]) => l?.find((x) => x.id === valor)?.name;
  switch (campo.opcoes) {
    case "funis": return achar(r.funis) ?? "funil removido";
    case "etapas": return achar(r.funis.flatMap((f) => f.stages ?? [])) ?? "etapa removida";
    case "tiposEtapa": return ROTULO_TIPO_ETAPA[valor] ?? valor;
    case "membros": return achar(r.membros) ?? "pessoa removida";
    case "empresas": return achar(r.empresas) ?? "empresa removida";
    case "etiquetas": return achar(r.etiquetas) ?? "etiqueta removida";
    case "canais": return ROTULO_CANAL[valor] ?? valor;
    case "campo": return campo.def?.options?.find((o) => o.value === valor)?.label ?? valor;
    default: return valor;
  }
}

function juntar(itens: string[], conectivo: "ou" | "e" | "nem"): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} ${conectivo} ${itens[itens.length - 1]}`;
}

/** "Segmento é Varejo ou Saúde", "Valor ≥ R$ 5.000,00". */
export function descreverCondicao(bruta: FiltroDeConsulta, r: RotulosDaConsulta): string {
  const campo = campoDeFiltro(bruta.campo, r.campos);
  if (!campo) return "campo removido";
  const f = normalizarCondicao(bruta, campo.tipo);
  const nome = campo.rotulo;
  if (f.op === "preenchido") return `${nome} informado`;
  if (f.op === "vazio") return `${nome} não informado`;

  if (campo.tipo === "lista" || campo.tipo === "multi") {
    const itens = (f.valores ?? []).map((v) => rotuloDoItem(campo, v, r));
    const multi = campo.tipo === "multi";
    if (f.op === "qualquer") return `${nome} ${multi ? "contém" : "é"} ${juntar(itens, "ou")}`;
    if (f.op === "todos") return `${nome} contém ${juntar(itens, "e")}`;
    return `${nome} ${multi ? "não contém" : "não é"} ${juntar(itens, "nem")}`;
  }
  if (campo.tipo === "sim_nao") return `${nome} é ${f.valor === "true" ? "Sim" : "Não"}`;
  if (campo.tipo === "numero") {
    const v = numeroBr(f.valor, campo.formato);
    if (f.op === "entre") return `${nome} entre ${v} e ${numeroBr(f.ate, campo.formato)}`;
    const simbolo = OPERADORES_POR_TIPO.numero.find((o) => o.id === f.op)?.rotulo ?? f.op;
    return `${nome} ${simbolo} ${v}`;
  }
  if (campo.tipo === "data") {
    if (f.op === "em") return `${nome} ${dataBr(f.valor)}`;
    if (f.op === "antes") return `${nome} antes de ${dataBr(f.valor)}`;
    if (f.op === "depois") return `${nome} depois de ${dataBr(f.valor)}`;
    if (f.op === "entre") return `${nome} entre ${dataBr(f.valor)} e ${dataBr(f.ate)}`;
    if (f.op === "ultimos") return `${nome} nos últimos ${f.valor} dias`;
    if (f.op === "proximos") return `${nome} nos próximos ${f.valor} dias`;
  }
  const rot = OPERADORES_POR_TIPO.texto.find((o) => o.id === f.op)?.rotulo ?? f.op;
  return `${nome} ${rot} “${f.valor ?? ""}”`;
}

/** Os grupos de filtro numa frase: "(A e B) ou C". */
export function descreverFiltros(filtros: FiltrosDeConsulta, r: RotulosDaConsulta): string {
  const grupos = filtros.grupos.filter((g) => g.condicoes.length > 0);
  const partes = grupos.map((g) => {
    const frase = g.condicoes.map((f) => descreverCondicao(f, r)).join(g.logica === "ou" ? " ou " : " e ");
    return grupos.length > 1 && g.condicoes.length > 1 ? `(${frase})` : frase;
  });
  return partes.join(filtros.logica === "ou" ? " ou " : " e ");
}

function rotuloDoAgrupamento(id: string, r: RotulosDaConsulta): string {
  const base = AGRUPAMENTOS_BASE.find((a) => a.id === id);
  if (base) return base.rotulo.replace(/^Por /, "").toLowerCase();
  const def = r.campos.find((d) => `cf:${d.key}` === id);
  if (!def) return "campo removido";
  const emFaixas = def.type === "number" || def.type === "currency" ? " (em faixas)" : "";
  return `${def.label.toLowerCase()}${emFaixas}`;
}

function rotuloDoPeriodo(c: Consulta): string {
  if (c.periodo === "tudo") return "";
  const base = { criacao: "criados", fechamento: "fechados", previsao: "com previsão" }[dataBaseEfetiva(c)];
  if (c.periodo === "painel") return `${base} no período do painel`;
  return `${base} de ${dataBr(c.periodo.de)} a ${dataBr(c.periodo.ate)}`;
}

/**
 * Resumo de quais negócios entram: "Negócios do funil Vendas B2B em que
 * Segmento é Varejo ou Saúde e Valor ≥ R$ 5.000,00".
 */
export function descreverSelecao(c: Consulta, r: RotulosDaConsulta): string {
  const status = { abertos: "em andamento", ganhos: "ganhos", perdidos: "perdidos", todos: "" }[c.status];
  let frase = ["Negócios", status].filter(Boolean).join(" ");
  if (c.funilIds.length) {
    const nomes = c.funilIds.map((id) => r.funis.find((f) => f.id === id)?.name ?? "removido");
    frase += ` ${nomes.length > 1 ? "dos funis" : "do funil"} ${juntar(nomes, "e")}`;
  }
  const periodo = rotuloDoPeriodo(c);
  if (periodo) frase += `, ${periodo}`;
  const filtros = descreverFiltros(c.filtros, r);
  if (filtros) frase += `, em que ${filtros}`;
  return frase;
}

/** Frase curta que resume a consulta, mostrada no cartão e usada de título sugerido. */
export function descreverConsulta(c: Consulta, r: RotulosDaConsulta): string {
  const rotuloCampo = (id?: string) =>
    CAMPOS_BASE_NUMERICOS.find((x) => x.id === id)?.rotulo ?? r.campos.find((d) => `cf:${d.key}` === id)?.label ?? "campo removido";
  const medida = MEDIDAS.find((m) => m.id === c.medida);
  const o =
    c.medida === "contagem"
      ? "Quantidade de negócios"
      : c.medida === "taxaGanho"
        ? "Taxa de ganho"
        : `${medida?.rotulo ?? ""} de ${rotuloCampo(c.campo).toLowerCase()}`;
  const partes = [o];
  if (c.agrupar) partes.push(`por ${rotuloDoAgrupamento(c.agrupar, r)}`);
  partes.push(STATUS.find((s) => s.id === c.status)?.rotulo.toLowerCase() ?? "");
  if (c.funilIds.length === 1) partes.push(`no funil ${r.funis.find((f) => f.id === c.funilIds[0])?.name ?? "removido"}`);
  else if (c.funilIds.length > 1) partes.push(`em ${c.funilIds.length} funis`);
  const n = totalDeCondicoes(c.filtros);
  if (n > 0) partes.push(`${n} filtro(s)`);
  return partes.filter(Boolean).join(", ");
}
