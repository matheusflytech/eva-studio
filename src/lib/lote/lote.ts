import type { EntidadeCrm } from "@/lib/filtro-crm";
import type { PermissaoGranular } from "@/lib/permissoes/catalogo";

// ---------------------------------------------------------------------------
// Ações em massa (fase L5) — parte pura: quais ações cada lista tem, que
// permissão cada uma pede, a leitura do pedido e os textos da prévia.
//
//   POST /api/contacts/lote | /api/deals/lote
//   { acao, ids?: string[] | filtro?: FiltroCrm, pipelineId?, parametros?, simular? }
//
// "Selecionar todos os N" manda o FILTRO (o servidor refaz a busca com
// idsDoFiltro, dentro do contrato e do escopo); a seleção manual manda ids,
// que o servidor confere contra o contrato e o escopo antes de agir.
// As ações "restaurar_*" e "desarquivar" são o Desfazer: a resposta de uma
// ação já traz o corpo pronto para desfazê-la (`desfazer`).
// ---------------------------------------------------------------------------

/** Teto de registros por ação (seleção por filtro corta aqui e avisa). */
export const LIMITE_DO_LOTE = 5000;
/** Tamanho do bloco de cada transação. */
export const BLOCO_DO_LOTE = 200;

export const ACOES_DE_CONTATO = ["atribuir", "etiqueta", "sequencia", "apagar", "restaurar_responsavel", "restaurar_lixeira"] as const;
export const ACOES_DE_NEGOCIO = [
  "atribuir",
  "mover",
  "ganho",
  "perdido",
  "arquivar",
  "apagar",
  "restaurar_responsavel",
  "restaurar_etapa",
  "desarquivar",
  "restaurar_lixeira",
] as const;
export type AcaoDeContato = (typeof ACOES_DE_CONTATO)[number];
export type AcaoDeNegocio = (typeof ACOES_DE_NEGOCIO)[number];
export type AcaoDeLote = AcaoDeContato | AcaoDeNegocio;

/** Permissão granular de cada ação (o Desfazer pede a mesma da ação). */
export const PERMISSAO_DA_ACAO: { contatos: Record<AcaoDeContato, PermissaoGranular>; negocios: Record<AcaoDeNegocio, PermissaoGranular> } = {
  contatos: {
    atribuir: "contatos:editar",
    etiqueta: "contatos:editar",
    restaurar_responsavel: "contatos:editar",
    sequencia: "sequencias:gerenciar",
    apagar: "contatos:apagar",
    restaurar_lixeira: "contatos:apagar",
  },
  negocios: {
    atribuir: "negocios:editar",
    mover: "negocios:editar",
    ganho: "negocios:editar",
    perdido: "negocios:editar",
    arquivar: "negocios:editar",
    desarquivar: "negocios:editar",
    restaurar_responsavel: "negocios:editar",
    restaurar_etapa: "negocios:editar",
    apagar: "negocios:apagar",
    restaurar_lixeira: "negocios:apagar",
  },
};

/** Ações que não miram registros (o alvo vem nos parâmetros). */
const SEM_ALVO = new Set<AcaoDeLote>(["restaurar_responsavel", "restaurar_etapa", "restaurar_lixeira"]);

