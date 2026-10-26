// ---------------------------------------------------------------------------
// O contrato mora na URL: /<idDoContrato>/deals, /<id>/contacts/...
// Na URL vai o id curto (os 8 primeiros caracteres, o mesmo da tela de
// contratos): /8d8d3a8c/deals. O id completo continua aceito (links antigos)
// e o servidor troca o curto pelo completo antes de conferir o acesso.
//
// Este arquivo é o único lugar que sabe montar e desmontar esse caminho. Sem
// dependência de React/Next: é usado pelo proxy (redirecionar caminho antigo),
// pelo navegador (Link, router, fetch) e pelo servidor.
// ---------------------------------------------------------------------------

export const COOKIE_CONTRATO = "eva_contrato";
export const CABECALHO_CONTRATO = "x-eva-contrato";

/** Primeiro segmento das telas que existem dentro de um contrato. */
export const SECOES_DO_CONTRATO = [
  "home",
  "conversations",
  "deals",
  "contacts",
  "tasks",
  "dashboard",
  "agent-studio",
  "sequences",
  "automations",
  "broadcasts",
  "approvals",
  "library",
  "companies",
  "leads",
  "insights",
  "integrations",
  "playground",
  "settings",
  "get-started",
  "help",
] as const;
const SECOES = new Set<string>(SECOES_DO_CONTRATO);

// ---------------------------------------------------------------------------
// Nomes antigos (em português) → atuais (inglês, docs/NAMING.md). Única tabela
// da troca: o proxy redireciona os links antigos (e-mail enviado, favorito,
// aviso salvo no banco) e as telas leem daqui os nomes dos parâmetros. Map, e
// não objeto: "constructor" ou "__proto__" vindos da URL não acham nada.
// ---------------------------------------------------------------------------

const tabela = (o: Record<string, string>) => new Map(Object.entries(o));

/** Seções do contrato: /<id>/negocios → /<id>/deals. */
const SECOES_ANTIGAS = tabela({
  inicio: "home",
  conversas: "conversations",
  negocios: "deals",
  contatos: "contacts",
  empresas: "companies",
  tarefas: "tasks",
  sequencias: "sequences",
  automacoes: "automations",
  disparos: "broadcasts",
  aprovacoes: "approvals",
  biblioteca: "library",
  integracoes: "integrations",
  configuracoes: "settings",
  comecar: "get-started",
  ajuda: "help",
});

/** Sub-rotas dentro das seções: /negocios/configurar → /deals/configure. */
const SUBROTAS_ANTIGAS = tabela({
  configurar: "configure",
  relatorio: "report",
  referencia: "reference",
});

/** Páginas fora do contrato. /convite e /descadastro estão em e-mails já enviados. */
const PAGINAS_ANTIGAS = tabela({
  contratos: "contracts",
  convite: "invite",
  descadastro: "unsubscribe",
  ir: "go",
});
const PAGINAS = new Set(PAGINAS_ANTIGAS.values());

/** Parâmetros das telas (só da URL do app; os da API não mudam aqui). */
const PARAMETROS_ANTIGOS = tabela({
  funil: "pipeline",
  funis: "pipelines",
  etapa: "stage",
  aba: "tab",
  busca: "q",
  de: "from",
  ate: "to",
  para: "to",
  dono: "owner",
  donos: "owners",
  equipe: "team",
  visao: "view",
  novo: "new",
  contato: "contact",
  empresa: "company",
  tarefa: "task",
  etiqueta: "tag",
  produto: "product",
  criado: "created",
  fechado: "closed",
  atividade: "activity",
  ordem: "sort",
  abrir: "open",
  escolher: "choose",
  imprimir: "print",
  filtro: "filter",
  arquivados: "archived",
  dias: "days",
});

