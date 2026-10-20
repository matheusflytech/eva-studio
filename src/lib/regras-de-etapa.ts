// ---------------------------------------------------------------------------
// Regras por etapa (item 1 das melhorias do CRM, skill crm-pipeline-kanban).
//
// Funções puras, sem banco nem React: a validação da mudança de etapa, os
// motivos de perda, o relógio do "parado" e a montagem do modal "Complete para
// mover". O servidor (src/lib/server/regras-de-etapa.ts) carrega os dados e
// chama daqui; a tela usa as mesmas funções para montar o modal e o cartão.
//
// Ordem da validação (skill): permissão (na rota) → etapa do funil → campos da
// etapa alvo e das etapas puladas que não podem ser puladas → se faltar, não
// grava. Negócio ganho/perdido só sai com "Reabrir".
// ---------------------------------------------------------------------------

/** Campos padrão do negócio que uma etapa pode exigir. */
export const CAMPOS_PADRAO = [
  { id: "valor", rotulo: "Valor" },
  { id: "previsao", rotulo: "Previsão de fechamento" },
  { id: "responsavel", rotulo: "Responsável" },
  { id: "contato", rotulo: "Contato" },
  { id: "empresa", rotulo: "Empresa" },
  { id: "produtos", rotulo: "Produtos" },
] as const;

export type CampoPadrao = (typeof CAMPOS_PADRAO)[number]["id"];
const IDS_PADRAO = new Set<string>(CAMPOS_PADRAO.map((c) => c.id));

/** Prazo de "parado" de toda etapa aberta sem regra gravada (o de antes das regras). */
export const DIAS_PARADO_PADRAO = 7;
export const DIAS_PARADO_MAXIMO = 365;
export const ORIENTACAO_MAXIMA = 500;

export interface RegraDaEtapa {
  /** "valor", "previsao", ..., ou "cf:<chave>" de campo personalizado. */
  camposObrigatorios: string[];
  /** false = quem passa por cima desta etapa também precisa dos campos dela. */
  podeSerPulada: boolean;
  /** Dias sem atividade para ficar parado; null = nunca fica parado. */
  diasParado: number | null;
  /** "O que fazer nesta etapa" (opcional). */
  orientacao: string;
}

export function regraPadrao(tipo: string): RegraDaEtapa {
  return { camposObrigatorios: [], podeSerPulada: true, diasParado: tipo === "open" ? DIAS_PARADO_PADRAO : null, orientacao: "" };
}

const campoValido = (c: string) => IDS_PADRAO.has(c) || /^cf:[a-z0-9_]{1,40}$/.test(c);

/** Registro do banco (ou null) → regra. Lixo no JSON vira o padrão daquele pedaço. */
export function regraDoRegistro(
  r: { requiredFields?: unknown; canBeSkipped?: unknown; rottingDays?: unknown; guidance?: unknown } | null | undefined,
  tipo: string
): RegraDaEtapa {
  const base = regraPadrao(tipo);
  if (!r) return base;
  const campos = Array.isArray(r.requiredFields) ? [...new Set(r.requiredFields.filter((c): c is string => typeof c === "string" && campoValido(c)))] : [];
  const dias = typeof r.rottingDays === "number" && Number.isInteger(r.rottingDays) && r.rottingDays >= 1 ? Math.min(r.rottingDays, DIAS_PARADO_MAXIMO) : null;
  return {
    camposObrigatorios: campos,
    podeSerPulada: r.canBeSkipped !== false,
    diasParado: tipo === "open" ? dias : null,
    orientacao: typeof r.guidance === "string" ? r.guidance.slice(0, ORIENTACAO_MAXIMA) : "",
  };
}

/**
 * Corpo da configuração (tela "Funis e etapas") → regra, ou o erro em texto.
 * Campo personalizado só entra se existir no funil (`chavesPersonalizadas`).
 */
