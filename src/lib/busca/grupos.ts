import { normalizarConsulta, semAcento } from "./consulta";
import type { Recente } from "./recentes";
import type { RegistroEncontrado, ResultadoDaBusca, TrechoEncontrado } from "./resultado";

// ---------------------------------------------------------------------------
// O que a paleta mostra e em que ordem. Puro: a tela passa permissões,
// contexto (registro aberto), resultados do servidor e recentes.
//
// Ordem com consulta:  [ações do registro aberto] → Ações → Ir para →
//                      Negócios → Contatos → Empresas → Notas e mensagens → Recentes
// Sem consulta:        [ações do registro aberto] → Recentes → Ações → Ir para
// ---------------------------------------------------------------------------

export interface Pagina {
  caminho: string;
  rotulo: string;
  /** Sem permissão = todo mundo do contrato vê. */
  permissao?: string;
  palavras?: string;
}

/** Telas do app (mesmo conjunto do menu), com a permissão de ver cada uma. */
export const PAGINAS: Pagina[] = [
  { caminho: "/home", rotulo: "Início", palavras: "home resumo" },
  { caminho: "/conversations", rotulo: "Conversas", permissao: "conversas:ver", palavras: "inbox whatsapp atendimento" },
  { caminho: "/deals", rotulo: "Negócios", permissao: "negocios:ver", palavras: "funil kanban pipeline vendas" },
  { caminho: "/contacts", rotulo: "Contatos", permissao: "contatos:ver", palavras: "pessoas clientes" },
  { caminho: "/tasks", rotulo: "Tarefas", permissao: "tarefas:ver", palavras: "meu dia agenda follow-up" },
  { caminho: "/dashboard", rotulo: "Dashboard", permissao: "relatorios:ver", palavras: "painel relatorios metricas" },
  { caminho: "/companies", rotulo: "Empresas", permissao: "empresas:ver", palavras: "contas cnpj" },
  { caminho: "/leads", rotulo: "Leads", permissao: "contatos:ver" },
  { caminho: "/agent-studio", rotulo: "Eva Studio", permissao: "agentes:ver", palavras: "eva bot fluxo" },
  { caminho: "/sequences", rotulo: "Sequências", permissao: "sequencias:gerenciar", palavras: "cadencia regua" },
  { caminho: "/broadcasts", rotulo: "Disparos", permissao: "disparos:ver", palavras: "campanha massa broadcast" },
  { caminho: "/approvals", rotulo: "Aprovações", permissao: "disparos:ver", palavras: "templates modelos meta" },
  { caminho: "/library", rotulo: "Biblioteca", palavras: "modelos respostas" },
  { caminho: "/insights", rotulo: "Insights", permissao: "relatorios:ver" },
  { caminho: "/integrations", rotulo: "Integrações", permissao: "integracoes:gerenciar", palavras: "api webhooks n8n" },
  { caminho: "/playground", rotulo: "Playground", permissao: "agentes:ver" },
  { caminho: "/settings", rotulo: "Configurações", palavras: "ajustes funis campos membros lixeira" },
  { caminho: "/help", rotulo: "Eva Help", palavras: "ajuda suporte" },
];

export type IdDaAcao = "criar-negocio" | "criar-contato" | "criar-tarefa" | "enviar-whatsapp" | "mudar-etapa" | "atribuir";

/** Registro aberto agora (ficha ou prévia), para as ações dele virem primeiro. */
export interface ContextoDoRegistro {
  tipo: "negocio" | "contato" | "empresa";
  id: string;
  titulo: string;
  /** A tela sabe mudar a etapa (com as regras e o desfazer dela). */
  mudarEtapa?: boolean;
  /** A tela sabe trocar o responsável. */
  atribuir?: boolean;
  /** Contato para "Enviar WhatsApp para…" (nome). */
  whatsappPara?: string | null;
}

export type ItemDaPaleta =
  | { chave: string; tipo: "acao"; acao: IdDaAcao; rotulo: string; doRegistro: boolean }
  | { chave: string; tipo: "pagina"; rotulo: string; caminho: string }
  | { chave: string; tipo: "registro"; registro: RegistroEncontrado }
  | { chave: string; tipo: "trecho"; trecho: TrechoEncontrado }
  | { chave: string; tipo: "recente"; recente: Recente };

export type IdDoGrupo = "registro" | "acoes" | "ir" | "negocios" | "contatos" | "empresas" | "notas" | "recentes";

export interface GrupoDaPaleta {
  id: IdDoGrupo;
  titulo: string;
  itens: ItemDaPaleta[];
}

const PERMISSAO_DA_ACAO: Record<IdDaAcao, string> = {
  "criar-negocio": "negocios:criar",
  "criar-contato": "contatos:criar",
  "criar-tarefa": "tarefas:gerenciar",
  "enviar-whatsapp": "contatos:ver",
  "mudar-etapa": "negocios:editar",
  atribuir: "negocios:editar",
};

const EDITAR_DO_TIPO: Record<ContextoDoRegistro["tipo"], string> = {
  negocio: "negocios:editar",
  contato: "contatos:editar",
  empresa: "empresas:gerenciar",
};

/** Cada termo tem de ser começo de alguma palavra do texto (sem acento). */
export function combina(texto: string, termos: string[]): boolean {
  if (termos.length === 0) return true;
  const palavras = semAcento(texto).split(/[^\p{L}\p{N}@.]+/u).filter(Boolean);
  return termos.every((t) => palavras.some((p) => p.startsWith(t)));
}

