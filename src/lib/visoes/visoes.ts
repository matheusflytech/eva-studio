import { FILTROS_VAZIOS, LIMITE_DE_CONDICOES, LIMITE_DE_GRUPOS, type FiltroDeConsulta, type FiltrosDeConsulta, type GrupoDeFiltros } from "@/lib/consulta";
import { campoCrm, type EntidadeCrm } from "@/lib/filtro-crm";
import {
  estadoVazio,
  lerPeriodo,
  periodoParaTexto,
  type EstadoDaLista,
  type PadraoDaLista,
  type Periodo,
} from "@/lib/listas/estado-da-lista";

// ---------------------------------------------------------------------------
// Visões salvas das listas (Contatos e Negócios) — parte pura, usada pela tela
// e pelo servidor. Uma visão salva guarda o estado da lista (busca, filtros da
// barra, avançados, ordem, itens por página), as colunas, as colunas
// recolhidas do quadro e o modo (quadro/lista), sobre uma visão de sistema
// (`visaoBase`: "Meus" continua sendo "de quem está olhando").
//
// Regras de quem vê e quem mexe também moram aqui (testáveis sem banco):
//   ver    = dono, OU visibilidade "contrato", OU "equipe" e a pessoa está na equipe;
//   mexer  = dono, OU (compartilhada E a pessoa administra o contrato).
// Quem não pode mexer só duplica ("Salvar como nova") e escolhe como padrão.
// ---------------------------------------------------------------------------

export type Visibilidade = "pessoal" | "equipe" | "contrato";
export const VISIBILIDADES: Visibilidade[] = ["pessoal", "equipe", "contrato"];

export const ROTULO_DA_VISIBILIDADE: Record<Visibilidade, string> = {
  pessoal: "Só eu",
  equipe: "Minha equipe",
  contrato: "Todo o contrato",
};

export type ModoDaVisao = "kanban" | "lista";

/** Estado da lista como fica guardado (períodos em texto, ordem "campo:dir"). */
export interface EstadoGuardado {
  busca: string;
  listas: Record<string, string[]>;
  datas: Record<string, string>;
  avancado: FiltrosDeConsulta;
  ordem: string | null;
  tamanho: number;
}

export interface ConfigDaVisao {
  /** Visão de sistema em que a salva se apoia ("todos", "meus"...). */
  visaoBase: string;
  estado: EstadoGuardado;
  colunas?: string[];
  recolhidas?: string[];
  modo?: ModoDaVisao;
}

export interface VisaoSalva {
  id: string;
  entidade: EntidadeCrm;
  pipelineId: string | null;
  nome: string;
  donoId: string;
  donoNome: string;
  visibilidade: Visibilidade;
  teamId: string | null;
  config: ConfigDaVisao;
  posicao: number;
  podeEditar: boolean;
}

export const LIMITE_DE_NOME = 80;
/** Visões salvas por pessoa e lista (as dela). Evita aba sem fim. */
export const LIMITE_DE_VISOES_POR_PESSOA = 50;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ids = (v: unknown, max = 60): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 120))].slice(0, max) : [];

export function ehVisibilidade(v: unknown): v is Visibilidade {
  return v === "pessoal" || v === "equipe" || v === "contrato";
}

export function nomeDaVisao(bruto: unknown): string {
  return texto(bruto, LIMITE_DE_NOME).replace(/\s+/g, " ");
}

/** Avançados guardados: só a estrutura, com os limites do editor. */
function avancadoGuardado(v: unknown): FiltrosDeConsulta {
  if (!v || typeof v !== "object" || !Array.isArray((v as FiltrosDeConsulta).grupos)) return FILTROS_VAZIOS;
  const b = v as FiltrosDeConsulta;
  return {
    logica: b.logica === "ou" ? "ou" : "e",
    grupos: b.grupos
      .filter((g) => g && Array.isArray(g.condicoes) && g.condicoes.length > 0)
      .slice(0, LIMITE_DE_GRUPOS)
      .map((g): GrupoDeFiltros => ({
        logica: g.logica === "ou" ? "ou" : "e",
        condicoes: g.condicoes
          .filter((c) => c && typeof c === "object" && typeof c.campo === "string" && typeof c.op === "string")
          .slice(0, LIMITE_DE_CONDICOES)
          .map((c): FiltroDeConsulta => ({
            campo: c.campo.slice(0, 44),
            op: c.op.slice(0, 20) as FiltroDeConsulta["op"],
            ...(typeof c.valor === "string" ? { valor: c.valor.slice(0, 200) } : {}),
            ...(typeof c.ate === "string" ? { ate: c.ate.slice(0, 200) } : {}),
            ...(Array.isArray(c.valores) ? { valores: ids(c.valores, 100) } : {}),
          })),
      }))
      .filter((g) => g.condicoes.length > 0),
  };
}

