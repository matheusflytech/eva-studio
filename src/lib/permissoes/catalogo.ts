// ---------------------------------------------------------------------------
// Catálogo de permissões do contrato.
//
// Cada permissão é "<módulo>:<ação>" (ex.: negocios:editar). Os papéis de
// sistema (Dono, Admin, Atendente, Leitura) são montados a partir das 6
// permissões antigas (org:manage, agents:manage, ...), que viraram pacotes de
// granulares: assim `requirePermission("<antiga>")` continua respondendo
// exatamente igual para quem já usava o app.
//
// Sem `server-only`: a tela de papéis desenha a matriz módulo × ação daqui.
// ---------------------------------------------------------------------------

export const MODULOS = [
  { id: "negocios", nome: "Negócios", acoes: ["ver", "criar", "editar", "apagar", "exportar"] },
  { id: "contatos", nome: "Contatos", acoes: ["ver", "criar", "editar", "apagar", "importar", "exportar"] },
  { id: "empresas", nome: "Empresas", acoes: ["ver", "gerenciar"] },
  { id: "conversas", nome: "Conversas", acoes: ["ver", "responder"] },
  { id: "tarefas", nome: "Tarefas e notas", acoes: ["ver", "gerenciar"] },
  { id: "disparos", nome: "Disparos", acoes: ["ver", "enviar"] },
  { id: "sequencias", nome: "Sequências", acoes: ["gerenciar"] },
  { id: "agentes", nome: "Eva Studio", acoes: ["ver", "gerenciar"] },
  { id: "automacoes", nome: "Automações", acoes: ["ver", "gerenciar"] },
  { id: "funis", nome: "Funis e campos", acoes: ["configurar"] },
  { id: "produtos", nome: "Produtos", acoes: ["gerenciar"] },
  { id: "relatorios", nome: "Relatórios e dashboard", acoes: ["ver"] },
  { id: "integracoes", nome: "Integrações", acoes: ["gerenciar"] },
  { id: "api", nome: "Chaves de API", acoes: ["gerenciar"] },
  { id: "membros", nome: "Membros, papéis e equipes", acoes: ["gerenciar"] },
  { id: "contrato", nome: "Dados do contrato", acoes: ["gerenciar"] },
  // Restaurar da lixeira segue a permissão de apagar de cada registro; só o
  // "Apagar para sempre" (que não tem volta) é separado.
  { id: "lixeira", nome: "Lixeira", acoes: ["esvaziar"] },
  // Histórico de tudo o que aconteceu no contrato (Configurações → Auditoria).
  // A ficha mostra o histórico do registro a quem pode ver o registro.
  { id: "auditoria", nome: "Auditoria", acoes: ["ver"] },
] as const;

export const ACOES_ROTULO: Record<string, string> = {
  ver: "Ver",
  criar: "Criar",
  editar: "Editar",
  apagar: "Apagar",
  exportar: "Exportar",
  importar: "Importar",
  responder: "Responder",
  enviar: "Enviar",
  gerenciar: "Gerenciar",
  configurar: "Configurar",
  esvaziar: "Apagar para sempre",
};

type Modulo = (typeof MODULOS)[number];
type PermissaoDoModulo<M extends Modulo> = M extends { id: infer I extends string; acoes: readonly (infer A extends string)[] }
  ? `${I}:${A}`
  : never;
export type PermissaoGranular = PermissaoDoModulo<Modulo>;

export const PERMISSOES: PermissaoGranular[] = MODULOS.flatMap((m) =>
  m.acoes.map((a) => `${m.id}:${a}` as PermissaoGranular)
);
const PERMISSOES_SET = new Set<string>(PERMISSOES);

export function ehPermissaoGranular(v: unknown): v is PermissaoGranular {
  return typeof v === "string" && PERMISSOES_SET.has(v);
}

/** Lista limpa (só o que existe no catálogo, sem repetição, ordenada). */
export function limparPermissoes(bruto: unknown): PermissaoGranular[] {
  if (!Array.isArray(bruto)) return [];
  return [...new Set(bruto.filter(ehPermissaoGranular))].sort();
}

// --- Compatibilidade com as 6 permissões antigas ---------------------------

