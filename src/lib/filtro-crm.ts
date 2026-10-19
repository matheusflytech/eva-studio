import {
  CAMPOS_DE_FILTRO,
  FILTROS_VAZIOS,
  sanearCondicao,
  sanearFiltros,
  type CampoDeFiltro,
  type CatalogoDeCampos,
  type FiltroDeConsulta,
  type FiltrosDeConsulta,
  type FonteDeOpcoes,
} from "@/lib/consulta";

// ---------------------------------------------------------------------------
// Filtros das listas do CRM (contatos e negócios): catálogo de campos,
// saneamento, ordenação e paginação. Mesmo FORMATO de condição do dashboard
// (src/lib/consulta.ts: grupos E/OU, `campo`, `op`, `valor/valores/ate`), só
// que com o catálogo de cada lista. Sem `server-only`: a tela (L2/L3) usa o
// mesmo catálogo para montar a barra de filtros e o editor avançado.
// O motor que transforma isso em `where` mora em src/lib/server/filtro-crm.ts.
// ---------------------------------------------------------------------------

export type EntidadeCrm = "contatos" | "negocios";

/** De onde a tela tira as opções de uma lista (além das do dashboard). */
export type FonteDeOpcoesCrm = FonteDeOpcoes | "equipes" | "segmentos" | "contatos" | "produtos" | "tarefas";

export interface CampoCrm extends Omit<CampoDeFiltro, "grupo" | "opcoes"> {
  grupo: string;
  opcoes?: FonteDeOpcoesCrm;
}

/** Valores fixos do filtro "Tarefas" dos negócios. */
export const VALORES_DE_TAREFA = [
  { id: "atrasada", rotulo: "Com tarefa atrasada" },
  { id: "hoje", rotulo: "Com tarefa para hoje" },
  { id: "comTarefa", rotulo: "Com tarefa em aberto" },
  { id: "semTarefa", rotulo: "Sem tarefa em aberto" },
] as const;

export const CAMPOS_DE_CONTATO: CampoCrm[] = [
  { id: "nome", rotulo: "Nome", tipo: "texto", grupo: "Contato" },
  { id: "email", rotulo: "E-mail", tipo: "texto", grupo: "Contato" },
  { id: "telefone", rotulo: "Telefone", tipo: "texto", grupo: "Contato" },
  { id: "responsavel", rotulo: "Proprietário", tipo: "lista", grupo: "Contato", opcoes: "membros" },
  { id: "equipe", rotulo: "Equipe", tipo: "lista", grupo: "Contato", opcoes: "equipes" },
  { id: "empresa", rotulo: "Empresa", tipo: "lista", grupo: "Contato", opcoes: "empresas" },
  { id: "etiqueta", rotulo: "Etiquetas", tipo: "multi", grupo: "Contato", opcoes: "etiquetas" },
  { id: "segmento", rotulo: "Segmento", tipo: "lista", grupo: "Contato", semVazio: true, opcoes: "segmentos" },
  { id: "canal", rotulo: "Canal", tipo: "lista", grupo: "Contato", opcoes: "canais" },
  { id: "optIn", rotulo: "Aceita mensagens (opt-in)", tipo: "sim_nao", grupo: "Contato" },
  { id: "criadoEm", rotulo: "Criado em", tipo: "data", grupo: "Datas", semVazio: true },
  { id: "ultimaAtividade", rotulo: "Última atividade", tipo: "data", grupo: "Datas", semVazio: true },
];

/** Os campos do dashboard (mesmos ids) + os que só a lista tem. */
export const CAMPOS_DE_NEGOCIO: CampoCrm[] = [
  ...CAMPOS_DE_FILTRO.map((c): CampoCrm => ({ ...c })),
  { id: "equipe", rotulo: "Equipe", tipo: "lista", grupo: "Negócio", opcoes: "equipes" },
  { id: "contato", rotulo: "Contato", tipo: "lista", grupo: "Contato", opcoes: "contatos" },
  { id: "produto", rotulo: "Produto", tipo: "lista", grupo: "Negócio", opcoes: "produtos" },
  { id: "tarefa", rotulo: "Tarefas", tipo: "lista", grupo: "Negócio", semVazio: true, opcoes: "tarefas" },
];