/** Valores de ?tab= (o antigo ?aba=) de todas as telas. */
const ABAS_ANTIGAS = tabela({
  // Negócios › Personalizar
  funis: "pipelines",
  cartao: "card",
  produtos: "products",
  // Tarefas
  dia: "day",
  lista: "list",
  calendario: "calendar",
  // Biblioteca
  fluxos: "flows",
  // Integrações
  ia: "ai",
  // Configurações
  contrato: "contract",
  conta: "account",
  canais: "channels",
  membros: "members",
  papeis: "roles",
  grupos: "groups",
  equipes: "teams",
  chaves: "keys",
  lixeira: "trash",
  auditoria: "audit",
  // Agente
  resumo: "overview",
  comportamento: "behavior",
  avancado: "advanced",
});

/** Nome atual de um parâmetro de tela: nomeDoParametro("funil") → "pipeline". */
export function nomeDoParametro(antigo: string): string {
  return PARAMETROS_ANTIGOS.get(antigo) ?? antigo;
}

/**
 * Query montada com os nomes da API/do código → nomes da URL da tela
 * ("filtro=x&dono=u1" → "filter=x&owner=u1"). Para telas cujos filtros vão à
 * API com os nomes antigos (relatório, dashboard).
 */
export function parametrosDaTela(query: string): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of new URLSearchParams(query)) p.append(nomeDoParametro(chave), valor);
  return p.toString();
}

/** Query com nomes atuais (?funil=2&aba=funis → ?pipeline=2&tab=pipelines); null = nada mudou. */
function buscaAtual(search: string): string | null {
  let mudou = false;
  const saida = new URLSearchParams();
  for (const [chave, valor] of new URLSearchParams(search)) {
    const nome = nomeDoParametro(chave);
    const novo = nome === "tab" ? ABAS_ANTIGAS.get(valor) ?? valor : valor;
    if (nome !== chave || novo !== valor) mudou = true;
    saida.append(nome, novo);
  }
  if (!mudou) return null;
  const texto = saida.toString();
  return texto ? `?${texto}` : "";
}

// Organization.id é uuid (default do Prisma). Conferir o formato evita tratar
// "/favicon.ico" ou "/qualquer-coisa" como contrato.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURTO = /^[0-9a-f]{8}$/i;

/** Id do contrato como vem da URL ou do cabeçalho: completo ou curto. */
export function ehIdDeContrato(v: unknown): v is string {
  return typeof v === "string" && (UUID.test(v) || CURTO.test(v));
}