export type PermissaoLegada =
  | "org:manage"
  | "agents:manage"
  | "broadcasts:send"
  | "contacts:manage"
  | "conversations:reply"
  | "read";

export const LEGADO_PARA_GRANULAR: Record<PermissaoLegada, PermissaoGranular[]> = {
  // Exportar o funil sempre foi "read" (a Leitura baixa a planilha): continua.
  // A auditoria (tudo o que todos fizeram) fica fora: só dono e administrador.
  read: [...PERMISSOES.filter((p) => p.endsWith(":ver") && p !== "auditoria:ver"), "negocios:exportar"],
  "contacts:manage": [
    "contatos:criar",
    "contatos:editar",
    "contatos:apagar",
    "contatos:importar",
    "contatos:exportar",
    "empresas:gerenciar",
    "negocios:criar",
    "negocios:editar",
    "negocios:apagar",
    "tarefas:gerenciar",
  ],
  "conversations:reply": ["conversas:responder"],
  "broadcasts:send": ["disparos:enviar", "sequencias:gerenciar"],
  "agents:manage": ["agentes:gerenciar", "funis:configurar", "produtos:gerenciar", "integracoes:gerenciar", "api:gerenciar"],
  "org:manage": ["membros:gerenciar", "contrato:gerenciar"],
};

export function ehPermissaoLegada(v: unknown): v is PermissaoLegada {
  return typeof v === "string" && v in LEGADO_PARA_GRANULAR;
}

export type PapelDeSistema = "owner" | "admin" | "agent" | "viewer";

/** O que cada papel podia antes — continua sendo a fonte dos papéis de sistema. */
export const LEGADO_DO_PAPEL: Record<PapelDeSistema, PermissaoLegada[]> = {
  owner: ["org:manage", "agents:manage", "broadcasts:send", "contacts:manage", "conversations:reply", "read"],
  admin: ["agents:manage", "broadcasts:send", "contacts:manage", "conversations:reply", "read"],
  agent: ["contacts:manage", "conversations:reply", "read"],
  viewer: ["read"],
};

/**
 * Granulares novas que não entram em pacote antigo (entrar num pacote faria
 * um papel personalizado com só ela passar no `requirePermission` antigo).
 */
const EXTRAS_DO_PAPEL: Partial<Record<PapelDeSistema, PermissaoGranular[]>> = {
  owner: ["lixeira:esvaziar", "automacoes:ver", "automacoes:gerenciar", "auditoria:ver"],
  admin: ["lixeira:esvaziar", "automacoes:ver", "automacoes:gerenciar", "auditoria:ver"],
  agent: ["automacoes:ver"],
  viewer: ["automacoes:ver"],
};

export function permissoesDoPapelDeSistema(papel: PapelDeSistema): PermissaoGranular[] {
  return [...new Set([...LEGADO_DO_PAPEL[papel].flatMap((l) => LEGADO_PARA_GRANULAR[l]), ...(EXTRAS_DO_PAPEL[papel] ?? [])])].sort();
}

export const PAPEIS_DE_SISTEMA: { id: PapelDeSistema; nome: string; descricao: string }[] = [
  { id: "owner", nome: "Dono", descricao: "Acesso total, incluindo membros, papéis e dados do contrato." },
  { id: "admin", nome: "Administrador", descricao: "Mexe em agentes, funis, disparos, contatos e chaves de API. Não gerencia membros." },
  { id: "agent", nome: "Atendente", descricao: "Responde conversas e cuida de contatos e negócios. Não altera agentes nem dispara campanha." },
  { id: "viewer", nome: "Somente leitura", descricao: "Só visualiza. Nenhuma alteração." },
];

/**
 * A pessoa tem a permissão? Antiga = tem **alguma** granular do pacote (para
 * papel de sistema isso é o mesmo que antes, porque o papel tem o pacote
 * inteiro); granular = tem exatamente ela.
 */
export function permite(permissoes: readonly string[], pedida: PermissaoGranular | PermissaoLegada): boolean {
  if (ehPermissaoLegada(pedida)) return LEGADO_PARA_GRANULAR[pedida].some((p) => permissoes.includes(p));
  return permissoes.includes(pedida);
}

// --- Escopo de dados --------------------------------------------------------

