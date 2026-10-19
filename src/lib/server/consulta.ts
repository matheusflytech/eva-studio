import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { serializarDefinicao } from "@/lib/server/custom-fields";
import {
  LIMITE_DE_NEGOCIOS,
  ROTULO_CANAL,
  ROTULO_TIPO_ETAPA,
  SEM_VALOR,
  agrupamentoTemporal,
  campoDeFiltro,
  dataBaseEfetiva,
  diaLocal,
  formatoDaConsulta,
  inicioDoDia,
  janelaAnterior,
  janelaDoPainel,
  normalizarCondicao,
  somarDias,
  type CampoDeFiltro,
  type Consulta,
  type FiltroDeConsulta,
  type FiltrosDeConsulta,
  type FiltrosGlobais,
  type FormatoDeValor,
  type Intervalo,
  type ResultadoDeConsulta,
} from "@/lib/consulta";
import { formatarValor, parseNumero, valorNumerico, type DefinicaoDeCampo } from "@/lib/custom-fields";

// ---------------------------------------------------------------------------
// Roda uma consulta montada pelo cliente.
//
// Segurança: nada da consulta vira SQL. O banco só recebe um `where` que este
// arquivo monta com colunas fixas (organização, funil, etapa, responsável,
// datas, valor...). Campo personalizado e "dias na etapa" são resolvidos em
// memória sobre as linhas já filtradas.
//
// Como o E/OU convive com as duas metades: o `where` é uma PRÉ-seleção — cada
// condição que o banco não sabe avaliar vira "verdadeiro" ali (o que só deixa
// passar linhas a mais, nunca a menos), e depois a árvore inteira é avaliada
// de novo em memória, exata. Por isso o limite de linhas: dashboard não é
// relatório de milhões de negócios, e a resposta avisa (`truncado`) quando
// o corte foi atingido.
// ---------------------------------------------------------------------------

const DIA = 24 * 60 * 60 * 1000;
export const LIMITE_DE_LINHAS = LIMITE_DE_NEGOCIOS;

export interface Linha {
  id: string;
  name: string;
  pipelineId: string;
  stageId: string;
  ownerId: string | null;
  companyId: string | null;
  amountCents: number;
  probability: number;
  lostReason: string;
  expectedClosingAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  stageSince: Date;
  customFields: unknown;
  stage: { id: string; name: string; position: number; type: string };
  owner: { id: string; name: string } | null;
  pipeline?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
  contacts?: { contact: { tags?: { tagId: string }[]; channels?: { channel: string }[] } }[];
  /** Só quando agrupa por produto. */
  items?: { productId: string | null; name: string; totalCents: number }[];
}

/** O que muda de fora do cartão: período do painel e filtros globais. */
export interface ContextoDaConsulta {
  globais?: FiltrosGlobais;
  agora?: Date;
}

type Defs = Map<string, DefinicaoDeCampo>;

function valorCf(l: Linha, chave: string): unknown {
  return ((l.customFields ?? {}) as Record<string, unknown>)[chave];
}

function etiquetasDe(l: Linha): string[] {
  return [...new Set((l.contacts ?? []).flatMap((c) => (c.contact.tags ?? []).map((t) => t.tagId)))];
}

function canaisDe(l: Linha): string[] {
  return [...new Set((l.contacts ?? []).flatMap((c) => (c.contact.channels ?? []).map((t) => t.channel)))];
}

