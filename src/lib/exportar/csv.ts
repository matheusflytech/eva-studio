// ---------------------------------------------------------------------------
// CSV para abrir no Excel em português.
//
// O Excel pt-BR usa vírgula como decimal, então o separador de coluna é ";".
// Sem o BOM no começo, ele lê o arquivo como Latin-1 e "Negociação" vira
// "NegociaÃ§Ã£o". Datas saem no fuso de São Paulo, que é o horário de quem
// vende; um negócio criado às 23h de segunda não pode aparecer na terça.
//
// Sem `server-only`: o dashboard monta o CSV dos cartões no navegador.
// ---------------------------------------------------------------------------

export const BOM = "\uFEFF";
export const SEPARADOR = ";";
const FIM_DE_LINHA = "\r\n";
const FUSO = "America/Sao_Paulo";

export type Celula = string | number | null | undefined;

/**
 * Texto que o Excel executaria como fórmula ("=HYPERLINK(...)", "@SOMA").
 * Nome de negócio vem de lead do WhatsApp: não dá pra confiar. Telefone
 * "+55 11..." e número negativo passam; "+cmd|..." não.
 */
const PARECE_FORMULA = /^(?:[=@\t\r]|[+-](?![\d\s(.,]))/;

/** Número no formato do Excel pt-BR: "1234,5" (sem milhar, que atrapalha a soma). */
export function numeroCsv(n: number | null | undefined, casas?: number): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const texto = casas === undefined ? String(n) : n.toFixed(casas);
  return texto.replace(".", ",");
}

/** Centavos como número em reais: 123456 -> "1234,56". */
export function reaisCsv(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined || !Number.isFinite(centavos)) return "";
  return numeroCsv(centavos / 100, 2);
}

/** "R$ 1.234,56" com espaço comum (o toLocaleString usa espaço inquebrável). */
export function reais(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined || !Number.isFinite(centavos)) return "";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

/** Uma célula pronta: aspas quando precisa, aspas internas dobradas. */
export function celula(v: Celula): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return numeroCsv(v);
  let t = v;
  if (PARECE_FORMULA.test(t)) t = `'${t}`;
  if (/[";\r\n]/.test(t) || t !== t.trim()) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export function linhaCsv(celulas: Celula[]): string {
  return celulas.map(celula).join(SEPARADOR);
}

/** Arquivo inteiro: BOM + linhas separadas por CRLF (o que o Excel espera). */
export function montarCsv(linhas: Celula[][]): string {
  return BOM + linhas.map(linhaCsv).join(FIM_DE_LINHA) + FIM_DE_LINHA;
}

const comoData = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** dd/mm/aaaa no fuso de São Paulo. Vazio quando não há data. */
export function dataBR(v: Date | string | null | undefined): string {
  const d = comoData(v);
  return d ? d.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }) : "";
}

/** dd/mm/aaaa hh:mm no fuso de São Paulo (prazo de tarefa tem hora). */
export function dataHoraBR(v: Date | string | null | undefined): string {
  const d = comoData(v);
  if (!d) return "";
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dataBR(d)} ${hora}`;
}

/**
 * Previsão de fechamento é dia sem hora: o servidor grava meio-dia UTC (o
 * antigo, meia-noite UTC). O dia escolhido é a parte UTC; passar por SP
 * jogaria o registro antigo para a véspera (mesma regra de diaDaPrevisao).
 */
export function diaSemFusoBR(v: Date | string | null | undefined): string {
  const d = comoData(v);
  if (!d) return "";
  const [a, m, dia] = d.toISOString().slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

/** AAAA-MM-DD de hoje em São Paulo, para o nome do arquivo. */
export function hojeSP(agora = new Date()): string {
  return agora.toLocaleDateString("sv-SE", { timeZone: FUSO });
}

/** "Vendas B2B / Sul" -> "vendas-b2b-sul". Nome de arquivo seguro em qualquer sistema. */
export function slugDoArquivo(nome: string): string {
  const s = nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "funil";
}

/** Content-Disposition com nome ASCII e a versão UTF-8 (RFC 5987). */
export function disposicaoDeAnexo(arquivo: string): string {
  const ascii = arquivo.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(arquivo)}`;
}

/** ?ids=a,b,c da exportação da seleção (ação em massa): só ids válidos, até 500. */
export function lerIds(bruto: string | null): string[] {
  return [...new Set((bruto ?? "").split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s)))].slice(0, 500);
}
