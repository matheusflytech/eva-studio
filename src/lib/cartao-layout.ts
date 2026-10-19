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
} as const;

export type CampoPadrao = keyof typeof CAMPOS_PADRAO;
export type CampoDoCartao = CampoPadrao | `cf:${string}`;
export type Densidade = "compacto" | "confortavel";

export interface LayoutDoCartao {
  /** O que aparece no cartão do quadro, na ordem. */
  campos: CampoDoCartao[];
  /** O que aparece na prévia ao clicar no cartão, na ordem. */
  previa: CampoDoCartao[];
  densidade: Densidade;
}

export const MAX_CAMPOS_NO_CARTAO = 8;
export const MAX_CAMPOS_NA_PREVIA = 20;

export const LAYOUT_PADRAO: LayoutDoCartao = {
  campos: ["empresa", "nome", "valor", "probabilidade", "responsavel", "whatsapp", "proximoPasso"],
  previa: ["valor", "probabilidade", "previsao", "naEtapaHa", "responsavel", "contato", "telefone", "email", "criadoEm"],
  densidade: "confortavel",
};

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
    };
  }
  return {
    campos: lista(o.campos, MAX_CAMPOS_NO_CARTAO, chaves) ?? LAYOUT_PADRAO.campos,
    previa: lista(o.previa, MAX_CAMPOS_NA_PREVIA, chaves) ?? LAYOUT_PADRAO.previa,
    densidade: o.densidade === "compacto" ? "compacto" : "confortavel",
  };
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
  return null;
}

export function rotuloDoCampo(campo: CampoDoCartao, rotulosPersonalizados: Record<string, string>): string {
  if (campo.startsWith("cf:")) return rotulosPersonalizados[campo.slice(3)] ?? campo.slice(3);
  return CAMPOS_PADRAO[campo as CampoPadrao];
}