export function lerRegraDoCorpo(
  corpo: Record<string, unknown>,
  tipo: string,
  chavesPersonalizadas: string[]
): { ok: true; regra: RegraDaEtapa } | { ok: false; erro: string } {
  const campos = corpo.camposObrigatorios ?? [];
  if (!Array.isArray(campos) || campos.some((c) => typeof c !== "string")) return { ok: false, erro: "Campos obrigatórios inválidos." };
  const chaves = new Set(chavesPersonalizadas.map((k) => `cf:${k}`));
  for (const c of campos as string[]) {
    if (!IDS_PADRAO.has(c) && !chaves.has(c)) return { ok: false, erro: `Campo “${c}” não existe neste funil.` };
  }
  let diasParado: number | null = null;
  if (corpo.diasParado !== null && corpo.diasParado !== undefined && corpo.diasParado !== "") {
    const n = Number(corpo.diasParado);
    if (!Number.isInteger(n) || n < 1 || n > DIAS_PARADO_MAXIMO) return { ok: false, erro: `Dias para parado: de 1 a ${DIAS_PARADO_MAXIMO}, ou vazio para nunca.` };
    diasParado = n;
  }
  const orientacao = typeof corpo.orientacao === "string" ? corpo.orientacao.trim() : "";
  if (orientacao.length > ORIENTACAO_MAXIMA) return { ok: false, erro: `Orientação: no máximo ${ORIENTACAO_MAXIMA} caracteres.` };
  return {
    ok: true,
    regra: {
      camposObrigatorios: [...new Set(campos as string[])],
      podeSerPulada: corpo.podeSerPulada !== false,
      diasParado: tipo === "open" ? diasParado : null,
      orientacao,
    },
  };
}

// ── Validação da mudança de etapa ──────────────────────────────────────────

export interface EtapaDaRegra {
  id: string;
  name: string;
  type: string;
  position: number;
  pipelineId: string;
}

/** O que a validação precisa saber do negócio (já com o que a mesma ação vai gravar). */
export interface EstadoDoNegocio {
  amountCents: number;
  expectedClosingAt: Date | string | null;
  ownerId: string | null;
  companyId: string | null;
  /** Quantos contatos vinculados. */
  contatos: number;
  /** Quantos itens (produtos). */
  produtos: number;
  customFields: Record<string, unknown>;
}

export interface DefinicaoMinima {
  key: string;
  label: string;
  type: string;
}

export interface CampoFaltando {
  campo: string;
  rotulo: string;
  /** Etapa que exige (a alvo ou uma pulada). */
  etapaId: string;
  etapa: string;
}

export type ResultadoDaMudanca =
  | { ok: true; ignorouObrigatorios: boolean; faltando: CampoFaltando[] }
  | { ok: false; codigo: "negocio_fechado"; mensagem: string }
  | { ok: false; codigo: "campos_obrigatorios"; mensagem: string; faltando: CampoFaltando[] };

const vazioPersonalizado = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

/** O campo está preenchido no negócio? Caixa de seleção obrigatória = marcada. */
export function campoPreenchido(campo: string, n: EstadoDoNegocio, defs: DefinicaoMinima[]): boolean {
  switch (campo) {
    case "valor": return n.amountCents > 0;
    case "previsao": return !!n.expectedClosingAt;
    case "responsavel": return !!n.ownerId;
    case "contato": return n.contatos > 0;
    case "empresa": return !!n.companyId;
    case "produtos": return n.produtos > 0;
  }
  if (!campo.startsWith("cf:")) return true;
  const def = defs.find((d) => d.key === campo.slice(3));
  // Campo apagado (ou de outro funil) não pode travar ninguém.
  if (!def) return true;
  const v = n.customFields?.[def.key];
  if (def.type === "checkbox") return v === true;
  return !vazioPersonalizado(v);
}

export function rotuloDoCampo(campo: string, defs: DefinicaoMinima[]): string {
  const padrao = CAMPOS_PADRAO.find((c) => c.id === campo);
  if (padrao) return padrao.rotulo;
  return defs.find((d) => `cf:${d.key}` === campo)?.label ?? campo;
}

/**
 * Etapas cujos campos valem para esta mudança: a alvo e, num avanço dentro do
 * mesmo funil, as abertas que ficaram para trás sem passar por elas e que NÃO
 * podem ser puladas. Ganho "pula" todas as abertas depois da atual. Perdido,
 * reabrir e troca de funil olham só a alvo.
 */