function acoesDoRegistro(ctx: ContextoDoRegistro, pode: (p: string) => boolean): ItemDaPaleta[] {
  const itens: ItemDaPaleta[] = [];
  const add = (acao: IdDaAcao, rotulo: string) =>
    itens.push({ chave: `registro:${acao}`, tipo: "acao", acao, rotulo, doRegistro: true });
  if (ctx.tipo === "negocio" && ctx.mudarEtapa && pode("negocios:editar")) add("mudar-etapa", "Mudar etapa para…");
  if (ctx.atribuir && pode(EDITAR_DO_TIPO[ctx.tipo])) add("atribuir", "Atribuir a…");
  if (ctx.whatsappPara && pode("contatos:ver")) add("enviar-whatsapp", `Enviar WhatsApp para ${ctx.whatsappPara}`);
  if (ctx.tipo !== "empresa" && pode("tarefas:gerenciar"))
    add("criar-tarefa", ctx.tipo === "negocio" ? "Criar tarefa neste negócio" : `Criar tarefa para ${ctx.titulo}`);
  return itens;
}

const ACOES_GLOBAIS: { acao: IdDaAcao; rotulo: string; palavras: string }[] = [
  { acao: "criar-negocio", rotulo: "Criar negócio", palavras: "novo negocio deal oportunidade" },
  { acao: "criar-contato", rotulo: "Criar contato", palavras: "novo contato pessoa cliente" },
  { acao: "criar-tarefa", rotulo: "Criar tarefa", palavras: "nova tarefa follow-up lembrete" },
  { acao: "enviar-whatsapp", rotulo: "Enviar WhatsApp para…", palavras: "mensagem conversa zap" },
];

export interface EntradaDosGrupos {
  consulta: string;
  permissoes: readonly string[];
  contexto: ContextoDoRegistro | null;
  resultados: ResultadoDaBusca | null;
  recentes: readonly Recente[];
}

export function montarGrupos(e: EntradaDosGrupos): GrupoDaPaleta[] {
  const { termos, vazia } = normalizarConsulta(e.consulta);
  const filtro = vazia ? [] : termos;
  const pode = (p: string) => e.permissoes.includes(p);

  const registro = e.contexto
    ? acoesDoRegistro(e.contexto, pode).filter((i) => i.tipo !== "acao" || combina(i.rotulo, filtro))
    : [];

  const acoes: ItemDaPaleta[] = ACOES_GLOBAIS.filter((a) => pode(PERMISSAO_DA_ACAO[a.acao]))
    .filter((a) => combina(`${a.rotulo} ${a.palavras}`, filtro))
    .map((a) => ({ chave: `acao:${a.acao}`, tipo: "acao", acao: a.acao, rotulo: a.rotulo, doRegistro: false }));

  const ir: ItemDaPaleta[] = PAGINAS.filter((p) => !p.permissao || pode(p.permissao))
    .filter((p) => combina(`${p.rotulo} ${p.palavras ?? ""}`, filtro))
    .map((p) => ({ chave: `ir:${p.caminho}`, tipo: "pagina", rotulo: p.rotulo, caminho: p.caminho }));

  const recentes: ItemDaPaleta[] = e.recentes
    .filter((r) => combina(`${r.titulo} ${r.subtitulo ?? ""}`, filtro))
    .map((r) => ({ chave: `recente:${r.tipo}:${r.id}`, tipo: "recente", recente: r }));

  const tituloDoRegistro = e.contexto
    ? `${e.contexto.tipo === "negocio" ? "Negócio" : e.contexto.tipo === "contato" ? "Contato" : "Empresa"}: ${e.contexto.titulo}`
    : "";

  const grupos: GrupoDaPaleta[] = [];
  const add = (id: IdDoGrupo, titulo: string, itens: ItemDaPaleta[]) => {
    if (itens.length) grupos.push({ id, titulo, itens });
  };

  add("registro", tituloDoRegistro, registro);
  if (vazia) {
    add("recentes", "Recentes", recentes);
    add("acoes", "Ações", acoes);
    add("ir", "Ir para", ir);
    return grupos;
  }

  const r = e.resultados;
  const reg = (lista: RegistroEncontrado[] | undefined): ItemDaPaleta[] =>
    (lista ?? []).map((x) => ({ chave: `${x.tipo}:${x.id}`, tipo: "registro", registro: x }));
  add("acoes", "Ações", acoes);
  add("ir", "Ir para", ir);
  add("negocios", "Negócios", reg(r?.negocios));
  add("contatos", "Contatos", reg(r?.contatos));
  add("empresas", "Empresas", reg(r?.empresas));
  add(
    "notas",
    "Notas e mensagens",
    [...(r?.notas ?? []), ...(r?.mensagens ?? [])].map((t) => ({ chave: `${t.tipo}:${t.id}`, tipo: "trecho", trecho: t }))
  );
  // Recente que já veio nos resultados não aparece duas vezes.
  const jaTem = new Set(grupos.flatMap((g) => g.itens.map((i) => i.chave)));
  add(
    "recentes",
    "Recentes",
    recentes.filter((i) => i.tipo === "recente" && !jaTem.has(`${i.recente.tipo}:${i.recente.id}`))
  );
  return grupos;
}
