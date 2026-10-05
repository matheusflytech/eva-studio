import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  CHAVES_RESERVADAS,
  slugificar,
  normalizarValor,
  type DefinicaoDeCampo,
  type EntidadeDoCampo,
  type OpcaoDeCampo,
  type TipoDeCampo,
} from "@/lib/custom-fields";

// ---------------------------------------------------------------------------
// Campos personalizados no servidor: ler as definições e aplicar valores.
//
// Todo caminho que grava um valor passa por `aplicarValores`: a tela do negócio,
// a API, o bloco do fluxo e a ferramenta da IA. Uma regra só significa que
// "consumo mensal" é número em qualquer um deles, e que um agente de IA não
// consegue gravar texto no lugar de número só porque o modelo errou o formato.
// ---------------------------------------------------------------------------

interface LinhaDeCampo {
  id: string;
  entity: string;
  pipelineId: string | null;
  key: string;
  label: string;
  type: string;
  options: unknown;
  required: boolean;
  helpText: string;
  showOnCard: boolean;
  position: number;
}

export function serializarDefinicao(c: LinhaDeCampo): DefinicaoDeCampo {
  return {
    id: c.id,
    entity: c.entity as EntidadeDoCampo,
    pipelineId: c.pipelineId,
    key: c.key,
    label: c.label,
    type: c.type as TipoDeCampo,
    options: Array.isArray(c.options) ? (c.options as OpcaoDeCampo[]) : [],
    required: c.required,
    helpText: c.helpText,
    showOnCard: c.showOnCard,
    position: c.position,
  };
}

/**
 * Definições que valem num contexto. Pro negócio, os campos de todos os funis
 * mais os do funil em questão; um campo "Tipo de imóvel" do funil da imobiliária
 * não aparece num negócio do funil de pós-venda.
 */
export async function carregarDefinicoes(
  orgId: string,
  entity: EntidadeDoCampo,
  pipelineId?: string | null
): Promise<DefinicaoDeCampo[]> {
  const linhas = await prisma.customField.findMany({
    where: {
      orgId,
      entity,
      ...(entity === "deal" ? { OR: [{ pipelineId: null }, ...(pipelineId ? [{ pipelineId }] : [])] } : {}),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return linhas.map(serializarDefinicao);
}

export type ResultadoDeValores =
  | { ok: true; valores: Record<string, unknown> }
  | { ok: false; erros: string[] };

/**
 * Aplica `entrada` sobre `atuais`, validando cada campo pela definição.
 *
 * - Chave que não existe é ignorada, não é erro: um fluxo pode ter variável
 *   com nome qualquer e não deve quebrar por isso.
 * - `null` ou vazio apaga o valor.
 * - `exigirObrigatorios` só vale pra quem preenche à mão (tela e API). O motor
 *   não pode ser travado por um campo obrigatório: se o cliente ainda não
 *   respondeu aquela pergunta, o negócio nasce sem o valor.
 */
export function aplicarValores(
  defs: DefinicaoDeCampo[],
  atuais: Record<string, unknown>,
  entrada: Record<string, unknown>,
  opcoes: { exigirObrigatorios?: boolean } = {}
): ResultadoDeValores {
  const valores = { ...atuais };
  const erros: string[] = [];
  const porChave = new Map(defs.map((d) => [d.key, d]));

  for (const [chave, bruto] of Object.entries(entrada)) {
    const def = porChave.get(chave);
    if (!def) continue;
    const r = normalizarValor(def, bruto);
    if (!r.ok) {
      erros.push(r.erro);
      continue;
    }
    if (r.valor === null) delete valores[chave];
    else valores[chave] = r.valor;
  }

  if (opcoes.exigirObrigatorios) {
    for (const d of defs) {
      if (d.required && (valores[d.key] === undefined || valores[d.key] === null)) {
        erros.push(`${d.label}: preenchimento obrigatório.`);
      }
    }
  }

  return erros.length > 0 ? { ok: false, erros } : { ok: true, valores };
}

/** Opções de lista: rótulo obrigatório, valor gerado e único. */
export function prepararOpcoes(bruto: unknown): OpcaoDeCampo[] {
  if (!Array.isArray(bruto)) return [];
  const usados = new Set<string>();
  const rotulos = new Set<string>();
  const saida: OpcaoDeCampo[] = [];

  for (const o of bruto.slice(0, 50)) {
    const label = String((o as { label?: unknown })?.label ?? "").trim().slice(0, 60);
    if (!label || rotulos.has(label.toLowerCase())) continue;
    rotulos.add(label.toLowerCase());
    const dado = String((o as { value?: unknown })?.value ?? "").trim();
    const base = dado || slugificar(label);
    let valor = base;
    let n = 2;
    while (usados.has(valor)) valor = `${base}_${n++}`;
    usados.add(valor);
    saida.push({ value: valor, label, color: (o as { color?: string })?.color || undefined });
  }
  return saida;
}

/**
 * Mescla valores no JSON de campos do contato. Chave com definição é validada
 * pelo tipo; chave sem definição passa direto (variáveis capturadas pelo fluxo
 * e dados importados continuam funcionando). Obrigatório só vale pro que a
 * pessoa mexeu agora.
 */
export async function mesclarCamposDeContato(
  orgId: string,
  atuais: Record<string, unknown>,
  entrada: Record<string, unknown>
): Promise<ResultadoDeValores> {
  const defs = await carregarDefinicoes(orgId, "contact");
  const chaves = new Set(defs.map((d) => d.key));
  const definidos: Record<string, unknown> = {};
  const livres: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entrada)) (chaves.has(k) ? definidos : livres)[k] = v;

  const r = aplicarValores(defs, atuais, definidos);
  if (!r.ok) return r;

  const erros: string[] = [];
  for (const d of defs) {
    if (d.required && d.key in definidos && r.valores[d.key] === undefined) erros.push(d.label + ": preenchimento obrigatório.");
  }
  if (erros.length > 0) return { ok: false, erros };

  const valores = { ...r.valores };
  for (const [k, v] of Object.entries(livres)) {
    if (v === null || v === undefined || v === "") delete valores[k];
    else valores[k] = v;
  }
  return { ok: true, valores };
}

/**
 * Ajusta no próprio objeto as variáveis capturadas que batem com um campo de
 * contato definido: converte pro formato do tipo (480 vira número, "casa" vira
 * a opção certa). O que não passa na validação é retirado, em vez de gravar
 * lixo num campo tipado. Variável sem campo definido não é tocada.
 */
export async function normalizarCapturados(orgId: string, capturados: Record<string, unknown>): Promise<void> {
  const chaves = Object.keys(capturados);
  if (chaves.length === 0) return;
  const defs = await carregarDefinicoes(orgId, "contact");
  for (const d of defs) {
    if (!(d.key in capturados)) continue;
    const r = normalizarValor(d, capturados[d.key]);
    if (r.ok && r.valor !== null) capturados[d.key] = r.valor;
    else delete capturados[d.key];
  }
}

/**
 * Chave estável de um campo novo: nasce do rótulo e nunca mais muda. Única por
 * organização e entidade, e nunca uma que o CRM já usa para outra coisa.
 */
export async function gerarChaveUnica(orgId: string, entity: EntidadeDoCampo, rotulo: string): Promise<string> {
  let base = slugificar(rotulo);
  if (CHAVES_RESERVADAS.has(base)) base = `${base}_campo`;
  let key = base;
  for (let n = 2; await prisma.customField.findUnique({ where: { orgId_entity_key: { orgId, entity, key } } }); n += 1) {
    key = `${base}_${n}`;
  }
  return key;
}
