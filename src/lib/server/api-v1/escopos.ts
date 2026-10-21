// ---------------------------------------------------------------------------
// Escopos da chave de API.
//
// Formato: "*" (tudo), "<recurso>:*" (ler e escrever no recurso) ou
// "<recurso>:read" / "<recurso>:write". Escrever não implica ler: uma chave de
// formulário de site que só cria contato não precisa listar a base inteira.
// Chave criada antes dos escopos existirem vem com "*" (padrão da coluna).
//
// Sem `server-only`: a tela de chaves usa a mesma lista para o seletor.
// ---------------------------------------------------------------------------

export const RECURSOS = [
  "contacts",
  "companies",
  "deals",
  "tasks",
  "notes",
  "pipelines",
  "custom_fields",
  "tags",
  "flows",
  "sequences",
  "imports",
  "exports",
  "webhooks",
] as const;
export type Recurso = (typeof RECURSOS)[number];
export type Acao = "read" | "write";

const RECURSOS_SET = new Set<string>(RECURSOS);

export function escopoValido(s: string): boolean {
  if (s === "*") return true;
  const [recurso, acao, ...resto] = s.split(":");
  return resto.length === 0 && RECURSOS_SET.has(recurso) && (acao === "*" || acao === "read" || acao === "write");
}

/**
 * Lista limpa e sem repetição. undefined/vazio = ["*"] (comportamento antigo).
 * Devolve null se algum escopo for desconhecido: escopo digitado errado não
 * pode virar chave sem permissão nenhuma (ou com permissão demais) em silêncio.
 */
export function normalizarEscopos(bruto: unknown): string[] | null {
  if (bruto === undefined || bruto === null) return ["*"];
  if (!Array.isArray(bruto)) return null;
  const lista = [...new Set(bruto.map((s) => String(s).trim()).filter(Boolean))];
  if (lista.length === 0) return ["*"];
  if (!lista.every(escopoValido)) return null;
  return lista.includes("*") ? ["*"] : lista.sort();
}

export function escopoPermite(scopes: readonly string[] | null | undefined, recurso: Recurso, acao: Acao): boolean {
  const lista = scopes && scopes.length > 0 ? scopes : ["*"];
  return lista.some((s) => s === "*" || s === `${recurso}:*` || s === `${recurso}:${acao}`);
}