export function camposDaEntidade(entidade: EntidadeCrm): CampoCrm[] {
  return entidade === "contatos" ? CAMPOS_DE_CONTATO : CAMPOS_DE_NEGOCIO;
}

const CATALOGO: Record<EntidadeCrm, CatalogoDeCampos> = {
  contatos: new Map(CAMPOS_DE_CONTATO.map((c) => [c.id, c])),
  negocios: new Map(CAMPOS_DE_NEGOCIO.map((c) => [c.id, c])),
};

export function campoCrm(entidade: EntidadeCrm, id: string): CampoCrm | undefined {
  return camposDaEntidade(entidade).find((c) => c.id === id);
}

/**
 * Filtro de uma lista: os grupos E/OU (filtros avançados) + a busca de texto
 * da caixa + os filtros rápidos da barra ("Proprietário ▾", "Criado em ▾"),
 * que valem sempre em E com o resto. Os rápidos ficam fora dos grupos para
 * não disputar o limite de grupos/condições nem mudar o sentido de um OU.
 */
export interface FiltroCrm extends FiltrosDeConsulta {
  busca?: string;
  rapidos?: FiltroDeConsulta[];
}

/** Quantas condições rápidas a barra pode mandar (uma por filtro da barra). */
export const LIMITE_DE_RAPIDOS = 16;

export const FILTRO_CRM_VAZIO: FiltroCrm = FILTROS_VAZIOS;

/**
 * Saneia o filtro vindo da tela (objeto, ou JSON em texto da query string).
 * Campo/operador desconhecido e condição incompleta caem com aviso; campo
 * personalizado (cf:<chave>) só é conferido no servidor, onde a definição existe.
 */
export function sanearFiltroCrm(bruto: unknown, entidade: EntidadeCrm): { filtro: FiltroCrm; avisos: string[] } {
  const avisos: string[] = [];
  let valor = bruto;
  if (typeof bruto === "string") {
    if (!bruto.trim()) return { filtro: FILTRO_CRM_VAZIO, avisos };
    try {
      valor = JSON.parse(bruto);
    } catch {
      return { filtro: FILTRO_CRM_VAZIO, avisos: ["Filtro ignorado: não é um JSON válido."] };
    }
  }
  const filtros = sanearFiltros(valor, { catalogo: CATALOGO[entidade], avisar: (a) => avisos.push(a) });
  const b = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  const busca = typeof b.busca === "string" ? b.busca.trim().slice(0, 120) : "";
  const rapidos = sanearRapidos(b.rapidos, entidade, avisos);
  return { filtro: { ...filtros, ...(busca ? { busca } : {}), ...(rapidos.length ? { rapidos } : {}) }, avisos };
}

/**
 * Condições da barra de filtros rápidos. Só campos do catálogo (campo
 * personalizado fica nos avançados, onde pode precisar de avaliação em
 * memória); inválida ou rascunho cai com aviso.
 */
function sanearRapidos(bruto: unknown, entidade: EntidadeCrm, avisos: string[]): FiltroDeConsulta[] {
  if (!Array.isArray(bruto)) return [];
  const out: FiltroDeConsulta[] = [];
  for (const item of bruto.slice(0, LIMITE_DE_RAPIDOS)) {
    const campo = item && typeof item === "object" ? String((item as Record<string, unknown>).campo ?? "").slice(0, 44) : "";
    if (campo.startsWith("cf:")) {
      avisos.push(`Filtro rápido “${campo}” ignorado: campo personalizado vai nos filtros avançados.`);
      continue;
    }
    const f = sanearCondicao(item, CATALOGO[entidade]);
    if (f) out.push(f);
    else avisos.push(`Filtro rápido ${campo ? `“${campo}” ` : ""}ignorado: inválido.`);
  }
  return out;
}

