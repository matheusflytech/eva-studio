/**
 * Como o cartão do negócio aparece em cada funil: quais informações mostrar
 * (e em que ordem), quais entram na prévia ao clicar e a densidade.
 *
 * Guardado por funil em eva_studio_pipeline_card_layouts. Sem registro, vale
 * o padrão abaixo mais os campos personalizados marcados "mostrar no cartão"
 * (comportamento de antes desta tela existir).
 *
 * Campo padrão = uma das chaves de CAMPOS_PADRAO. Campo personalizado =
 * "cf:<key>" (a key nunca muda, então renomear o rótulo não quebra o layout).
 */

export const CAMPOS_PADRAO = {
  empresa: "Empresa ou contato (título)",
  nome: "Nome do negócio",
  valor: "Valor",
  probabilidade: "Chance de fechar",
  responsavel: "Responsável",
  proximoPasso: "Próximo passo",
  whatsapp: "WhatsApp",
  previsao: "Previsão de fechamento",
  naEtapaHa: "Tempo na etapa",
  criadoEm: "Criado em",
  contato: "Contato principal",
  telefone: "Telefone do contato",
  email: "E-mail do contato",
  produtos: "Produtos",
  etapa: "Etapa",
  ultimaInteracao: "Última interação",
} as const;

export type CampoPadrao = keyof typeof CAMPOS_PADRAO;
export type CampoDoCartao = CampoPadrao | `cf:${string}`;
export type Densidade = "compacto" | "confortavel";

/** Ícones de ação no rodapé do cartão (quadro v4). */
export const ACOES_DO_CARTAO = ["whatsapp", "ligar", "tarefa", "nota"] as const;
export type AcaoDoCartao = (typeof ACOES_DO_CARTAO)[number];
export const ROTULO_DA_ACAO: Record<AcaoDoCartao, string> = { whatsapp: "WhatsApp", ligar: "Ligar", tarefa: "Nova tarefa", nota: "Nova nota" };

/** Seções do painel que abre ao clicar no cartão (quadro v4). */
export const SECOES_DO_PAINEL = ["detalhes", "contato", "atividade", "tarefas", "produtos"] as const;
export type SecaoDoPainel = (typeof SECOES_DO_PAINEL)[number];
export const ROTULO_DA_SECAO: Record<SecaoDoPainel, string> = {
  detalhes: "Detalhes",
  contato: "Contato principal",
  atividade: "Atividade recente",
  tarefas: "Tarefas",
  produtos: "Produtos",
};

export interface LayoutDoCartao {
  /** O que aparece no cartão do quadro, na ordem. */
  campos: CampoDoCartao[];
  /** O que aparece em "Detalhes" no painel ao clicar no cartão, na ordem. */
  previa: CampoDoCartao[];
  densidade: Densidade;
  /** Ícones do rodapé do cartão, na ordem. */
  acoes: AcaoDoCartao[];
  /** Seções do painel, na ordem (nunca vazio). */
  secoes: SecaoDoPainel[];
}

export const MAX_CAMPOS_NO_CARTAO = 8;
export const MAX_CAMPOS_NA_PREVIA = 20;

// Padrão do quadro v4 (os exemplos que o Matheus escolheu): contato em cima,
// valor, previsão e responsável no cartão; detalhes, contato e atividade no painel.
export const LAYOUT_PADRAO: LayoutDoCartao = {
  campos: ["contato", "valor", "previsao", "responsavel"],
  previa: ["empresa", "valor", "etapa", "previsao", "responsavel", "ultimaInteracao", "criadoEm"],
  densidade: "confortavel",
  acoes: [...ACOES_DO_CARTAO],
  secoes: ["detalhes", "contato", "atividade"],
};

function listaFixa<T extends string>(v: unknown, validos: readonly T[]): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const item of v) if (validos.includes(item as T) && !out.includes(item as T)) out.push(item as T);
  return out;
}

const acoesDe = (v: unknown) => listaFixa(v, ACOES_DO_CARTAO) ?? LAYOUT_PADRAO.acoes;
function secoesDe(v: unknown): SecaoDoPainel[] {
  const l = listaFixa(v, SECOES_DO_PAINEL);
  if (!l) return LAYOUT_PADRAO.secoes;
  return l.length ? l : ["detalhes"];
}

function ehCampo(v: unknown, chavesPersonalizadas: Set<string> | null): v is CampoDoCartao {
  if (typeof v !== "string") return false;
  if (v in CAMPOS_PADRAO) return true;
  if (!v.startsWith("cf:") || v.length < 4) return false;
  return chavesPersonalizadas ? chavesPersonalizadas.has(v.slice(3)) : true;
}