/** Só o id completo (o do banco). */
export function ehIdCompletoDeContrato(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function ehIdCurtoDeContrato(v: unknown): v is string {
  return typeof v === "string" && CURTO.test(v);
}

/** O que vai na URL: "8d8d3a8c-2ff6-..." → "8d8d3a8c". */
export function idCurto(id: string): string {
  return UUID.test(id) ? id.slice(0, 8).toLowerCase() : id.toLowerCase();
}

/** O id completo `completo` é o contrato que a URL pediu (curto ou completo)? */
export function mesmoContrato(completo: string | null | undefined, daUrl: string | null | undefined): boolean {
  if (!completo || !daUrl) return false;
  return CURTO.test(daUrl) ? idCurto(completo) === daUrl.toLowerCase() : completo.toLowerCase() === daUrl.toLowerCase();
}

function primeiroSegmento(caminho: string): string {
  return caminho.split(/[/?#]/).filter(Boolean)[0] ?? "";
}

/** Caminho sem contrato de uma tela do app (/deals, /deals/123?x; o nome antigo /negocios também). */
export function ehCaminhoDeSecao(caminho: string): boolean {
  const seg = primeiroSegmento(caminho);
  return caminho.startsWith("/") && (SECOES.has(seg) || SECOES_ANTIGAS.has(seg));
}

/** Contrato do caminho atual (/<id>/deals → id), ou null. */
export function contratoDoCaminho(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const seg = primeiroSegmento(pathname);
  return ehIdDeContrato(seg) ? seg : null;
}

/**
 * Põe o contrato na frente de um caminho de tela: "/deals/1?a=b" →
 * "/<id>/deals/1?a=b". Qualquer outra coisa (URL externa, /api, /login,
 * âncora, caminho que já tem contrato) volta igual.
 */
export function rotaDoContrato(contrato: string | null | undefined, caminho: string): string {
  if (!contrato || !ehCaminhoDeSecao(caminho)) return caminho;
  return `/${idCurto(contrato)}${caminho}`;
}

/** O inverso: "/<id>/deals/1" → "/deals/1". Sem contrato, volta igual. */
export function tirarContrato(pathname: string): string {
  const id = contratoDoCaminho(pathname);
  if (!id) return pathname;
  const resto = pathname.slice(pathname.indexOf(id) + id.length);
  return resto.startsWith("/") ? resto : `/${resto}`;
}

/**
 * Para o seletor de contrato: mesma tela no outro contrato. Fica só a seção
 * (/A/deals/123 → /B/deals): o negócio 123 não existe em B, e abrir um
 * 404 a cada troca seria pior que voltar para a lista.
 */
export function trocarContrato(pathname: string, novo: string): string {
  const seg = primeiroSegmento(tirarContrato(pathname));
  return `/${idCurto(novo)}/${SECOES.has(seg) ? seg : "home"}`;
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
 * Caminho de tela com nomes antigos → atual: seção, sub-rota, parâmetros e
 * valores de aba (/<id>/negocios/1?funil=2 → /<id>/deals/1?pipeline=2,
 * /ir?para=/x → /go?to=/x). Com ou sem contrato na frente. null quando já
 * está atual ou não é tela do app (/api, /login, /admin...).
 */
export function caminhoAtual(pathname: string, search = ""): string | null {
  const segs = pathname.split("/");
  let mudou = false;
  const i = ehIdDeContrato(segs[1]) ? 2 : 1;
  const pagina = i === 1 ? PAGINAS_ANTIGAS.get(segs[1]) : undefined;
  if (pagina) {
    segs[1] = pagina;
    mudou = true;
  } else if (SECOES_ANTIGAS.has(segs[i])) {
    segs[i] = SECOES_ANTIGAS.get(segs[i])!;
    mudou = true;
  }
  const secao = SECOES.has(segs[i]);
  if (!secao && !(i === 1 && PAGINAS.has(segs[1]))) return null;
  // Link com o id completo (bookmark, aba antiga): a URL fica só com o curto.
  if (i === 2 && UUID.test(segs[1])) {
    segs[1] = idCurto(segs[1]);
    mudou = true;
  }
  if (secao) {
    for (let j = i + 1; j < segs.length; j++) {
      const sub = SUBROTAS_ANTIGAS.get(segs[j]);
      if (sub) {
        segs[j] = sub;
        mudou = true;
      }
    }
  }
  const busca = buscaAtual(search);
  if (!mudou && busca === null) return null;
  return `${segs.join("/")}${busca ?? search}`;
}

/**
 * Redirecionamento de caminho antigo. Duas coisas, que podem vir juntas:
 * - sem contrato (/negocios → /<contrato>/deals): o cookie é só o "último
 *   usado", o layout do contrato confere o vínculo de novo. Sem cookie, /go
 *   pergunta ao servidor o contrato padrão;
 * - nome em português (/<id>/negocios?funil=2 → /<id>/deals?pipeline=2,
 *   /convite?t= → /invite?t=), pela tabela acima.
 * Devolve null quando o caminho não é antigo.
 */
export function destinoDoCaminhoAntigo(pathname: string, search: string, cookie: string | null | undefined): string | null {
  const atual = caminhoAtual(pathname, search);
  if (!ehCaminhoDeSecao(pathname)) return atual;
  const alvo = atual ?? `${pathname}${search}`;
  if (ehIdDeContrato(cookie)) return `/${idCurto(cookie)}${alvo}`;
  return `/go?to=${encodeURIComponent(alvo)}`;
}