export type EscopoDeDados = "proprios" | "equipe" | "todos";
export const MODULOS_COM_ESCOPO = ["negocios", "contatos", "conversas"] as const;
export type ModuloComEscopo = (typeof MODULOS_COM_ESCOPO)[number];
export type EscoposDoPapel = Record<ModuloComEscopo, EscopoDeDados>;

export const ESCOPO_TODOS: EscoposDoPapel = { negocios: "todos", contatos: "todos", conversas: "todos" };

export const ESCOPO_ROTULO: Record<EscopoDeDados, string> = {
  proprios: "Só os meus",
  equipe: "Os da minha equipe",
  todos: "Todos",
};

export function limparEscopos(bruto: unknown): EscoposDoPapel {
  const fonte = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const ok = (v: unknown): v is EscopoDeDados => v === "proprios" || v === "equipe" || v === "todos";
  return {
    negocios: ok(fonte.negocios) ? fonte.negocios : "todos",
    contatos: ok(fonte.contatos) ? fonte.contatos : "todos",
    conversas: ok(fonte.conversas) ? fonte.conversas : "todos",
  };
}

/** Permissões finais = papel (sistema ou personalizado) + grupos somados. */
export function montarPermissoes(base: readonly string[], grupos: readonly (readonly string[])[]): PermissaoGranular[] {
  return limparPermissoes([...base, ...grupos.flat()]);
}

// --- Escopos da chave de API ↔ catálogo -------------------------------------

/**
 * O que a pessoa precisa ter para dar cada escopo a uma chave. Sem isso, um
 * atendente com "api:gerenciar" num papel personalizado criaria uma chave que
 * apaga negócio, coisa que ele mesmo não pode.
 */
export const ESCOPO_DA_CHAVE_EXIGE: Record<string, { read: PermissaoGranular; write: PermissaoGranular; nome: string }> = {
  contacts: { nome: "Contatos", read: "contatos:ver", write: "contatos:editar" },
  companies: { nome: "Empresas", read: "empresas:ver", write: "empresas:gerenciar" },
  deals: { nome: "Negócios", read: "negocios:ver", write: "negocios:editar" },
  tasks: { nome: "Tarefas", read: "tarefas:ver", write: "tarefas:gerenciar" },
  notes: { nome: "Notas", read: "tarefas:ver", write: "tarefas:gerenciar" },
  pipelines: { nome: "Funis", read: "negocios:ver", write: "funis:configurar" },
  custom_fields: { nome: "Campos personalizados", read: "negocios:ver", write: "funis:configurar" },
  tags: { nome: "Etiquetas", read: "contatos:ver", write: "contatos:editar" },
  flows: { nome: "Fluxos dos agentes", read: "agentes:ver", write: "agentes:gerenciar" },
  sequences: { nome: "Sequências", read: "disparos:ver", write: "sequencias:gerenciar" },
  imports: { nome: "Importações", read: "contatos:ver", write: "contatos:importar" },
  exports: { nome: "Exportações", read: "negocios:exportar", write: "negocios:exportar" },
  webhooks: { nome: "Webhooks (gatilho do n8n)", read: "integracoes:gerenciar", write: "integracoes:gerenciar" },
  messages: { nome: "Mensagens pelo agente", read: "conversas:ver", write: "conversas:responder" },
};

/** Escopos que a pessoa não pode conceder (lista vazia = pode todos). */
export function escoposAcimaDoQuePode(escopos: readonly string[], permissoes: readonly string[]): string[] {
  const negados: string[] = [];
  for (const e of escopos) {
    if (e === "*") {
      const tudo = Object.values(ESCOPO_DA_CHAVE_EXIGE).flatMap((x) => [x.read, x.write]);
      if (!tudo.every((p) => permissoes.includes(p))) negados.push(e);
      continue;
    }
    const [recurso, acao] = e.split(":");
    const exige = ESCOPO_DA_CHAVE_EXIGE[recurso];
    if (!exige) {
      negados.push(e);
      continue;
    }
    const precisa = acao === "*" ? [exige.read, exige.write] : [acao === "write" ? exige.write : exige.read];
    if (!precisa.every((p) => permissoes.includes(p))) negados.push(e);
  }
  return negados;
}