// ── Ordenação e paginação ──────────────────────────────────────────────────

export type Direcao = "asc" | "desc";

export interface Ordenacao {
  campo: string;
  direcao: Direcao;
}

export const ORDENACOES: Record<EntidadeCrm, { id: string; rotulo: string }[]> = {
  contatos: [
    { id: "nome", rotulo: "Nome" },
    { id: "email", rotulo: "E-mail" },
    { id: "telefone", rotulo: "Telefone" },
    { id: "empresa", rotulo: "Empresa" },
    { id: "responsavel", rotulo: "Proprietário" },
    { id: "criadoEm", rotulo: "Criado em" },
    { id: "ultimaAtividade", rotulo: "Última atividade" },
  ],
  negocios: [
    { id: "nome", rotulo: "Nome" },
    { id: "valor", rotulo: "Valor" },
    { id: "etapa", rotulo: "Etapa" },
    { id: "responsavel", rotulo: "Responsável" },
    { id: "criadoEm", rotulo: "Criado em" },
    { id: "previsao", rotulo: "Previsão de fechamento" },
    { id: "fechadoEm", rotulo: "Fechado em" },
    { id: "diasNaEtapa", rotulo: "Dias na etapa" },
  ],
};

export const ORDENACAO_PADRAO: Record<EntidadeCrm, Ordenacao> = {
  contatos: { campo: "ultimaAtividade", direcao: "desc" },
  negocios: { campo: "criadoEm", direcao: "desc" },
};

/**
 * Ordenação pedida: { campo, direcao } ou "campo" / "campo:asc" / "-campo".
 * Coluna fora da lista volta a padrão com aviso (nunca vira orderBy livre).
 */
export function lerOrdenacao(bruto: unknown, entidade: EntidadeCrm, direcaoBruta?: unknown): { ordenacao: Ordenacao; aviso?: string } {
  const padrao = ORDENACAO_PADRAO[entidade];
  if (bruto === undefined || bruto === null || bruto === "") return { ordenacao: padrao };
  let campo = "";
  let direcao: unknown = direcaoBruta;
  if (typeof bruto === "string") {
    // "cf:chave" também tem dois-pontos: a direção só conta se for o sufixo.
    const m = /^(.*):(asc|desc)$/.exec(bruto.trim());
    const c = m ? m[1] : bruto.trim();
    campo = c.startsWith("-") ? c.slice(1) : c;
    direcao = c.startsWith("-") ? "desc" : (m?.[2] ?? direcao);
  } else if (typeof bruto === "object") {
    const b = bruto as Record<string, unknown>;
    campo = typeof b.campo === "string" ? b.campo : "";
    direcao = b.direcao ?? direcao;
  }
  if (!ORDENACOES[entidade].some((o) => o.id === campo)) {
    const nome = String(campo).slice(0, 40);
    const aviso = nome.startsWith("cf:")
      ? `Ordenar por campo personalizado ainda não é possível; usada a ordem padrão.`
      : `Ordenação “${nome}” não é permitida; usada a ordem padrão.`;
    return { ordenacao: padrao, aviso };
  }
  return { ordenacao: { campo, direcao: direcao === "asc" ? "asc" : "desc" } };
}

export const TAMANHOS_DE_PAGINA = [25, 50, 100] as const;

/** 25, 50 ou 100. Qualquer outra coisa vira 25. */
export function lerTamanhoDePagina(bruto: unknown): number {
  const n = Number(bruto);
  return (TAMANHOS_DE_PAGINA as readonly number[]).includes(n) ? n : 25;
}

/** Página ≥ 1 (inteira). Página além do fim devolve lista vazia com o total. */
export function lerPagina(bruto: unknown): number {
  const n = Math.floor(Number(bruto));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100_000) : 1;
}