/**
 * Config vinda da tela (ou do banco) → config limpa. Nunca lança: o que não
 * cabe cai. `visoesDeSistema` = ids aceitos em `visaoBase` (o resto vira o primeiro).
 */
export function sanearConfig(bruto: unknown, visoesDeSistema: readonly string[]): ConfigDaVisao {
  const b = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  const e = b.estado && typeof b.estado === "object" ? (b.estado as Record<string, unknown>) : {};
  const listas: Record<string, string[]> = {};
  if (e.listas && typeof e.listas === "object") {
    for (const [campo, valores] of Object.entries(e.listas as Record<string, unknown>).slice(0, 20)) {
      const v = ids(valores, 50);
      if (v.length && /^[A-Za-z]{1,40}$/.test(campo)) listas[campo] = v;
    }
  }
  const datas: Record<string, string> = {};
  if (e.datas && typeof e.datas === "object") {
    for (const [campo, t] of Object.entries(e.datas as Record<string, unknown>).slice(0, 20)) {
      const p = typeof t === "string" ? lerPeriodo(t) : null;
      if (p && /^[A-Za-z]{1,40}$/.test(campo)) datas[campo] = periodoParaTexto(p);
    }
  }
  const ordem = typeof e.ordem === "string" && /^[A-Za-z]{1,40}:(asc|desc)$/.test(e.ordem) ? e.ordem : null;
  const tamanho = [25, 50, 100].includes(Number(e.tamanho)) ? Number(e.tamanho) : 25;
  const visaoBase = typeof b.visaoBase === "string" && visoesDeSistema.includes(b.visaoBase) ? b.visaoBase : (visoesDeSistema[0] ?? "todos");
  const colunas = ids(b.colunas);
  const recolhidas = Array.isArray(b.recolhidas) ? ids(b.recolhidas, 100) : undefined;
  return {
    visaoBase,
    estado: { busca: texto(e.busca, 120), listas, datas, avancado: avancadoGuardado(e.avancado), ordem, tamanho },
    ...(colunas.length ? { colunas } : {}),
    ...(recolhidas ? { recolhidas } : {}),
    ...(b.modo === "kanban" || b.modo === "lista" ? { modo: b.modo } : {}),
  };
}

/** Estado atual da tela → config para salvar. */
export function configDoEstado(
  e: EstadoDaLista,
  extras: { visaoBase: string; colunas?: string[]; recolhidas?: string[]; modo?: ModoDaVisao }
): ConfigDaVisao {
  const datas: Record<string, string> = {};
  for (const [campo, p] of Object.entries(e.datas)) datas[campo] = periodoParaTexto(p as Periodo);
  const listas: Record<string, string[]> = {};
  for (const [campo, v] of Object.entries(e.listas)) if (v.length) listas[campo] = [...v];
  const colunas = e.colunas ?? extras.colunas;
  const recolhidas = e.recolhidas ?? extras.recolhidas;
  return {
    visaoBase: extras.visaoBase,
    estado: {
      busca: e.busca.trim(),
      listas,
      datas,
      avancado: e.avancado,
      ordem: e.ordem ? `${e.ordem.key}:${e.ordem.direction}` : null,
      tamanho: e.tamanho,
    },
    ...(colunas?.length ? { colunas: [...colunas] } : {}),
    ...(recolhidas ? { recolhidas: [...recolhidas] } : {}),
    ...(extras.modo ? { modo: extras.modo } : {}),
  };
}