export function etapasExigidas(
  etapas: EtapaDaRegra[],
  regras: Map<string, RegraDaEtapa>,
  de: EtapaDaRegra | null,
  para: EtapaDaRegra
): EtapaDaRegra[] {
  const lista = [para];
  if (!de || de.type !== "open" || de.pipelineId !== para.pipelineId || para.type === "lost") return lista;
  const puladas = etapas
    .filter((e) => e.type === "open" && e.id !== de.id && e.id !== para.id && e.pipelineId === para.pipelineId)
    .filter((e) => e.position > de.position && (para.type === "won" || e.position < para.position))
    .filter((e) => regras.get(e.id)?.podeSerPulada === false)
    .sort((a, b) => a.position - b.position);
  return [...puladas, para];
}

export function validarMudancaDeEtapa(e: {
  etapas: EtapaDaRegra[];
  regras: Map<string, RegraDaEtapa>;
  de: EtapaDaRegra | null;
  para: EtapaDaRegra;
  negocio: EstadoDoNegocio;
  defs: DefinicaoMinima[];
  reabrir?: boolean;
  ignorarObrigatorios?: boolean;
}): ResultadoDaMudanca {
  const { de, para } = e;
  if (de && de.id === para.id) return { ok: true, ignorouObrigatorios: false, faltando: [] };
  if (de && de.type !== "open" && !e.reabrir) {
    const como = de.type === "won" ? "ganho" : "perdido";
    return { ok: false, codigo: "negocio_fechado", mensagem: `Este negócio está ${como}. Use “Reabrir” antes de mudar a etapa.` };
  }
  const reabrindo = !!de && de.type !== "open";
  const exigidas = reabrindo ? [para] : etapasExigidas(e.etapas, e.regras, de, para);
  const faltando: CampoFaltando[] = [];
  const vistos = new Set<string>();
  for (const etapa of exigidas) {
    const regra = e.regras.get(etapa.id) ?? regraPadrao(etapa.type);
    for (const campo of regra.camposObrigatorios) {
      if (vistos.has(campo) || campoPreenchido(campo, e.negocio, e.defs)) continue;
      vistos.add(campo);
      faltando.push({ campo, rotulo: rotuloDoCampo(campo, e.defs), etapaId: etapa.id, etapa: etapa.name });
    }
  }
  if (faltando.length === 0) return { ok: true, ignorouObrigatorios: false, faltando };
  if (e.ignorarObrigatorios) return { ok: true, ignorouObrigatorios: true, faltando };
  return {
    ok: false,
    codigo: "campos_obrigatorios",
    mensagem: `Para mover para ${para.name}, preencha: ${faltando.map((f) => f.rotulo).join(", ")}.`,
    faltando,
  };
}

// ── Motivos de perda ───────────────────────────────────────────────────────

export interface MotivoDePerda {
  id: string;
  rotulo: string;
  exigeNota: boolean;
}

/** Prefixo dos motivos padrão (sem registro no banco): a perda grava reasonId nulo. */
export const PREFIXO_PADRAO = "padrao:";

export const MOTIVOS_PADRAO: MotivoDePerda[] = [
  { id: "padrao:preco", rotulo: "Preço", exigeNota: false },
  { id: "padrao:concorrente", rotulo: "Escolheu concorrente", exigeNota: false },
  { id: "padrao:sem-resposta", rotulo: "Sem resposta", exigeNota: false },
  { id: "padrao:sem-orcamento", rotulo: "Sem orçamento", exigeNota: false },
  { id: "padrao:timing", rotulo: "Timing", exigeNota: false },
  { id: "padrao:outro", rotulo: "Outro", exigeNota: true },
];

export const NOTA_MAXIMA = 500;
export const ROTULO_MAXIMO = 80;
export const MOTIVOS_MAXIMOS = 30;
export const FOLLOW_UP_MAXIMO = 365;

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export interface EntradaDaPerda {
  motivoId?: string | null;
  /** Texto livre (API antiga, bloco do fluxo): casa com o rótulo, senão vira "Outro" + nota. */
  motivo?: string | null;
  nota?: string | null;
}

export interface PerdaResolvida {
  /** null = motivo padrão (sem registro) ou texto livre sem "Outro" no funil. */
  motivoId: string | null;
  rotulo: string;
  nota: string;
}

