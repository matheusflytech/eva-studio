import {
  FILTROS_VAZIOS,
  LIMITE_DE_CONDICOES,
  LIMITE_DE_GRUPOS,
  diaLocal,
  type FiltroDeConsulta,
  type FiltrosDeConsulta,
} from "@/lib/consulta";
import { dataExiste } from "@/lib/custom-fields";
import type { FiltroCrm } from "@/lib/filtro-crm";
import type { SortState } from "@/lib/design-system/pagination";

// ---------------------------------------------------------------------------
// Estado de uma lista do CRM (contatos, negócios em lista e no quadro):
// visão, busca, filtros rápidos da barra, filtros avançados, ordem e página.
// Vive na URL, para o link ser compartilhável:
//
//   ?v=meus&q=ana&dono=u1,__nenhum&criado=30d&av=<JSON>&ordem=nome:asc&p=2&pp=50
//
// Puro (sem React): a tela lê com lerEstadoDaUrl e grava com estadoParaUrl, e
// montarFiltro transforma o estado no filtro que o servidor entende
// (src/lib/filtro-crm.ts: grupos avançados + busca + rapidos).
// ---------------------------------------------------------------------------

/** Período de um filtro de data da barra ("Criado em ▾"). */
export type Periodo =
  | { tipo: "hoje" }
  | { tipo: "ultimos"; dias: number }
  | { tipo: "esteMes" }
  | { tipo: "entre"; de: string; ate: string };

/** Um filtro da barra: campo do catálogo, rótulo, nome na URL e tipo. */
export interface FiltroDaBarra {
  campo: string;
  rotulo: string;
  /** Nome curto na URL ("dono", "criado"). */
  param: string;
  tipo: "lista" | "data";
}

export interface EstadoDaLista {
  visao: string;
  busca: string;
  /** Escolhas dos filtros de lista, por campo. */
  listas: Record<string, string[]>;
  /** Período dos filtros de data, por campo. */
  datas: Record<string, Periodo>;
  avancado: FiltrosDeConsulta;
  ordem: SortState | null;
  pagina: number;
  tamanho: number;
}

export interface PadraoDaLista {
  visao: string;
  tamanho: number;
}

export function estadoVazio(padrao: PadraoDaLista): EstadoDaLista {
  return { visao: padrao.visao, busca: "", listas: {}, datas: {}, avancado: FILTROS_VAZIOS, ordem: null, pagina: 1, tamanho: padrao.tamanho };
}

// ── Períodos ────────────────────────────────────────────────────────────────

/** Opções prontas do menu de data. "Intervalo" é escolhido à parte. */
export const PERIODOS_PRONTOS: { id: string; rotulo: string; periodo: Periodo }[] = [
  { id: "hoje", rotulo: "Hoje", periodo: { tipo: "hoje" } },
  { id: "7d", rotulo: "Últimos 7 dias", periodo: { tipo: "ultimos", dias: 7 } },
  { id: "30d", rotulo: "Últimos 30 dias", periodo: { tipo: "ultimos", dias: 30 } },
  { id: "90d", rotulo: "Últimos 90 dias", periodo: { tipo: "ultimos", dias: 90 } },
  { id: "mes", rotulo: "Este mês", periodo: { tipo: "esteMes" } },
];

/** Período → texto da URL: "hoje", "30d", "mes", "2026-10-01~2026-10-31". */
export function periodoParaTexto(p: Periodo): string {
  switch (p.tipo) {
    case "hoje":
      return "hoje";
    case "ultimos":
      return `${p.dias}d`;
    case "esteMes":
      return "mes";
    case "entre":
      return `${p.de}~${p.ate}`;
  }
}

/** Texto da URL → período; null quando não é um período válido. */
export function lerPeriodo(texto: string | null | undefined): Periodo | null {
  const t = (texto ?? "").trim();
  if (t === "hoje") return { tipo: "hoje" };
  if (t === "mes") return { tipo: "esteMes" };
  const m = /^(\d{1,4})d$/.exec(t);
  if (m) {
    const dias = Number(m[1]);
    return dias >= 1 && dias <= 3650 ? { tipo: "ultimos", dias } : null;
  }
  const [de, ate] = t.split("~");
  if (de && ate && dataExiste(de) && dataExiste(ate)) return de <= ate ? { tipo: "entre", de, ate } : { tipo: "entre", de: ate, ate: de };
  return null;
}

const dataBR = (dia: string) => dia.split("-").reverse().join("/");

/** Texto do botão quando há período ("Últimos 30 dias", "01/10/2026 – 31/10/2026"). */
export function rotuloDoPeriodo(p: Periodo): string {
  if (p.tipo === "entre") return p.de === p.ate ? dataBR(p.de) : `${dataBR(p.de)} – ${dataBR(p.ate)}`;
  if (p.tipo === "ultimos") return PERIODOS_PRONTOS.find((o) => periodoParaTexto(o.periodo) === `${p.dias}d`)?.rotulo ?? `Últimos ${p.dias} dias`;
  return PERIODOS_PRONTOS.find((o) => o.periodo.tipo === p.tipo)!.rotulo;
}

/** Período → condição do motor. `hoje` é o dia em São Paulo (AAAA-MM-DD). */
export function condicaoDoPeriodo(campo: string, p: Periodo, hoje: string): FiltroDeConsulta {
  switch (p.tipo) {
    case "hoje":
      return { campo, op: "em", valor: hoje };
    case "ultimos":
      return { campo, op: "ultimos", valor: String(p.dias) };
    case "esteMes":
      return { campo, op: "entre", valor: `${hoje.slice(0, 7)}-01`, ate: hoje };
    case "entre":
      return { campo, op: "entre", valor: p.de, ate: p.ate };
  }
}

// ── Montagem do filtro ─────────────────────────────────────────────────────