function lista(v: unknown, max: number, chaves: Set<string> | null): CampoDoCartao[] | null {
  if (!Array.isArray(v)) return null;
  const vistos = new Set<string>();
  const out: CampoDoCartao[] = [];
  for (const item of v) {
    if (!ehCampo(item, chaves) || vistos.has(item)) continue;
    vistos.add(item);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Layout salvo (qualquer formato) para um layout válido. `chavesPersonalizadas`
 * descarta campos personalizados que já não existem; null aceita qualquer
 * "cf:" (usado quando as definições ainda não carregaram).
 * Sem layout salvo, `cartaoLegado` (keys com showOnCard) entra no fim do padrão.
 */
export function normalizarLayout(
  bruto: unknown,
  chavesPersonalizadas: string[] | null = null,
  cartaoLegado: string[] = []
): LayoutDoCartao {
  const chaves = chavesPersonalizadas ? new Set(chavesPersonalizadas) : null;
  const o = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : null;
  if (!o || (o.campos === undefined && o.previa === undefined && o.densidade === undefined)) {
    const extras = cartaoLegado.map((k) => `cf:${k}` as const).filter((c) => ehCampo(c, chaves));
    return {
      campos: [...LAYOUT_PADRAO.campos, ...extras].slice(0, MAX_CAMPOS_NO_CARTAO),
      previa: [...LAYOUT_PADRAO.previa, ...extras.filter((c) => !LAYOUT_PADRAO.previa.includes(c))],
      densidade: LAYOUT_PADRAO.densidade,
      acoes: LAYOUT_PADRAO.acoes,
      secoes: LAYOUT_PADRAO.secoes,
    };
  }
  return {
    campos: lista(o.campos, MAX_CAMPOS_NO_CARTAO, chaves) ?? LAYOUT_PADRAO.campos,
    previa: lista(o.previa, MAX_CAMPOS_NA_PREVIA, chaves) ?? LAYOUT_PADRAO.previa,
    densidade: o.densidade === "compacto" ? "compacto" : "confortavel",
    // Layout salvo antes do v4 não tem estes dois: vale o padrão.
    acoes: acoesDe(o.acoes),
    secoes: secoesDe(o.secoes),
  };
}

/** A escolha da pessoa (quando existe) vale mais que a do funil. */
export function resolverLayout(daPessoa: LayoutDoCartao | null, doFunil: LayoutDoCartao): LayoutDoCartao {
  return daPessoa ?? doFunil;
}

/** Validação estrita para a rota de salvar: devolve o erro ou null. */
export function erroDoLayout(bruto: unknown, chavesPersonalizadas: string[]): string | null {
  const o = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : null;
  if (!o) return "Layout inválido.";
  const chaves = new Set(chavesPersonalizadas);
  for (const [nome, max] of [
    ["campos", MAX_CAMPOS_NO_CARTAO],
    ["previa", MAX_CAMPOS_NA_PREVIA],
  ] as const) {
    const v = o[nome];
    if (!Array.isArray(v)) return `Informe a lista "${nome}".`;
    if (v.length > max) return nome === "campos" ? `O cartão mostra no máximo ${max} informações.` : `A prévia mostra no máximo ${max} informações.`;
    const desconhecido = v.find((c) => !ehCampo(c, chaves));
    if (desconhecido !== undefined) return `Campo desconhecido: ${String(desconhecido)}.`;
  }
  if (o.densidade !== "compacto" && o.densidade !== "confortavel") return "Densidade inválida.";
  if (o.acoes !== undefined) {
    if (!Array.isArray(o.acoes)) return 'Informe a lista "acoes".';
    const x = o.acoes.find((a) => !ACOES_DO_CARTAO.includes(a));
    if (x !== undefined) return `Ação desconhecida: ${String(x)}.`;
  }
  if (o.secoes !== undefined) {
    if (!Array.isArray(o.secoes)) return 'Informe a lista "secoes".';
    const x = o.secoes.find((a) => !SECOES_DO_PAINEL.includes(a));
    if (x !== undefined) return `Seção desconhecida: ${String(x)}.`;
  }
  return null;
}

export function rotuloDoCampo(campo: CampoDoCartao, rotulosPersonalizados: Record<string, string>): string {
  if (campo.startsWith("cf:")) return rotulosPersonalizados[campo.slice(3)] ?? campo.slice(3);
  return CAMPOS_PADRAO[campo as CampoPadrao];
}
