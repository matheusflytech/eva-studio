import { CABECALHO_CONTRATO, contratoDoCaminho } from "./rotas";

// ---------------------------------------------------------------------------
// Toda chamada do navegador para /api/* leva o contrato da URL da aba no
// cabeçalho x-eva-contrato. É o que mantém duas abas abertas em contratos
// diferentes separadas: cada uma lê a própria URL, na hora de cada chamada
// (não um valor guardado quando a página abriu).
//
// O servidor nunca confia no valor: confere o vínculo (ou superadmin) a cada
// requisição (src/lib/server/contratos.ts). Sem cabeçalho (ex.: /admin,
// /login), ele cai no último contrato usado (cookie) ou no padrão.
//
// Fica de fora o que não usa sessão: /api/v1 (chave de API), webhooks e widget.
// ---------------------------------------------------------------------------

const SEM_SESSAO = ["/api/v1/", "/api/webhooks/", "/api/widget/"];

/** Caminho de API do próprio app que deve levar o contrato? */
export function precisaDoContrato(url: string, origem: string): boolean {
  let u: URL;
  try {
    u = new URL(url, origem);
  } catch {
    return false;
  }
  if (u.origin !== origem) return false;
  if (!u.pathname.startsWith("/api/")) return false;
  return !SEM_SESSAO.some((p) => u.pathname.startsWith(p));
}

/** Os mesmos argumentos do fetch, com o cabeçalho do contrato acrescentado. */
export function comCabecalhoDoContrato(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  pathnameDaAba: string,
  origem: string
): [RequestInfo | URL, RequestInit | undefined] {
  const contrato = contratoDoCaminho(pathnameDaAba);
  if (!contrato) return [input, init];
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!precisaDoContrato(url, origem)) return [input, init];

  // Request com cabeçalhos próprios: copia os dele, para não perder nada ao
  // passar init por cima.
  const base = init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined);
  const headers = new Headers(base);
  if (!headers.has(CABECALHO_CONTRATO)) headers.set(CABECALHO_CONTRATO, contrato);
  return [input, { ...init, headers }];
}

let instalado = false;

/** Embrulha window.fetch uma vez só (chamado pelos providers da raiz). */
export function instalarFetchDoContrato() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const [i, o] = comCabecalhoDoContrato(input, init, window.location.pathname, window.location.origin);
    return original(i, o);
  };
}