/** Perdido exige motivo; motivo que pede nota ("Outro") exige nota. */
export function resolverPerda(motivos: MotivoDePerda[], entrada: EntradaDaPerda): { ok: true; perda: PerdaResolvida } | { ok: false; erro: string } {
  const nota = (entrada.nota ?? "").trim().slice(0, NOTA_MAXIMA);
  const id = (entrada.motivoId ?? "").trim();
  const texto = (entrada.motivo ?? "").trim().slice(0, NOTA_MAXIMA);
  let escolhido: MotivoDePerda | undefined;
  let notaFinal = nota;
  if (id) {
    escolhido = motivos.find((m) => m.id === id);
    if (!escolhido) return { ok: false, erro: "Motivo de perda não encontrado neste funil." };
  } else if (texto) {
    escolhido = motivos.find((m) => normalizar(m.rotulo) === normalizar(texto));
    if (!escolhido) {
      const outro = motivos.find((m) => m.exigeNota) ?? motivos.find((m) => normalizar(m.rotulo) === "outro");
      if (!outro) return { ok: true, perda: { motivoId: null, rotulo: texto.slice(0, ROTULO_MAXIMO), nota } };
      escolhido = outro;
      notaFinal = nota || texto;
    }
  }
  if (!escolhido) return { ok: false, erro: "Escolha o motivo da perda." };
  if (escolhido.exigeNota && !notaFinal) return { ok: false, erro: `“${escolhido.rotulo}” pede uma nota explicando a perda.` };
  return {
    ok: true,
    perda: { motivoId: escolhido.id.startsWith(PREFIXO_PADRAO) ? null : escolhido.id, rotulo: escolhido.rotulo, nota: notaFinal },
  };
}

/** Lista de motivos vinda da configuração → validada (rótulo, nota, sem repetidos). */
export function lerMotivosDoCorpo(bruto: unknown): { ok: true; motivos: { id?: string; rotulo: string; exigeNota: boolean }[] } | { ok: false; erro: string } {
  if (!Array.isArray(bruto)) return { ok: false, erro: "Envie a lista de motivos." };
  if (bruto.length === 0) return { ok: false, erro: "O funil precisa de pelo menos um motivo de perda." };
  if (bruto.length > MOTIVOS_MAXIMOS) return { ok: false, erro: `No máximo ${MOTIVOS_MAXIMOS} motivos.` };
  const vistos = new Set<string>();
  const motivos: { id?: string; rotulo: string; exigeNota: boolean }[] = [];
  for (const item of bruto) {
    const m = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const rotulo = typeof m.rotulo === "string" ? m.rotulo.trim() : "";
    if (!rotulo) return { ok: false, erro: "Todo motivo precisa de um nome." };
    if (rotulo.length > ROTULO_MAXIMO) return { ok: false, erro: `Nome do motivo: no máximo ${ROTULO_MAXIMO} caracteres.` };
    const chave = normalizar(rotulo);
    if (vistos.has(chave)) return { ok: false, erro: `Motivo repetido: “${rotulo}”.` };
    vistos.add(chave);
    const id = typeof m.id === "string" && m.id && !m.id.startsWith(PREFIXO_PADRAO) ? m.id : undefined;
    motivos.push({ ...(id ? { id } : {}), rotulo, exigeNota: m.exigeNota === true });
  }
  return { ok: true, motivos };
}

/** Dias do follow-up opcional do modal de perda (1..365), ou null. */
export function diasDeFollowUp(bruto: unknown): number | null {
  if (bruto === undefined || bruto === null || bruto === "" || bruto === false) return null;
  const n = Number(bruto);
  return Number.isInteger(n) && n >= 1 && n <= FOLLOW_UP_MAXIMO ? n : null;
}

// ── Parado (rotting) ───────────────────────────────────────────────────────

const DIA = 86_400_000;

/**
 * Prazo da etapa: etapa fechada nunca fica parada; aberta usa a regra.
 * `undefined` (regra desconhecida, ex.: tela antiga) = o padrão de 7 dias.
 */
export function prazoDeParado(tipo: string, diasDaRegra: number | null | undefined): number | null {
  if (tipo !== "open") return null;
  return diasDaRegra === undefined ? DIAS_PARADO_PADRAO : diasDaRegra;
}