function vazio(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Valor do campo na linha, já no formato do tipo de filtro (data = "AAAA-MM-DD" em SP). */
function valorDaLinha(l: Linha, campo: CampoDeFiltro, agora: Date): unknown {
  switch (campo.id) {
    case "funil": return l.pipelineId;
    case "etapa": return l.stageId;
    case "tipoEtapa": return l.stage.type;
    case "responsavel": return l.ownerId;
    case "empresa": return l.companyId;
    case "etiqueta": return etiquetasDe(l);
    case "canal": return canaisDe(l);
    case "valor": return l.amountCents / 100;
    case "probabilidade": return l.probability;
    case "diasNaEtapa": return Math.max(0, Math.floor((agora.getTime() - l.stageSince.getTime()) / DIA));
    case "motivoPerda": return l.lostReason;
    case "nome": return l.name;
    case "criadoEm": return diaLocal(l.createdAt);
    case "fechadoEm": return l.closedAt ? diaLocal(l.closedAt) : null;
    case "previsao": return l.expectedClosingAt ? diaLocal(l.expectedClosingAt) : null;
  }
  const def = campo.def;
  if (!def) return null;
  const v = valorCf(l, def.key);
  if (vazio(v)) return null;
  if (campo.tipo === "numero") return valorNumerico(def, v);
  if (campo.tipo === "multi") return Array.isArray(v) ? v.map(String) : [String(v)];
  if (campo.tipo === "sim_nao") return v === true || v === "true";
  return String(v);
}

function numero(t: string | undefined): number {
  return parseNumero(String(t ?? "").trim());
}

/** Uma condição numa linha. Campo apagado não derruba o cartão: a condição é ignorada. */
export function passaNaCondicao(l: Linha, bruta: FiltroDeConsulta, defs: Defs, agora = new Date()): boolean {
  const campo = campoDeFiltro(bruta.campo, defs);
  if (!campo) return true;
  const f = normalizarCondicao(bruta, campo.tipo);
  const atual = valorDaLinha(l, campo, agora);

  if (campo.tipo === "sim_nao") {
    // Checkbox nunca marcado é "não".
    return (atual === true) === (f.valor === "true");
  }

  const estaVazio = vazio(atual);
  if (f.op === "vazio") return estaVazio;
  if (f.op === "preenchido") return !estaVazio;

  if (campo.tipo === "lista" || campo.tipo === "multi") {
    const conjunto = Array.isArray(atual) ? atual.map(String) : estaVazio ? [] : [String(atual)];
    const alvo = f.valores ?? [];
    const ids = alvo.filter((v) => v !== SEM_VALOR);
    const algum = ids.some((v) => conjunto.includes(v)) || (alvo.includes(SEM_VALOR) && conjunto.length === 0);
    if (f.op === "qualquer") return algum;
    if (f.op === "nenhum") return !algum;
    if (f.op === "todos") return ids.length > 0 && ids.every((v) => conjunto.includes(v));
    return false;
  }

  if (campo.tipo === "numero") {
    if (estaVazio) return f.op === "neq";
    const a = Number(atual);
    const b = numero(f.valor);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    switch (f.op) {
      case "eq": return a === b;
      case "neq": return a !== b;
      case "gt": return a > b;
      case "gte": return a >= b;
      case "lt": return a < b;
      case "lte": return a <= b;
      case "entre": {
        const c = numero(f.ate);
        if (!Number.isFinite(c)) return false;
        return a >= Math.min(b, c) && a <= Math.max(b, c);
      }
    }
    return false;
  }

  if (campo.tipo === "data") {
    if (estaVazio) return false;
    const dia = String(atual).slice(0, 10);
    const intervalo = intervaloDaData(f, agora);
    if (!intervalo) return false;
    return (!intervalo.de || dia >= intervalo.de) && (!intervalo.ate || dia <= intervalo.ate);
  }

  // texto
  const a = String(atual ?? "").trim().toLowerCase();
  const b = String(f.valor ?? "").trim().toLowerCase();
  if (estaVazio) return f.op === "neq" || f.op === "naoContem";
  switch (f.op) {
    case "eq": return a === b;
    case "neq": return a !== b;
    case "contem": return a.includes(b);
    case "naoContem": return !a.includes(b);
  }
  return false;
}

/** Dias (inclusive, AAAA-MM-DD) que uma condição de data aceita. Ponta ausente = aberta. */
function intervaloDaData(f: FiltroDeConsulta, agora: Date): { de?: string; ate?: string } | null {
  const v = f.valor ?? "";
  const hoje = diaLocal(agora);
  switch (f.op) {
    case "em": return { de: v, ate: v };
    case "antes": return { ate: somarDias(v, -1) };
    case "depois": return { de: somarDias(v, 1) };
    case "entre": {
      const ate = f.ate ?? v;
      return v <= ate ? { de: v, ate } : { de: ate, ate: v };
    }
    case "ultimos": return { de: somarDias(hoje, -(Math.max(1, Number(v)) - 1)), ate: hoje };
    case "proximos": return { de: hoje, ate: somarDias(hoje, Math.max(1, Number(v)) - 1) };
  }
  return null;
}

/** A árvore inteira de filtros numa linha. */
export function passaNosFiltros(l: Linha, filtros: FiltrosDeConsulta, defs: Defs, agora = new Date()): boolean {
  const grupos = filtros.grupos.filter((g) => g.condicoes.length > 0);
  if (grupos.length === 0) return true;
  const passaNoGrupo = (g: (typeof grupos)[number]) =>
    g.logica === "ou"
      ? g.condicoes.some((f) => passaNaCondicao(l, f, defs, agora))
      : g.condicoes.every((f) => passaNaCondicao(l, f, defs, agora));
  return filtros.logica === "ou" ? grupos.some(passaNoGrupo) : grupos.every(passaNoGrupo);
}

// ── Tradução para o banco (pré-seleção) ─────────────────────────────────────

const NADA: Prisma.DealWhereInput = { id: { in: [] } };

function whereDeLista(
  coluna: "pipelineId" | "stageId" | "ownerId" | "companyId",
  op: string,
  valores: string[],
  anulavel: boolean
): Prisma.DealWhereInput | null {
  const ids = valores.filter((v) => v !== SEM_VALOR);
  const comSem = anulavel && valores.includes(SEM_VALOR);
  if (op === "qualquer") {
    const ou: Prisma.DealWhereInput[] = [];
    if (ids.length) ou.push({ [coluna]: { in: ids } });
    if (comSem) ou.push({ [coluna]: null });
    return ou.length === 0 ? NADA : ou.length === 1 ? ou[0] : { OR: ou };
  }
  if (op === "nenhum") {
    if (comSem) return { [coluna]: ids.length ? { not: null, notIn: ids } : { not: null } };
    if (!ids.length) return null;
    // NOT IN em SQL descarta o nulo; quem não tem responsável "não é nenhum de" também.
    return anulavel ? { OR: [{ [coluna]: null }, { [coluna]: { notIn: ids } }] } : { [coluna]: { notIn: ids } };
  }
  if (op === "preenchido") return anulavel ? { [coluna]: { not: null } } : null;
  if (op === "vazio") return anulavel ? { [coluna]: null } : NADA;
  return null;
}

function whereDeContato(
  rel: "tags" | "channels",
  op: string,
  valores: string[]
): Prisma.DealWhereInput | null {
  const alguem = (dentro: Prisma.ContactTagWhereInput | Prisma.ContactChannelWhereInput): Prisma.DealContactWhereInput =>
    rel === "tags"
      ? { contact: { tags: { some: dentro as Prisma.ContactTagWhereInput } } }
      : { contact: { channels: { some: dentro as Prisma.ContactChannelWhereInput } } };
  const filtro = rel === "tags" ? { tagId: { in: valores } } : { channel: { in: valores } };
  if (op === "qualquer") return { contacts: { some: alguem(filtro) } };
  if (op === "nenhum") return { contacts: { none: alguem(filtro) } };
  if (op === "preenchido") return { contacts: { some: alguem({}) } };
  if (op === "vazio") return { contacts: { none: alguem({}) } };
  return null;
}

function whereDeNumero(coluna: "amountCents" | "probability", f: FiltroDeConsulta, escala: number): Prisma.DealWhereInput | null {
  const a = numero(f.valor);
  if (!Number.isFinite(a)) return null;
  // A coluna é inteira (centavos, %): os limites são arredondados pra FORA.
  // Pré-seleção pode trazer a mais; a conta exata é refeita em memória.
  const baixo = (x: number) => Math.floor(x * escala);
  const alto = (x: number) => Math.ceil(x * escala);
  const w = (filtro: Prisma.IntFilter<"Deal"> | number): Prisma.DealWhereInput =>
    coluna === "amountCents" ? { amountCents: filtro } : { probability: filtro };
  switch (f.op) {
    case "eq": {
      const v = Math.round(a * escala);
      return Math.abs(v - a * escala) < 1e-6 ? w(v) : NADA;
    }
    case "gt":
    case "gte": return w({ gte: baixo(a) });
    case "lt":
    case "lte": return w({ lte: alto(a) });
    case "entre": {
      const b = numero(f.ate);
      if (!Number.isFinite(b)) return null;
      return w({ gte: baixo(Math.min(a, b)), lte: alto(Math.max(a, b)) });
    }
  }
  // "≠" fica só pra memória.
  return null;
}

function whereDeData(coluna: "createdAt" | "closedAt" | "expectedClosingAt", f: FiltroDeConsulta, agora: Date): Prisma.DealWhereInput | null {
  if (f.op === "preenchido") return coluna === "createdAt" ? null : { [coluna]: { not: null } };
  if (f.op === "vazio") return coluna === "createdAt" ? NADA : { [coluna]: null };
  const i = intervaloDaData(f, agora);
  if (!i) return null;
  return {
    [coluna]: {
      ...(i.de ? { gte: inicioDoDia(i.de) } : {}),
      ...(i.ate ? { lt: inicioDoDia(somarDias(i.ate, 1)) } : {}),
    },
  };
}

function whereDeTexto(coluna: "name" | "lostReason", f: FiltroDeConsulta): Prisma.DealWhereInput | null {
  const v = String(f.valor ?? "").trim();
  switch (f.op) {
    case "eq": return { [coluna]: { equals: v, mode: "insensitive" } };
    case "neq": return { NOT: { [coluna]: { equals: v, mode: "insensitive" } } };
    case "contem": return { [coluna]: { contains: v, mode: "insensitive" } };
    case "naoContem": return { NOT: { [coluna]: { contains: v, mode: "insensitive" } } };
    case "vazio": return { [coluna]: "" };
    case "preenchido": return { NOT: { [coluna]: "" } };
  }
  return null;
}

/** Uma condição traduzida pro banco. null = o banco não sabe avaliar (fica pra memória). */
export function whereDaCondicao(bruta: FiltroDeConsulta, agora = new Date()): Prisma.DealWhereInput | null {
  const campo = campoDeFiltro(bruta.campo, []);
  // Campo personalizado (e campo removido) fica só pra memória.
  if (!campo) return null;
  const f = normalizarCondicao(bruta, campo.tipo);
  const valores = f.valores ?? [];
  switch (campo.id) {
    case "funil": return whereDeLista("pipelineId", f.op, valores, false);
    case "etapa": return whereDeLista("stageId", f.op, valores, false);
    case "responsavel": return whereDeLista("ownerId", f.op, valores, true);
    case "empresa": return whereDeLista("companyId", f.op, valores, true);
    case "tipoEtapa":
      if (f.op === "qualquer") return { stage: { type: { in: valores } } };
      if (f.op === "nenhum") return { stage: { type: { notIn: valores } } };
      return null;
    case "etiqueta": return whereDeContato("tags", f.op, valores);
    case "canal": return whereDeContato("channels", f.op, valores);
    case "valor": return whereDeNumero("amountCents", f, 100);
    case "probabilidade": return whereDeNumero("probability", f, 1);
    case "criadoEm": return whereDeData("createdAt", f, agora);
    case "fechadoEm": return whereDeData("closedAt", f, agora);
    case "previsao": return whereDeData("expectedClosingAt", f, agora);
    case "motivoPerda": return whereDeTexto("lostReason", f);
    case "nome": return whereDeTexto("name", f);
  }
  return null;
}

/**
 * A árvore de filtros como pré-seleção do banco. Condição que o banco não
 * avalia vira "verdadeiro": num E ela some, num OU ela torna o grupo inteiro
 * verdadeiro. Sem NÃO no nível da árvore, isso só alarga — nunca corta uma
 * linha que a avaliação em memória aceitaria.
 */
export function whereDosFiltros(filtros: FiltrosDeConsulta, agora = new Date()): Prisma.DealWhereInput | null {
  const combinar = (logica: "e" | "ou", partes: (Prisma.DealWhereInput | null)[]): Prisma.DealWhereInput | null => {
    if (partes.length === 0) return null;
    if (logica === "ou") {
      if (partes.some((p) => p === null)) return null;
      return partes.length === 1 ? partes[0] : { OR: partes as Prisma.DealWhereInput[] };
    }
    const fixas = partes.filter((p): p is Prisma.DealWhereInput => p !== null);
    if (fixas.length === 0) return null;
    return fixas.length === 1 ? fixas[0] : { AND: fixas };
  };
  const grupos = filtros.grupos
    .filter((g) => g.condicoes.length > 0)
    .map((g) => combinar(g.logica, g.condicoes.map((f) => whereDaCondicao(f, agora))));
  return combinar(filtros.logica, grupos);
}

function usaCampo(filtros: FiltrosDeConsulta, ids: string[]): boolean {
  return filtros.grupos.some((g) => g.condicoes.some((f) => ids.includes(f.campo)));
}

// ── Período e data base ────────────────────────────────────────────────────

/** Janela de datas da consulta. null = todo o histórico. */
export function janelaDaConsulta(c: Consulta, ctx: ContextoDaConsulta = {}): Intervalo | null {
  if (c.periodo === "tudo") return null;
  if (c.periodo === "painel") {
    const g = ctx.globais;
    return janelaDoPainel(g?.dias ?? 30, g?.de, g?.ate, ctx.agora ?? new Date());
  }
  return c.periodo;
}

const COLUNA_DA_DATA = { criacao: "createdAt", fechamento: "closedAt", previsao: "expectedClosingAt" } as const;

/** Data de referência da linha (período, agrupar no tempo, "quando" da tabela). */
function dataDeReferencia(l: Linha, c: Consulta): Date | null {
  if (!c.dataBase) {
    // Comportamento de antes: ganhos e perdidos contam pelo fechamento, com a criação de reserva.
    return (c.status === "ganhos" || c.status === "perdidos") && l.closedAt ? l.closedAt : l.createdAt;
  }
  return l[COLUNA_DA_DATA[c.dataBase]];
}

export function montarWhere(orgId: string, c: Consulta, ctx: ContextoDaConsulta, janela: Intervalo | null): Prisma.DealWhereInput {
  const agora = ctx.agora ?? new Date();
  const e: Prisma.DealWhereInput[] = [];

  if (c.status === "abertos") e.push({ closedAt: null });
  if (c.status === "ganhos") e.push({ stage: { type: "won" } });
  if (c.status === "perdidos") e.push({ stage: { type: "lost" } });

  if (c.funilIds.length) e.push({ pipelineId: { in: c.funilIds } });
  // Filtros globais da barra do painel: somam (E) com os do cartão.
  const g = ctx.globais;
  if (g?.funis.length) e.push({ pipelineId: { in: g.funis } });
  if (g?.donos.length) {
    const w = whereDeLista("ownerId", "qualquer", g.donos, true);
    if (w) e.push(w);
  }

  if (janela) {
    e.push({ [COLUNA_DA_DATA[dataBaseEfetiva(c)]]: { gte: inicioDoDia(janela.de), lt: inicioDoDia(somarDias(janela.ate, 1)) } });
  }

  const wf = whereDosFiltros(c.filtros, agora);
  if (wf) e.push(wf);

  return { orgId, archivedAt: null, ...(e.length ? { AND: e } : {}) };
}

async function carregarDefs(orgId: string): Promise<Defs> {
  // Todos os campos de negócio da organização, inclusive os de um funil só:
  // o cartão pode agrupar e filtrar por qualquer um.
  const linhasDeCampo = await prisma.customField.findMany({ where: { orgId, entity: "deal" } });
  return new Map<string, DefinicaoDeCampo>(linhasDeCampo.map((d) => [d.key, serializarDefinicao(d)]));
}

async function buscarLinhas(orgId: string, c: Consulta, ctx: ContextoDaConsulta, janela: Intervalo | null, defs: Defs) {
  const agora = ctx.agora ?? new Date();
  const precisaContatos = c.agrupar === "canal" || usaCampo(c.filtros, ["etiqueta", "canal"]);

  const linhas = (await prisma.deal.findMany({
    where: montarWhere(orgId, c, ctx, janela),
    include: {
      stage: { select: { id: true, name: true, position: true, type: true } },
      owner: { select: { id: true, name: true } },
      pipeline: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      ...(precisaContatos
        ? { contacts: { select: { contact: { select: { tags: { select: { tagId: true } }, channels: { select: { channel: true } } } } } } }
        : {}),
      // Itens só para "por produto": sem a tabela no banco, só esse cartão falha.
      ...(c.agrupar === "produto" ? { items: { select: { productId: true, name: true, totalCents: true } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    // Um a mais que o limite: é assim que se sabe que houve corte.
    take: LIMITE_DE_LINHAS + 1,
  })) as unknown as Linha[];

  const truncado = linhas.length > LIMITE_DE_LINHAS;
  const base = truncado ? linhas.slice(0, LIMITE_DE_LINHAS) : linhas;
  return { truncado, filtradas: base.filter((l) => passaNosFiltros(l, c.filtros, defs, agora)) };
}

// ── Medidas ────────────────────────────────────────────────────────────────

function medidaDe(l: Linha, c: Consulta, defs: Defs): number | null {
  if (c.campo === "valor") return l.amountCents / 100;
  if (c.campo === "ponderado") return (l.amountCents * l.probability) / 100 / 100;
  const def = c.campo ? defs.get(c.campo.slice(3)) : undefined;
  return def ? valorNumerico(def, valorCf(l, def.key)) : null;
}

/** O número de um grupo de linhas, conforme a medida. */
export function agregar(grupo: Linha[], c: Consulta, defs: Defs): number | null {
  if (c.medida === "contagem") return grupo.length;
  if (c.medida === "taxaGanho") {
    const ganhos = grupo.filter((l) => l.stage.type === "won").length;
    const fechados = ganhos + grupo.filter((l) => l.stage.type === "lost").length;
    return fechados > 0 ? ganhos / fechados : null;
  }
  const valores = grupo.map((l) => medidaDe(l, c, defs)).filter((v): v is number => v !== null && Number.isFinite(v));
  if (valores.length === 0) return c.medida === "soma" ? 0 : null;
  switch (c.medida) {
    case "soma": return valores.reduce((s, v) => s + v, 0);
    case "media": return valores.reduce((s, v) => s + v, 0) / valores.length;
    case "minimo": return Math.min(...valores);
    case "maximo": return Math.max(...valores);
    case "mediana": {
      const o = [...valores].sort((a, b) => a - b);
      const m = Math.floor(o.length / 2);
      return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
    }
  }
  return null;
}

// ── Agrupamento ────────────────────────────────────────────────────────────

const FAIXAS_DE_VALOR = [
  { ate: 1_000, label: "Até R$ 1 mil" },
  { ate: 5_000, label: "R$ 1 mil a 5 mil" },
  { ate: 20_000, label: "R$ 5 mil a 20 mil" },
  { ate: 100_000, label: "R$ 20 mil a 100 mil" },
  { ate: Infinity, label: "Acima de R$ 100 mil" },
];

function faixaDeValor(reais: number): { chave: string; label: string; ordem: number } {
  const i = FAIXAS_DE_VALOR.findIndex((f) => reais <= f.ate);
  return { chave: `f${i}`, label: FAIXAS_DE_VALOR[i].label, ordem: i };
}

/** Passo "redondo" (1, 2, 5 × 10ⁿ) pra faixas automáticas de um número. */
function passoBonito(bruto: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export interface FaixasAutomaticas { inicio: number; passo: number }

export function faixasAutomaticas(valores: number[]): FaixasAutomaticas | null {
  if (valores.length === 0) return null;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  if (min === max) return { inicio: min, passo: 0 };
  const passo = passoBonito((max - min) / 5);
  return { inicio: Math.floor(min / passo) * passo, passo };
}

/** Segunda-feira da semana do dia. */
function inicioDaSemana(dia: string): string {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return somarDias(dia, -((dow + 6) % 7));
}

/** Chave do balde de tempo de um dia: dia, segunda da semana, AAAA-MM, AAAA-Tn. */
export function chaveTemporal(dia: string, g: string): string {
  if (g === "semana") return inicioDaSemana(dia);
  if (g === "mes") return dia.slice(0, 7);
  if (g === "trimestre") return `${dia.slice(0, 4)}-T${Math.floor((Number(dia.slice(5, 7)) - 1) / 3) + 1}`;
  return dia;
}

export function rotuloTemporal(chave: string, g: string): string {
  if (g === "trimestre") {
    const [a, t] = chave.split("-T");
    return `${t}º tri/${a}`;
  }
  const [a, m, d] = chave.split("-");
  return g === "mes" ? `${m}/${a}` : `${d}/${m}`;
}

function primeiroDiaDoBalde(dia: string, g: string): string {
  if (g === "semana") return inicioDaSemana(dia);
  if (g === "mes") return `${dia.slice(0, 7)}-01`;
  if (g === "trimestre") {
    const mes = Math.floor((Number(dia.slice(5, 7)) - 1) / 3) * 3 + 1;
    return `${dia.slice(0, 4)}-${String(mes).padStart(2, "0")}-01`;
  }
  return dia;
}

function proximoBalde(dia: string, g: string): string {
  if (g === "semana") return somarDias(dia, 7);
  if (g === "mes" || g === "trimestre") {
    const d = new Date(`${dia}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + (g === "mes" ? 1 : 3), 1);
    return d.toISOString().slice(0, 10);
  }
  return somarDias(dia, 1);
}

/** Todos os baldes entre o primeiro e o último dia, com zero onde não houve nada. */
export function preencherBuracos(inicio: string, fim: string, g: string): string[] {
  const saida: string[] = [];
  let cursor = primeiroDiaDoBalde(inicio, g);
  while (cursor <= fim && saida.length < 400) {
    saida.push(chaveTemporal(cursor, g));
    cursor = proximoBalde(cursor, g);
  }
  return saida;
}

const NAO_INFORMADO = { chave: "", label: "Não informado", ordem: 9999 };

/** Produto do catálogo pelo id; item avulso pelo nome. */
function chaveDoProduto(i: { productId: string | null; name: string }): string {
  return i.productId ? `p:${i.productId}` : `a:${i.name.trim().toLowerCase()}`;
}

/**
 * A linha como entra no grupo de um produto: o valor passa a ser o total dos
 * itens daquele produto no negócio. Assim "soma do valor por produto" não
 * conta o negócio inteiro em cada produto que ele tem.
 */
function linhaDoProduto(l: Linha, chave: string): Linha {
  if (!chave || !l.items?.length) return l;
  const total = l.items.filter((i) => chaveDoProduto(i) === chave).reduce((s, i) => s + i.totalCents, 0);
  return { ...l, amountCents: total };
}

/** Em quais grupos a linha entra. Lista de várias opções (e canais) entra em cada uma. */
export function chavesDeGrupo(
  l: Linha,
  c: Consulta,
  defs: Defs,
  faixas?: FaixasAutomaticas | null,
  variosFunis = false
): { chave: string; label: string; ordem: number }[] {
  const g = c.agrupar;
  switch (g) {
    case "etapa":
      return [{ chave: l.stage.id, label: variosFunis && l.pipeline ? `${l.stage.name} · ${l.pipeline.name}` : l.stage.name, ordem: l.stage.position }];
    case "responsavel":
      return [{ chave: l.owner?.id ?? "", label: l.owner?.name ?? "Sem responsável", ordem: l.owner ? 0 : 9999 }];
    case "funil":
      return [{ chave: l.pipelineId, label: l.pipeline?.name ?? "Funil", ordem: 0 }];
    case "tipoEtapa": {
      const ordem = { open: 0, won: 1, lost: 2 }[l.stage.type] ?? 3;
      return [{ chave: l.stage.type, label: ROTULO_TIPO_ETAPA[l.stage.type] ?? l.stage.type, ordem }];
    }
    case "empresa":
      return [{ chave: l.company?.id ?? "", label: l.company?.name ?? "Sem empresa", ordem: l.company ? 0 : 9999 }];
    case "motivoPerda": {
      const m = l.lostReason.trim();
      return [{ chave: m.toLowerCase(), label: m || "Sem motivo", ordem: m ? 0 : 9999 }];
    }
    case "canal": {
      const canais = canaisDe(l);
      if (canais.length === 0) return [{ chave: "", label: "Sem canal", ordem: 9999 }];
      return canais.map((k) => ({ chave: k, label: ROTULO_CANAL[k] ?? k, ordem: 0 }));
    }
    case "faixaValor":
      return [faixaDeValor(l.amountCents / 100)];
    case "produto": {
      const itens = l.items ?? [];
      if (itens.length === 0) return [{ chave: "", label: "Sem produtos", ordem: 9999 }];
      const vistos = new Map<string, { chave: string; label: string; ordem: number }>();
      for (const i of itens) {
        const chave = chaveDoProduto(i);
        if (!vistos.has(chave)) vistos.set(chave, { chave, label: i.name, ordem: 0 });
      }
      return [...vistos.values()];
    }
  }

  if (agrupamentoTemporal(g)) {
    const d = dataDeReferencia(l, c);
    if (!d) return [];
    const k = chaveTemporal(diaLocal(d), g);
    return [{ chave: k, label: rotuloTemporal(k, g), ordem: 0 }];
  }

  const def = defs.get(g.slice(3));
  if (!def) return [{ chave: "", label: "Campo removido", ordem: 0 }];
  const v = valorCf(l, def.key);
  if (vazio(v)) return [NAO_INFORMADO];
  if (def.type === "multiselect" && Array.isArray(v)) {
    return v.map((x) => ({ chave: String(x), label: def.options.find((o) => o.value === x)?.label ?? String(x), ordem: 0 }));
  }
  if (def.type === "currency") {
    const n = valorNumerico(def, v);
    return n === null ? [NAO_INFORMADO] : [faixaDeValor(n)];
  }
  if (def.type === "number") {
    const n = valorNumerico(def, v);
    if (n === null || !faixas) return [NAO_INFORMADO];
    const fmt = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    if (faixas.passo === 0) return [{ chave: "f0", label: fmt(faixas.inicio), ordem: 0 }];
    const i = Math.floor((n - faixas.inicio) / faixas.passo);
    const a = faixas.inicio + i * faixas.passo;
    return [{ chave: `f${i}`, label: `${fmt(a)} a ${fmt(a + faixas.passo)}`, ordem: i }];
  }
  if (def.type === "date") {
    const k = String(v).slice(0, 7);
    return [{ chave: k, label: rotuloTemporal(k, "mes"), ordem: Number(k.replace("-", "")) || 0 }];
  }
  const label = formatarValor(def, v);
  return [{ chave: label, label, ordem: 0 }];
}

/** Agrupamentos com ordem natural (etapa, faixas, situação): ordenam pela ordem, não pelo tamanho. */
function ordemNatural(c: Consulta, defs: Defs): boolean {
  if (["etapa", "tipoEtapa", "faixaValor"].includes(c.agrupar)) return true;
  const def = c.agrupar.startsWith("cf:") ? defs.get(c.agrupar.slice(3)) : undefined;
  return def?.type === "number" || def?.type === "currency" || def?.type === "date";
}

function arredondar(v: number | null, formato: FormatoDeValor): number {
  if (v === null) return 0;
  if (formato === "inteiro") return v;
  if (formato === "porcento") return Math.round(v * 10000) / 10000;
  return Math.round(v * 100) / 100;
}

// ── Execução ───────────────────────────────────────────────────────────────

export async function rodarConsulta(orgId: string, c: Consulta, ctx: ContextoDaConsulta = {}): Promise<ResultadoDeConsulta> {
  const defs = await carregarDefs(orgId);
  const janela = janelaDaConsulta(c, ctx);
  const { filtradas, truncado } = await buscarLinhas(orgId, c, ctx, janela, defs);
  const formato = formatoDaConsulta(c, [...defs.values()]);

  if (!c.agrupar) {
    const valor = agregar(filtradas, c, defs);
    const r: ResultadoDeConsulta = { tipo: "numero", valor, formato, negocios: filtradas.length, truncado };
    if (c.comparar && janela) {
      // Mesmo cálculo, mesmos filtros, no período de mesmo tamanho logo antes.
      const antes = janelaAnterior(janela);
      const anterior = await buscarLinhas(orgId, c, ctx, antes, defs);
      const valorAnterior = agregar(anterior.filtradas, c, defs);
      r.anterior = valorAnterior;
      r.janelaAnterior = antes;
      r.variacao = valor !== null && valorAnterior !== null && valorAnterior !== 0 ? (valor - valorAnterior) / Math.abs(valorAnterior) : null;
      r.truncado = truncado || anterior.truncado;
    }
    return r;
  }

  const def = c.agrupar.startsWith("cf:") ? defs.get(c.agrupar.slice(3)) : undefined;
  const faixas =
    def?.type === "number"
      ? faixasAutomaticas(filtradas.map((l) => valorNumerico(def, valorCf(l, def.key))).filter((v): v is number => v !== null))
      : null;
  const variosFunis = new Set(filtradas.map((l) => l.pipelineId)).size > 1;

  const grupos = new Map<string, { label: string; ordem: number; linhas: Linha[] }>();
  for (const l of filtradas) {
    for (const k of chavesDeGrupo(l, c, defs, faixas, variosFunis)) {
      const g = grupos.get(k.chave) ?? { label: k.label, ordem: k.ordem, linhas: [] };
      g.linhas.push(c.agrupar === "produto" ? linhaDoProduto(l, k.chave) : l);
      grupos.set(k.chave, g);
    }
  }

  if (agrupamentoTemporal(c.agrupar)) {
    let inicio = janela?.de;
    let fim = janela?.ate;
    if (!janela) {
      const dias = filtradas.map((l) => dataDeReferencia(l, c)).filter((d): d is Date => !!d).map(diaLocal).sort();
      inicio = dias[0];
      fim = dias[dias.length - 1];
    }
    const chaves = inicio && fim ? preencherBuracos(inicio, fim, c.agrupar) : [];
    return {
      tipo: "pontos",
      formato,
      negocios: filtradas.length,
      truncado,
      pontos: chaves.map((k) => ({ label: rotuloTemporal(k, c.agrupar), value: arredondar(agregar(grupos.get(k)?.linhas ?? [], c, defs), formato) })),
    };
  }

  const natural = ordemNatural(c, defs);
  const pontos = [...grupos.values()].map((g) => ({ label: g.label, value: arredondar(agregar(g.linhas, c, defs), formato), ordem: g.ordem }));
  pontos.sort((a, b) => (natural ? a.ordem - b.ordem : a.ordem !== b.ordem ? a.ordem - b.ordem : b.value - a.value));
  return { tipo: "pontos", formato, negocios: filtradas.length, truncado, pontos: pontos.slice(0, 30).map(({ label, value }) => ({ label, value })) };
}

/** Lista dos negócios que entram na consulta, para o cartão do tipo tabela. */
export async function listarNegociosDaConsulta(orgId: string, c: Consulta, ctx: ContextoDaConsulta = {}): Promise<ResultadoDeConsulta> {
  const defs = await carregarDefs(orgId);
  const { filtradas, truncado } = await buscarLinhas(orgId, c, ctx, janelaDaConsulta(c, ctx), defs);
  const ref = (l: Linha) => dataDeReferencia(l, c)?.getTime() ?? -Infinity;
  filtradas.sort((a, b) => ref(b) - ref(a));

  return {
    tipo: "tabela",
    negocios: filtradas.length,
    truncado,
    linhas: filtradas.slice(0, 15).map((l) => ({
      id: l.id,
      titulo: l.name,
      etapa: l.stage.name,
      responsavel: l.owner?.name ?? "—",
      valorCents: l.amountCents,
      quando: dataDeReferencia(l, c)?.toISOString() ?? null,
    })),
  };
}