/** Config guardada → estado da lista (é a `base` da URL quando a visão está aberta). */
export function estadoDaConfig(cfg: ConfigDaVisao, padrao: PadraoDaLista, idDaVisao: string): EstadoDaLista {
  const e = estadoVazio(padrao);
  e.visao = idDaVisao;
  e.busca = cfg.estado.busca;
  e.listas = Object.fromEntries(Object.entries(cfg.estado.listas).map(([k, v]) => [k, [...v]]));
  for (const [campo, t] of Object.entries(cfg.estado.datas)) {
    const p = lerPeriodo(t);
    if (p) e.datas[campo] = p;
  }
  e.avancado = cfg.estado.avancado;
  const m = cfg.estado.ordem ? /^([A-Za-z]+):(asc|desc)$/.exec(cfg.estado.ordem) : null;
  e.ordem = m ? { key: m[1], direction: m[2] as "asc" | "desc" } : null;
  e.tamanho = cfg.estado.tamanho;
  if (cfg.colunas?.length) e.colunas = [...cfg.colunas];
  if (cfg.recolhidas) e.recolhidas = [...cfg.recolhidas];
  return e;
}

// ── Campo removido ─────────────────────────────────────────────────────────

export interface CondicaoOrfa {
  campo: string;
  /** Texto do chip ("campo removido: plano"). */
  rotulo: string;
}

/**
 * Condições dos avançados cujo campo não existe mais (campo personalizado
 * apagado, ou id que saiu do catálogo). O motor já as ignora com aviso; a tela
 * mostra cada uma como chip "campo removido" e oferece tirar do filtro.
 */
export function camposRemovidos(av: FiltrosDeConsulta, entidade: EntidadeCrm, chavesPersonalizadas: readonly string[]): CondicaoOrfa[] {
  const vistas = new Set<string>();
  const out: CondicaoOrfa[] = [];
  for (const c of av.grupos.flatMap((g) => g.condicoes)) {
    const removido = c.campo.startsWith("cf:") ? !chavesPersonalizadas.includes(c.campo.slice(3)) : !campoCrm(entidade, c.campo);
    if (!removido || vistas.has(c.campo)) continue;
    vistas.add(c.campo);
    out.push({ campo: c.campo, rotulo: `campo removido: ${c.campo.startsWith("cf:") ? c.campo.slice(3) : c.campo}` });
  }
  return out;
}

/** Tira dos avançados as condições de campos removidos (grupo que esvazia sai). */
export function semCamposRemovidos(av: FiltrosDeConsulta, removidos: readonly string[]): FiltrosDeConsulta {
  if (!removidos.length) return av;
  const grupos = av.grupos
    .map((g) => ({ ...g, condicoes: g.condicoes.filter((c) => !removidos.includes(c.campo)) }))
    .filter((g) => g.condicoes.length > 0);
  return { logica: av.logica, grupos };
}

// ── Quem vê, quem mexe ─────────────────────────────────────────────────────

export interface QuemOlha {
  userId: string;
  /** Equipes da pessoa neste contrato. */
  equipes: readonly string[];
  /** Administra o contrato (pode compartilhar com todos e mexer nas compartilhadas). */
  admin: boolean;
}

type VisaoMinima = { ownerId: string; visibility: string; teamId: string | null };

export function podeVer(v: VisaoMinima, q: QuemOlha): boolean {
  if (v.ownerId === q.userId) return true;
  if (v.visibility === "contrato") return true;
  return v.visibility === "equipe" && !!v.teamId && q.equipes.includes(v.teamId);
}

export function podeMexer(v: VisaoMinima, q: QuemOlha): boolean {
  if (v.ownerId === q.userId) return true;
  return q.admin && v.visibility !== "pessoal" && podeVer(v, q);
}

/**
 * A pessoa pode deixar a visão com esta visibilidade? Equipe: só uma equipe
 * dela (admin: qualquer do contrato, conferida pelo servidor). Contrato: só admin.
 * Devolve a mensagem do erro, ou null.
 */
export function conferirVisibilidade(vis: Visibilidade, teamId: string | null, q: QuemOlha): string | null {
  if (vis === "contrato" && !q.admin) return "Só quem administra o contrato compartilha uma visão com todos.";
  if (vis === "equipe") {
    if (!teamId) return "Escolha a equipe.";
    if (!q.admin && !q.equipes.includes(teamId)) return "Você só compartilha com uma equipe da qual participa.";
  }
  return null;
}

/** Visões de sistema de cada lista (fixas, não apagáveis). A primeira é a padrão. */
export const VISOES_DE_SISTEMA: Record<EntidadeCrm, readonly string[]> = {
  contatos: ["todos", "meus", "sem-dono"],
  negocios: ["todos", "meus", "atencao", "fechando"],
};