export interface PedidoDeLote {
  acao: AcaoDeLote;
  /** Ids escolhidos (seleção manual) — ou null quando é por filtro. */
  ids: string[] | null;
  filtro: unknown;
  pipelineId: string | null;
  parametros: Record<string, unknown>;
  simular: boolean;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Corpo → pedido, ou a mensagem do erro (400). */
export function lerPedidoDeLote(corpo: Record<string, unknown>, entidade: EntidadeCrm): PedidoDeLote | string {
  const acoes: readonly string[] = entidade === "contatos" ? ACOES_DE_CONTATO : ACOES_DE_NEGOCIO;
  const acao = typeof corpo.acao === "string" && acoes.includes(corpo.acao) ? (corpo.acao as AcaoDeLote) : null;
  if (!acao) return "Ação inválida.";
  const parametros = corpo.parametros && typeof corpo.parametros === "object" && !Array.isArray(corpo.parametros) ? (corpo.parametros as Record<string, unknown>) : {};
  const pipelineId = typeof corpo.pipelineId === "string" && ID.test(corpo.pipelineId) ? corpo.pipelineId : null;
  const simular = corpo.simular === true;
  if (SEM_ALVO.has(acao)) return { acao, ids: null, filtro: null, pipelineId, parametros, simular };

  const temIds = Array.isArray(corpo.ids);
  const temFiltro = corpo.filtro !== undefined && corpo.filtro !== null;
  if (temIds === temFiltro) return "Mande os ids escolhidos OU o filtro (para “todos os resultados”), não os dois.";
  if (temIds) {
    const brutos = corpo.ids as unknown[];
    if (brutos.length > LIMITE_DO_LOTE) return `No máximo ${LIMITE_DO_LOTE.toLocaleString("pt-BR")} registros por vez.`;
    const ids = [...new Set(brutos.filter((x): x is string => typeof x === "string" && ID.test(x)))];
    if (ids.length === 0) return "Selecione ao menos um registro.";
    return { acao, ids, filtro: null, pipelineId, parametros, simular };
  }
  return { acao, ids: null, filtro: corpo.filtro, pipelineId, parametros, simular };
}

// ── Resultado ──────────────────────────────────────────────────────────────

export interface FalhaDoItem {
  id: string;
  nome: string;
  motivo: string;
  /** Código da regra (campos_obrigatorios, negocio_fechado, motivo_obrigatorio...). */
  codigo?: string;
  faltando?: { id: string; rotulo: string }[];
}

export interface PreviaDoLote {
  /** "Proposta → Negociação": quantos fazem cada caminho. */
  caminhos: { de: string; para: string; quantidade: number }[];
  /** Quantos mudam de fato e quantos já estavam assim. */
  mudam: number;
  jaEstavam: number;
}

export interface ResultadoDoLote {
  acao: AcaoDeLote;
  simulado: boolean;
  /** Registros considerados (dentro do contrato e do escopo). */
  total: number;
  /** Mudaram (ou mudariam, na simulação). */
  ok: number;
  /** Já estavam assim, ou ficaram fora (contrato/escopo, ids que não existem). */
  ignorados: number;
  falhas: FalhaDoItem[];
  /** A seleção por filtro passou do limite: só os primeiros LIMITE_DO_LOTE. */
  truncado: boolean;
  avisos: string[];
  previa?: PreviaDoLote;
  /** Corpo pronto para desfazer (POST na mesma rota), quando dá. */
  desfazer?: { acao: AcaoDeLote; ids?: string[]; parametros: Record<string, unknown> };
}

const n = (x: number) => x.toLocaleString("pt-BR");
const plural = (q: number, um: string, varios: string) => `${n(q)} ${q === 1 ? um : varios}`;

const POR_CODIGO: Record<string, [string, string]> = {
  campos_obrigatorios: ["bloqueado por campos obrigatórios", "bloqueados por campos obrigatórios"],
  negocio_fechado: ["fechado (precisa reabrir)", "fechados (precisam reabrir)"],
  motivo_obrigatorio: ["sem motivo de perda válido", "sem motivo de perda válido"],
};

/**
 * Frase da prévia: "12 negócios vão de Proposta → Negociação; 3 bloqueados
 * por campos obrigatórios; 2 já estavam na etapa".
 */
export function textoDaPrevia(r: Pick<ResultadoDoLote, "ok" | "ignorados" | "falhas" | "previa">, entidade: EntidadeCrm): string {
  const nome = (q: number) => (entidade === "contatos" ? plural(q, "contato", "contatos") : plural(q, "negócio", "negócios"));
  const partes: string[] = [];
  const caminhos = r.previa?.caminhos ?? [];
  if (caminhos.length) {
    for (const c of caminhos) partes.push(`${nome(c.quantidade)} ${c.quantidade === 1 ? "vai" : "vão"} de ${c.de} → ${c.para}`);
  } else {
    partes.push(`${nome(r.ok)} ${r.ok === 1 ? "muda" : "mudam"}`);
  }
  const porCodigo = new Map<string, number>();
  for (const f of r.falhas) porCodigo.set(f.codigo ?? "outro", (porCodigo.get(f.codigo ?? "outro") ?? 0) + 1);
  for (const [codigo, q] of porCodigo) {
    const [um, varios] = POR_CODIGO[codigo] ?? ["com erro", "com erro"];
    partes.push(`${n(q)} ${q === 1 ? um : varios}`);
  }
  if (r.ignorados) partes.push(`${n(r.ignorados)} sem mudança`);
  return partes.join("; ");
}

/** Agrupa os caminhos de/para (para a prévia), do maior para o menor. */
export function agruparCaminhos(movimentos: { de: string; para: string }[]): PreviaDoLote["caminhos"] {
  const m = new Map<string, { de: string; para: string; quantidade: number }>();
  for (const x of movimentos) {
    const k = `${x.de}\u0000${x.para}`;
    const atual = m.get(k) ?? { de: x.de, para: x.para, quantidade: 0 };
    atual.quantidade++;
    m.set(k, atual);
  }
  return [...m.values()].sort((a, b) => b.quantidade - a.quantidade || a.de.localeCompare(b.de));
}

/** Corta uma lista em blocos. */
export function emBlocos<T>(xs: readonly T[], tamanho = BLOCO_DO_LOTE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += tamanho) out.push(xs.slice(i, i + tamanho));
  return out;
}