/** Condições da barra, na ordem da barra (lista vazia não entra). */
export function condicoesDaBarra(e: EstadoDaLista, barra: FiltroDaBarra[], hoje: string): FiltroDeConsulta[] {
  const out: FiltroDeConsulta[] = [];
  for (const f of barra) {
    if (f.tipo === "lista") {
      const valores = e.listas[f.campo] ?? [];
      if (valores.length) out.push({ campo: f.campo, op: "qualquer", valores });
    } else {
      const p = e.datas[f.campo];
      if (p) out.push(condicaoDoPeriodo(f.campo, p, hoje));
    }
  }
  return out;
}

/**
 * Estado → filtro do servidor. `daVisao` são as condições da aba (ex.:
 * "Meus" = responsável é eu): entram junto dos rápidos, em E.
 */
export function montarFiltro(
  e: EstadoDaLista,
  barra: FiltroDaBarra[],
  { hoje = diaLocal(new Date()), daVisao = [] }: { hoje?: string; daVisao?: FiltroDeConsulta[] } = {}
): FiltroCrm {
  const rapidos = [...daVisao, ...condicoesDaBarra(e, barra, hoje)];
  const busca = e.busca.trim();
  return {
    logica: e.avancado.logica,
    grupos: e.avancado.grupos,
    ...(busca ? { busca } : {}),
    ...(rapidos.length ? { rapidos } : {}),
  };
}

/** Quantas condições avançadas há (o número do botão "Filtros avançados"). */
export function totalAvancado(e: Pick<EstadoDaLista, "avancado">): number {
  return e.avancado.grupos.reduce((s, g) => s + g.condicoes.length, 0);
}

/** Há algum filtro além da visão? (mostra "Limpar filtros"). */
export function filtrandoAlgo(e: EstadoDaLista): boolean {
  return (
    !!e.busca.trim() ||
    Object.values(e.listas).some((v) => v.length > 0) ||
    Object.keys(e.datas).length > 0 ||
    totalAvancado(e) > 0
  );
}

/** Tira busca, barra e avançados; mantém visão, ordem e tamanho; volta à página 1. */
export function limparFiltros(e: EstadoDaLista): EstadoDaLista {
  return { ...e, busca: "", listas: {}, datas: {}, avancado: FILTROS_VAZIOS, pagina: 1 };
}

// ── URL ────────────────────────────────────────────────────────────────────

const lista = (t: string | null) =>
  [...new Set((t ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 50);

/** Lê o estado da URL. Parâmetro inválido vira o padrão (nunca lança). */
export function lerEstadoDaUrl(sp: URLSearchParams, barra: FiltroDaBarra[], padrao: PadraoDaLista, visoes?: string[]): EstadoDaLista {
  const e = estadoVazio(padrao);
  const v = sp.get("v")?.trim();
  if (v && (!visoes || visoes.includes(v))) e.visao = v;
  e.busca = (sp.get("q") ?? "").slice(0, 120);
  for (const f of barra) {
    const bruto = sp.get(f.param);
    if (f.tipo === "lista") {
      const valores = lista(bruto);
      if (valores.length) e.listas[f.campo] = valores;
    } else {
      const p = lerPeriodo(bruto);
      if (p) e.datas[f.campo] = p;
    }
  }
  // Avançados: só a estrutura (grupos com condições). O servidor saneia cada
  // condição com o catálogo da entidade; aqui guardamos o que veio, para a
  // tela mostrar e editar.
  const av = sp.get("av");
  if (av) {
    try {
      const bruto = JSON.parse(av) as FiltrosDeConsulta;
      if (bruto && Array.isArray(bruto.grupos)) {
        e.avancado = {
          logica: bruto.logica === "ou" ? "ou" : "e",
          grupos: bruto.grupos
            .filter((g) => g && Array.isArray(g.condicoes) && g.condicoes.length > 0)
            .slice(0, LIMITE_DE_GRUPOS)
            .map((g) => ({ logica: g.logica === "ou" ? "ou" : "e", condicoes: g.condicoes.slice(0, LIMITE_DE_CONDICOES) })),
        };
      }
    } catch {
      // JSON quebrado: fica sem avançados.
    }
  }
  const ordem = /^([A-Za-z]+):(asc|desc)$/.exec(sp.get("ordem") ?? "");
  if (ordem) e.ordem = { key: ordem[1], direction: ordem[2] as "asc" | "desc" };
  const p = Math.floor(Number(sp.get("p")));
  if (Number.isFinite(p) && p > 1) e.pagina = Math.min(p, 100_000);
  const pp = Number(sp.get("pp"));
  if ([25, 50, 100].includes(pp)) e.tamanho = pp;
  return e;
}

/** Estado → query string, sem o que é padrão (link curto). */
export function estadoParaUrl(e: EstadoDaLista, barra: FiltroDaBarra[], padrao: PadraoDaLista): URLSearchParams {
  const sp = new URLSearchParams();
  if (e.visao !== padrao.visao) sp.set("v", e.visao);
  if (e.busca.trim()) sp.set("q", e.busca);
  for (const f of barra) {
    if (f.tipo === "lista") {
      const valores = e.listas[f.campo] ?? [];
      if (valores.length) sp.set(f.param, valores.join(","));
    } else {
      const p = e.datas[f.campo];
      if (p) sp.set(f.param, periodoParaTexto(p));
    }
  }
  if (totalAvancado(e) > 0) sp.set("av", JSON.stringify(e.avancado));
  if (e.ordem) sp.set("ordem", `${e.ordem.key}:${e.ordem.direction}`);
  if (e.pagina > 1) sp.set("p", String(e.pagina));
  if (e.tamanho !== padrao.tamanho) sp.set("pp", String(e.tamanho));
  return sp;
}