/** O relógio do parado: greatest(última atividade, entrada na etapa). */
export function inicioDoSilencio(stageSince: string | Date, lastActivityAt?: string | Date | null): number {
  const etapa = new Date(stageSince).getTime();
  const atividade = lastActivityAt ? new Date(lastActivityAt).getTime() : NaN;
  return Number.isFinite(atividade) ? Math.max(etapa, atividade) : etapa;
}

/** Dias inteiros sem atividade (nem mudança de etapa). */
export function diasSemAtividade(n: { stageSince: string | Date; lastActivityAt?: string | Date | null }, agora: Date): number {
  return Math.floor((agora.getTime() - inicioDoSilencio(n.stageSince, n.lastActivityAt)) / DIA);
}

/** aberto E prazo NOT NULL E dias sem atividade > prazo. */
export function negocioParado(
  n: { stageSince: string | Date; lastActivityAt?: string | Date | null; closedAt?: string | Date | null },
  tipo: string,
  prazo: number | null | undefined,
  agora: Date
): boolean {
  const p = prazoDeParado(tipo, prazo);
  if (p === null || n.closedAt) return false;
  return diasSemAtividade(n, agora) > p;
}

// ── Modal "Complete para mover" ────────────────────────────────────────────

export type TipoDoCampoDoModal = "valor" | "data" | "responsavel" | "contato" | "empresa" | "produtos" | "personalizado";

export interface CampoDoModal {
  campo: string;
  rotulo: string;
  tipo: TipoDoCampoDoModal;
  /** Definição do campo personalizado (tipo "personalizado"). */
  def?: DefinicaoMinima;
  /** Etapas que pedem este campo (para a frase de apoio). */
  etapas: string[];
  /** Produtos não dá para preencher no modal: o link leva à ficha. */
  soNaFicha: boolean;
}

const TIPO_PADRAO: Record<CampoPadrao, TipoDoCampoDoModal> = {
  valor: "valor",
  previsao: "data",
  responsavel: "responsavel",
  contato: "contato",
  empresa: "empresa",
  produtos: "produtos",
};

/** Só os campos que faltam, na ordem em que o servidor mandou, um por campo. */
export function montarCamposDoModal(faltando: CampoFaltando[], defs: DefinicaoMinima[]): CampoDoModal[] {
  const porCampo = new Map<string, CampoDoModal>();
  for (const f of faltando) {
    const existente = porCampo.get(f.campo);
    if (existente) {
      if (!existente.etapas.includes(f.etapa)) existente.etapas.push(f.etapa);
      continue;
    }
    if (f.campo.startsWith("cf:")) {
      const def = defs.find((d) => d.key === f.campo.slice(3));
      if (!def) continue;
      porCampo.set(f.campo, { campo: f.campo, rotulo: def.label, tipo: "personalizado", def, etapas: [f.etapa], soNaFicha: false });
      continue;
    }
    const tipo = TIPO_PADRAO[f.campo as CampoPadrao];
    if (!tipo) continue;
    porCampo.set(f.campo, { campo: f.campo, rotulo: f.rotulo, tipo, etapas: [f.etapa], soNaFicha: tipo === "produtos" });
  }
  return [...porCampo.values()];
}

export type ValoresDoModal = Record<string, unknown>;

/**
 * Valores digitados no modal → corpo do PATCH /api/deals/[id] (salva e move
 * numa ação só). Vazio não entra: o servidor responde de novo com o que falta.
 */
export function corpoDoModal(campos: CampoDoModal[], valores: ValoresDoModal): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  const personalizados: Record<string, unknown> = {};
  for (const c of campos) {
    const v = valores[c.campo];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    switch (c.tipo) {
      case "valor": corpo.amount = v; break;
      case "data": corpo.expectedClosingAt = v; break;
      case "responsavel": corpo.ownerId = v; break;
      case "contato": corpo.addContactId = v; break;
      case "empresa": corpo.companyId = v; break;
      case "personalizado": personalizados[c.campo.slice(3)] = v; break;
    }
  }
  if (Object.keys(personalizados).length) corpo.customFields = personalizados;
  return corpo;
}
