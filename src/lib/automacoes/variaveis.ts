import { lerCaminho, type Contexto } from "./condicoes";

// ---------------------------------------------------------------------------
// Variáveis nos textos das ações: {{ contato.name | primeiro_nome }}.
//
// Só caminho + filtros da lista fechada abaixo, nunca código. Variável que não
// existe vira texto vazio (ou o `padrao`), e `faltando` diz quais foram, para o
// passo registrar o aviso.
// ---------------------------------------------------------------------------

const RE = /\{\{\s*([a-zA-Z_][\w.]*)\s*((?:\|\s*[a-z_]+(?:\s*:\s*"[^"]*")?\s*)*)\}\}/g;

export const FILTROS = ["primeiro_nome", "maiusculas", "minusculas", "moeda", "data", "data_hora", "telefone", "padrao"] as const;
export type Filtro = (typeof FILTROS)[number];

function formatarData(v: unknown, comHora: boolean): string {
  // Dia sem hora sai como está: passar por Date leria meia-noite UTC e, em
  // São Paulo, mostraria o dia anterior.
  const dia = typeof v === "string" ? v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  if (dia) return `${dia[3]}/${dia[2]}/${dia[1]}`;
  const t = typeof v === "string" || v instanceof Date ? new Date(v) : null;
  if (!t || Number.isNaN(t.getTime())) return String(v ?? "");
  return t.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function aplicarFiltro(valor: unknown, filtro: string, argumento: string | undefined): unknown {
  switch (filtro) {
    case "primeiro_nome":
      return String(valor ?? "").trim().split(/\s+/)[0] ?? "";
    case "maiusculas":
      return String(valor ?? "").toUpperCase();
    case "minusculas":
      return String(valor ?? "").toLowerCase();
    case "moeda": {
      // Centavos (padrão da API) para R$. Vazio continua vazio (o `padrao` depois vale).
      if (valor === undefined || valor === null || valor === "") return valor;
      const n = typeof valor === "number" ? valor : /^-?\d+$/.test(String(valor).trim()) ? Number(valor) : NaN;
      return Number.isFinite(n) ? (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : valor;
    }
    case "data":
      return formatarData(valor, false);
    case "data_hora":
      return formatarData(valor, true);
    case "telefone": {
      const d = String(valor ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
      if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return String(valor ?? "");
    }
    case "padrao":
      return valor === undefined || valor === null || valor === "" ? (argumento ?? "") : valor;
    default:
      return valor;
  }
}

function paraTexto(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? String((x as Record<string, unknown>).name ?? "") : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export interface VariavelUsada {
  caminho: string;
  filtros: { nome: string; argumento?: string }[];
}

/** Variáveis citadas num texto (para validar e para a tela mostrar chips). */
export function variaveisDoTexto(texto: string): VariavelUsada[] {
  const usadas: VariavelUsada[] = [];
  for (const m of texto.matchAll(RE)) {
    const filtros = [...(m[2] ?? "").matchAll(/\|\s*([a-z_]+)(?:\s*:\s*"([^"]*)")?/g)].map((f) => ({ nome: f[1], ...(f[2] !== undefined ? { argumento: f[2] } : {}) }));
    usadas.push({ caminho: m[1], filtros });
  }
  return usadas;
}

/**
 * O que parece variável mas não está no formato aceito ({{ Nome }}, filtro com
 * aspas simples, caminho com hífen) e filtros fora da lista. A validação
 * transforma em pendência: sem isso, o texto sairia com as chaves para o cliente.
 */
export function problemasDasVariaveis(texto: string): string[] {
  const problemas: string[] = [];
  const validas = new Set([...texto.matchAll(RE)].map((m) => m.index));
  for (const m of texto.matchAll(/\{\{[^{}]*\}\}/g)) {
    if (!validas.has(m.index)) problemas.push(`Variável mal escrita: ${m[0]}. Use {{ caminho | filtro }} com filtro em minúsculas e argumento entre aspas duplas.`);
  }
  for (const v of variaveisDoTexto(texto)) {
    for (const f of v.filtros) {
      if (!(FILTROS as readonly string[]).includes(f.nome)) problemas.push(`Filtro desconhecido “${f.nome}” em {{${v.caminho}}}. Os aceitos: ${FILTROS.join(", ")}.`);
    }
  }
  return problemas;
}

/** Troca as variáveis pelo valor do contexto. */
export function renderizar(texto: string, contexto: Contexto): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  const saida = texto.replace(RE, (_inteiro, caminho: string, filtrosBrutos: string) => {
    let valor = lerCaminho(contexto, caminho);
    const filtros = [...(filtrosBrutos ?? "").matchAll(/\|\s*([a-z_]+)(?:\s*:\s*"([^"]*)")?/g)];
    const temPadrao = filtros.some((f) => f[1] === "padrao");
    if ((valor === undefined || valor === null || valor === "") && !temPadrao) faltando.push(caminho);
    for (const f of filtros) valor = aplicarFiltro(valor, f[1], f[2]);
    return paraTexto(valor);
  });
  return { texto: saida, faltando };
}

/** Renderiza todos os textos de uma configuração (objetos e listas também). */
export function renderizarConfig<T>(config: T, contexto: Contexto, faltando: string[] = []): T {
  if (typeof config === "string") {
    const r = renderizar(config, contexto);
    faltando.push(...r.faltando);
    return r.texto as T;
  }
  if (Array.isArray(config)) return config.map((x) => renderizarConfig(x, contexto, faltando)) as T;
  if (config && typeof config === "object") {
    return Object.fromEntries(Object.entries(config).map(([k, v]) => [k, renderizarConfig(v, contexto, faltando)])) as T;
  }
  return config;
}
