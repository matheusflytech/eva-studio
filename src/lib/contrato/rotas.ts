// ---------------------------------------------------------------------------
// O contrato mora na URL: /<idDoContrato>/negocios, /<id>/contatos/...
//
// Este arquivo é o único lugar que sabe montar e desmontar esse caminho. Sem
// dependência de React/Next: é usado pelo proxy (redirecionar caminho antigo),
// pelo navegador (Link, router, fetch) e pelo servidor.
// ---------------------------------------------------------------------------

export const COOKIE_CONTRATO = "eva_contrato";
export const CABECALHO_CONTRATO = "x-eva-contrato";

/** Primeiro segmento das telas que existem dentro de um contrato. */
export const SECOES_DO_CONTRATO = [
  "inicio",
  "conversas",
  "negocios",
  "contatos",
  "tarefas",
  "dashboard",
  "agent-studio",
  "sequencias",
  "disparos",
  "aprovacoes",
  "biblioteca",
  "empresas",
  "leads",
  "insights",
  "integracoes",
  "playground",
  "configuracoes",
  "comecar",
  "ajuda",
] as const;
const SECOES = new Set<string>(SECOES_DO_CONTRATO);

// Organization.id é uuid (default do Prisma). Conferir o formato evita tratar
// "/favicon.ico" ou "/qualquer-coisa" como contrato.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehIdDeContrato(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

function primeiroSegmento(caminho: string): string {
  return caminho.split(/[/?#]/).filter(Boolean)[0] ?? "";
}

/** Caminho antigo/sem contrato de uma tela do app (/negocios, /negocios/123?x). */
export function ehCaminhoDeSecao(caminho: string): boolean {
  return caminho.startsWith("/") && SECOES.has(primeiroSegmento(caminho));
}

/** Contrato do caminho atual (/<id>/negocios → id), ou null. */
export function contratoDoCaminho(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const seg = primeiroSegmento(pathname);
  return ehIdDeContrato(seg) ? seg : null;
}

/**
 * Põe o contrato na frente de um caminho de tela: "/negocios/1?a=b" →
 * "/<id>/negocios/1?a=b". Qualquer outra coisa (URL externa, /api, /login,
 * âncora, caminho que já tem contrato) volta igual.
 */
export function rotaDoContrato(contrato: string | null | undefined, caminho: string): string {
  if (!contrato || !ehCaminhoDeSecao(caminho)) return caminho;
  return `/${contrato}${caminho}`;
}

/** O inverso: "/<id>/negocios/1" → "/negocios/1". Sem contrato, volta igual. */
export function tirarContrato(pathname: string): string {
  const id = contratoDoCaminho(pathname);
  if (!id) return pathname;
  const resto = pathname.slice(pathname.indexOf(id) + id.length);
  return resto.startsWith("/") ? resto : `/${resto}`;
}

/**
 * Para o seletor de contrato: mesma tela no outro contrato. Fica só a seção
 * (/A/negocios/123 → /B/negocios): o negócio 123 não existe em B, e abrir um
 * 404 a cada troca seria pior que voltar para a lista.
 */
export function trocarContrato(pathname: string, novo: string): string {
  const seg = primeiroSegmento(tirarContrato(pathname));
  return `/${novo}/${SECOES.has(seg) ? seg : "inicio"}`;
}

/**
 * Para links que o navegador abre sozinho (download por <a href>, OAuth):
 * nesses o fetch não passa, então o contrato vai na query.
 */
export function apiDoContrato(contrato: string | null | undefined, url: string): string {
  if (!contrato) return url;
  return `${url}${url.includes("?") ? "&" : "?"}contrato=${encodeURIComponent(contrato)}`;
}

/**
 * Redirecionamento de caminho antigo (/negocios → /<contrato>/negocios). O
 * cookie é só o "último usado": o layout do contrato confere o vínculo de
 * novo. Sem cookie, /ir pergunta ao servidor o contrato padrão.
 * Devolve null quando o caminho não é antigo.
 */
export function destinoDoCaminhoAntigo(pathname: string, search: string, cookie: string | null | undefined): string | null {
  if (!ehCaminhoDeSecao(pathname)) return null;
  const alvo = `${pathname}${search}`;
  if (ehIdDeContrato(cookie)) return `/${cookie}${alvo}`;
  return `/ir?para=${encodeURIComponent(alvo)}`;
}
