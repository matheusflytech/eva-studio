import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
import type { SessionContext } from "@/lib/server/permissions";
import { serializarDefinicao } from "@/lib/server/custom-fields";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import {
  LIMITE_DE_LINHAS,
  avaliarValor,
  valorDoCampoPersonalizado,
  whereDaCondicao,
  whereDeData,
  whereDeLista,
  whereDeTexto,
} from "@/lib/server/consulta";
import {
  SEM_VALOR,
  campoDeFiltro,
  diaLocal,
  inicioDoDia,
  normalizarCondicao,
  operadoresDoCampo,
  somarDias,
  type CampoDeFiltro,
  type FiltroDeConsulta,
  type Logica,
} from "@/lib/consulta";
import { dataExiste, parseNumero, type DefinicaoDeCampo } from "@/lib/custom-fields";
import { campoCrm, sanearFiltroCrm, type EntidadeCrm, type FiltroCrm, type Ordenacao } from "@/lib/filtro-crm";

// ---------------------------------------------------------------------------
// Motor de filtro das listas do CRM (contatos e negócios).
//
// Entra o filtro da tela (grupos E/OU no formato do dashboard), sai um `where`
// do Prisma SEMPRE preso ao contrato ({ orgId }) e ao escopo de dados do papel
// ("só os meus / equipe / todos"): o filtro do usuário é somado (E) a isso,
// nunca o substitui.
//
// Quase tudo vira `where` EXATO no banco, então contagem, somas e página saem
// de lá e batem entre si. O que o banco não sabe avaliar — campo personalizado
// com operador de número ou data (valor dentro do JSON) — é avaliado em
// memória sobre um conjunto já reduzido pelo resto do filtro, com o mesmo
// corte do dashboard (LIMITE_DE_LINHAS); passou disso, a resposta vem com
// `truncado`. Campo ou operador desconhecido é descartado com aviso.
//
// Nada do filtro vira SQL: só objetos `where` montados aqui, com colunas fixas.
// ---------------------------------------------------------------------------

type Ctx = Pick<SessionContext, "userId" | "orgId" | "escopo">;
type W = Record<string, unknown>;

const NADA: W = { id: { in: [] } };
const DIA_MS = 24 * 60 * 60 * 1000;

/** Uma condição traduzida: `where` exato, ou avaliação em memória sobre customFields. */
type Cond =
  | { tipo: "banco"; where: W }
  | { tipo: "memoria"; avaliar: (customFields: Record<string, unknown>) => boolean };

interface Grupo {
  logica: Logica;
  conds: Cond[];
}

interface Arvore {
  logica: Logica;
  grupos: Grupo[];
}

export interface WhereCrm<T> {
  /**
   * Sempre { orgId, AND: [escopo, ..., filtro] }. Exato quando `emMemoria` é
   * false; senão é a pré-seleção (pode trazer a mais) e o conjunto final sai
   * de `resolverConjunto`.
   */
  where: T;
  emMemoria: boolean;
  avisos: string[];
  entidade: EntidadeCrm;
  orgId: string;
  /** Árvore traduzida (uso interno de resolverConjunto). */
  arvore: Arvore;
}

export interface OpcoesDoWhere {
  agora?: Date;
  /** Condições extras somadas (E) ao filtro: atalhos da URL (?tag=, ?company=), funil do quadro. */
  extras?: FiltroDeConsulta[];
  /** Negócios: inclui arquivados (padrão: não). */
  incluirArquivados?: boolean;
}

const vazio = (w: W | null | undefined): boolean => !w || Object.keys(w).length === 0;

function combinar(logica: Logica, partes: (W | null)[]): W | null {
  if (partes.length === 0) return null;
  if (logica === "ou") {
    // null = "verdadeiro": um OU com uma parte sempre verdadeira não restringe.
    if (partes.some((p) => vazio(p))) return null;
    return partes.length === 1 ? partes[0] : { OR: partes };
  }
  const fixas = partes.filter((p): p is W => !vazio(p));
  if (fixas.length === 0) return null;
  return fixas.length === 1 ? fixas[0] : { AND: fixas };
}

/** `where` da árvore; condição em memória vira "verdadeiro" (pré-seleção que só alarga). */
function whereDaArvore(a: Arvore): W | null {
  const grupos = a.grupos.map((g) => combinar(g.logica, g.conds.map((c) => (c.tipo === "banco" ? c.where : null))));
  return combinar(a.logica, grupos);
}

const temMemoria = (a: Arvore) => a.grupos.some((g) => g.conds.some((c) => c.tipo === "memoria"));

// ── Peças de where comuns ──────────────────────────────────────────────────

/** Número exato numa coluna inteira (centavos, %). `escala` converte o valor digitado. */
export function whereDeNumeroExato(coluna: string, f: FiltroDeConsulta, escala: number): W | null {
  const paraColuna = (t: string | undefined) => {
    const n = parseNumero(String(t ?? "").trim());
    // Arredonda o ruído do ponto flutuante (10,1 × 100 = 1010,0000000000001).
    return Number.isFinite(n) ? Math.round(n * escala * 1e6) / 1e6 : NaN;
  };
  const x = paraColuna(f.valor);
  if (!Number.isFinite(x)) return null;
  const inteiro = Number.isInteger(x);
  switch (f.op) {
    case "eq": return inteiro ? { [coluna]: x } : NADA;
    case "neq": return inteiro ? { NOT: { [coluna]: x } } : null;
    case "gt": return { [coluna]: { gte: Math.floor(x) + 1 } };
    case "gte": return { [coluna]: { gte: Math.ceil(x) } };
    case "lt": return { [coluna]: { lte: Math.ceil(x) - 1 } };
    case "lte": return { [coluna]: { lte: Math.floor(x) } };
    case "entre": {
      const y = paraColuna(f.ate);
      if (!Number.isFinite(y)) return null;
      return { [coluna]: { gte: Math.ceil(Math.min(x, y)), lte: Math.floor(Math.max(x, y)) } };
    }
  }
  return null;
}

/**
 * "Dias na etapa" relativo a agora, exato no banco: dias = floor((agora −
 * stageSince) / 1 dia), então "dias ≥ k" ⇔ stageSince ≤ agora − k dias e
 * "dias ≤ k" ⇔ stageSince > agora − (k+1) dias.
 */
export function whereDeDiasNaEtapa(f: FiltroDeConsulta, agora: Date): W | null {
  const x = parseNumero(String(f.valor ?? "").trim());
  if (!Number.isFinite(x)) return null;
  const t = agora.getTime();
  const noMinimo = (k: number): W | null => (k <= 0 ? null : { stageSince: { lte: new Date(t - k * DIA_MS) } });
  const noMaximo = (k: number): W => (k < 0 ? NADA : { stageSince: { gt: new Date(t - (k + 1) * DIA_MS) } });
  const e = (...p: (W | null)[]): W | null => combinar("e", p);
  switch (f.op) {
    case "eq": return Number.isInteger(x) ? e(noMinimo(x), noMaximo(x)) ?? {} : NADA;
    case "neq": return Number.isInteger(x) && x >= 0 ? { OR: [noMaximo(x - 1), noMinimo(x + 1)].filter((p): p is W => !!p) } : null;
    case "gt": return noMinimo(Math.floor(x) + 1);
    case "gte": return noMinimo(Math.ceil(x));
    case "lt": return noMaximo(Math.ceil(x) - 1);
    case "lte": return noMaximo(Math.floor(x));
    case "entre": {
      const y = parseNumero(String(f.ate ?? "").trim());
      if (!Number.isFinite(y)) return null;
      return e(noMinimo(Math.ceil(Math.min(x, y))), noMaximo(Math.floor(Math.max(x, y))));
    }
  }
  return null;
}

/** Equipe do responsável (só equipes deste contrato). `rel` = a relação do dono no modelo. */
function whereDeEquipe(orgId: string, op: string, valores: string[]): W | null {
  const ids = valores.filter((v) => v !== SEM_VALOR);
  const comSem = valores.includes(SEM_VALOR);
  const emAlguma = (teamId?: { in: string[] }): W => ({
    owner: { is: { teamMemberships: { some: { team: { orgId }, ...(teamId ? { teamId } : {}) } } } },
  });
  const semEquipe: W = { OR: [{ ownerId: null }, { NOT: emAlguma() }] };
  if (op === "preenchido") return emAlguma();
  if (op === "vazio") return semEquipe;
  const partes: W[] = [];
  if (ids.length) partes.push(emAlguma({ in: ids }));
  if (comSem) partes.push(semEquipe);
  const qualquer = partes.length === 0 ? NADA : partes.length === 1 ? partes[0] : { OR: partes };
  if (op === "qualquer") return qualquer;
  if (op === "nenhum") return partes.length ? { NOT: qualquer } : null;
  return null;
}

/** Relação "tem algum / nenhum" (etiquetas, canais, contatos, produtos). */
function whereDeRelacao(rel: string, coluna: string, op: string, valores: string[]): W | null {
  const ids = valores.filter((v) => v !== SEM_VALOR);
  const comSem = valores.includes(SEM_VALOR);
  switch (op) {
    case "qualquer": {
      const partes: W[] = [];
      if (ids.length) partes.push({ [rel]: { some: { [coluna]: { in: ids } } } });
      if (comSem) partes.push({ [rel]: { none: {} } });
      return partes.length === 0 ? NADA : partes.length === 1 ? partes[0] : { OR: partes };
    }
    case "todos":
      return ids.length ? { AND: ids.map((id) => ({ [rel]: { some: { [coluna]: id } } })) } : NADA;
    case "nenhum": {
      const partes: W[] = [];
      if (ids.length) partes.push({ [rel]: { none: { [coluna]: { in: ids } } } });
      if (comSem) partes.push({ [rel]: { some: {} } });
      return combinar("e", partes);
    }
    case "preenchido": return { [rel]: { some: {} } };
    case "vazio": return { [rel]: { none: {} } };
  }
  return null;
}

/**
 * Tarefas em aberto do negócio, no fuso de São Paulo. Mesma regra do Início:
 * "atrasada" = prazo já passou; "hoje" = vence de agora até o fim do dia (SP).
 */
export function whereDeTarefa(op: string, valores: string[], agora: Date): W | null {
  const amanha = inicioDoDia(somarDias(diaLocal(agora), 1));
  const porValor: Record<string, W> = {
    atrasada: { tasks: { some: { doneAt: null, dueAt: { lt: agora } } } },
    hoje: { tasks: { some: { doneAt: null, dueAt: { gte: agora, lt: amanha } } } },
    comTarefa: { tasks: { some: { doneAt: null } } },
    semTarefa: { tasks: { none: { doneAt: null } } },
  };
  const partes = valores.map((v) => porValor[v]).filter((p): p is W => !!p);
  const qualquer = partes.length === 0 ? NADA : partes.length === 1 ? partes[0] : { OR: partes };
  if (op === "qualquer") return qualquer;
  if (op === "nenhum") return partes.length ? { NOT: qualquer } : null;
  return null;
}

// ── Campos personalizados (JSON) ───────────────────────────────────────────

/** Chave ausente ou null JSON (o Prisma 7 gera `#>path = 'null' OR IS NULL`). */
const ausente = (k: string): W => ({ customFields: { path: [k], equals: Prisma.AnyNull } });

function vazioNoJson(k: string): W {
  return { OR: [ausente(k), { customFields: { path: [k], equals: "" } }, { customFields: { path: [k], equals: [] } }] };
}

/** NOT sobre uma chave ausente dá NULL (fora); "não é" precisa somar os sem valor. */
const naoOuAusente = (k: string, w: W): W => ({ OR: [{ NOT: w }, ausente(k)] });

/** Campo personalizado de texto, lista, várias opções ou sim/não: dá no banco. */
function whereDoCampoPersonalizado(campo: CampoDeFiltro, f: FiltroDeConsulta): W | null {
  const k = campo.def!.key;
  const v = String(f.valor ?? "").trim();
  const valores = (f.valores ?? []).filter((x) => x !== SEM_VALOR);
  if (f.op === "preenchido") return { NOT: vazioNoJson(k) };
  if (f.op === "vazio") return vazioNoJson(k);
  switch (campo.tipo) {
    case "sim_nao": {
      const sim: W = { OR: [{ customFields: { path: [k], equals: true } }, { customFields: { path: [k], equals: "true" } }] };
      return f.valor === "true" ? sim : naoOuAusente(k, sim);
    }
    case "lista": {
      const algum: W = valores.length ? { OR: valores.map((x) => ({ customFields: { path: [k], equals: x } })) } : NADA;
      if (f.op === "qualquer") return algum;
      if (f.op === "nenhum") return valores.length ? naoOuAusente(k, algum) : null;
      return null;
    }
    case "multi": {
      const algum: W = valores.length ? { OR: valores.map((x) => ({ customFields: { path: [k], array_contains: [x] } })) } : NADA;
      if (f.op === "qualquer") return algum;
      if (f.op === "todos") return valores.length ? { customFields: { path: [k], array_contains: valores } } : NADA;
      if (f.op === "nenhum") return valores.length ? naoOuAusente(k, algum) : null;
      return null;
    }
    case "texto": {
      // "é"/"não é" comparam o texto gravado como está (o JSON não tem
      // comparação sem maiúsculas no Prisma); "contém" ignora maiúsculas.
      const igual: W = { customFields: { path: [k], equals: v } };
      const contem: W = { customFields: { path: [k], string_contains: v, mode: "insensitive" } };
      if (f.op === "eq") return igual;
      if (f.op === "neq") return naoOuAusente(k, igual);
      if (f.op === "contem") return contem;
      if (f.op === "naoContem") return naoOuAusente(k, contem);
      return null;
    }
  }
  return null;
}

type Defs = Map<string, DefinicaoDeCampo>;

/** Campo personalizado → condição (banco ou memória), ou o motivo do descarte. */
function traduzirCampoPersonalizado(bruta: FiltroDeConsulta, defs: Defs, agora: Date): Cond | string {
  const campo = campoDeFiltro(bruta.campo, defs);
  if (!campo?.def) return `Condição “${bruta.campo}” ignorada: campo personalizado não existe.`;
  const f = normalizarCondicao(bruta, campo.tipo);
  if (!operadoresDoCampo(campo).some((o) => o.id === f.op)) return `Condição “${campo.rotulo}” ignorada: operador não cabe no campo.`;
  const semValor = f.op === "preenchido" || f.op === "vazio";
  if (!semValor && campo.tipo === "numero") {
    const ok = Number.isFinite(parseNumero(f.valor ?? "")) && (f.op !== "entre" || Number.isFinite(parseNumero(f.ate ?? "")));
    if (!ok) return `Condição “${campo.rotulo}” ignorada: valor ausente ou inválido.`;
  }
  if (!semValor && campo.tipo === "data" && f.op !== "ultimos" && f.op !== "proximos") {
    const ok = dataExiste(f.valor ?? "") && (f.op !== "entre" || dataExiste(f.ate ?? ""));
    if (!ok) return `Condição “${campo.rotulo}” ignorada: valor ausente ou inválido.`;
  }
  if (campo.tipo === "numero" || campo.tipo === "data") {
    const chave = campo.def.key;
    return {
      tipo: "memoria",
      avaliar: (cf) => avaliarValor(valorDoCampoPersonalizado(campo, cf[chave]), campo, f, agora),
    };
  }
  const w = whereDoCampoPersonalizado(campo, f);
  return { tipo: "banco", where: w ?? {} };
}

// ── Tradução por entidade ──────────────────────────────────────────────────

interface Contexto {
  orgId: string;
  agora: Date;
  defs: Defs;
  /** Segmento id → where (só os deste contrato). */
  segmentos: Map<string, W>;
}

function whereDeSegmento(op: string, valores: string[], segmentos: Map<string, W>): W | null {
  const achados = valores.map((v) => segmentos.get(v)).filter((w): w is W => !!w);
  const algum = achados.length === 0 ? NADA : achados.length === 1 ? achados[0] : { OR: achados };
  if (op === "qualquer") return algum;
  if (op === "nenhum") return achados.length ? { NOT: algum } : null;
  return null;
}

function whereDeContatoBase(f: FiltroDeConsulta, c: Contexto): W | null {
  const valores = f.valores ?? [];
  switch (f.campo) {
    case "nome": return whereDeTexto<W>("name", f);
    case "email": return whereDeTexto<W>("email", f);
    case "telefone": return whereDeTexto<W>("phone", f);
    case "responsavel": return whereDeLista<W>("ownerId", f.op, valores, true);
    case "empresa": return whereDeLista<W>("companyId", f.op, valores, true);
    case "equipe": return whereDeEquipe(c.orgId, f.op, valores);
    case "etiqueta": return whereDeRelacao("tags", "tagId", f.op, valores);
    case "canal": return whereDeRelacao("channels", "channel", f.op, valores);
    case "segmento": return whereDeSegmento(f.op, valores, c.segmentos);
    case "optIn": return { optIn: f.valor === "true" };
    case "criadoEm": return whereDeData<W>("createdAt", f, c.agora, false);
    case "ultimaAtividade": return whereDeData<W>("lastSeenAt", f, c.agora, false);
  }
  return null;
}

function whereDeNegocioBase(f: FiltroDeConsulta, c: Contexto): W | null {
  const valores = f.valores ?? [];
  switch (f.campo) {
    case "valor": return whereDeNumeroExato("amountCents", f, 100);
    case "probabilidade": return whereDeNumeroExato("probability", f, 1);
    case "diasNaEtapa": return whereDeDiasNaEtapa(f, c.agora);
    case "equipe": return whereDeEquipe(c.orgId, f.op, valores);
    case "contato": return whereDeRelacao("contacts", "contactId", f.op, valores);
    case "produto": return whereDeRelacao("items", "productId", f.op, valores);
    case "tarefa": return whereDeTarefa(f.op, valores, c.agora);
  }
  // Os do dashboard (funil, etapa, situação, responsável, empresa, etiqueta,
  // canal, datas, motivo de perda, nome): a tradução de lá já é exata.
  return whereDaCondicao(f, c.agora) as W | null;
}

function traduzir(entidade: EntidadeCrm, bruta: FiltroDeConsulta, c: Contexto): Cond | string {
  if (bruta.campo.startsWith("cf:")) return traduzirCampoPersonalizado(bruta, c.defs, c.agora);
  const campo = campoCrm(entidade, bruta.campo);
  if (!campo) return `Condição “${bruta.campo}” ignorada: campo desconhecido.`;
  const f = normalizarCondicao(bruta, campo.tipo);
  const w = entidade === "contatos" ? whereDeContatoBase(f, c) : whereDeNegocioBase(f, c);
  // null = sem restrição (ex.: "não é nenhum de" sem itens).
  return { tipo: "banco", where: w ?? {} };
}

// ── Busca de texto ─────────────────────────────────────────────────────────

/** Busca da lista de contatos: nome, e-mail, telefone e id do canal (também só os dígitos). */
export function whereDeBuscaDeContato(q: string): Prisma.ContactWhereInput {
  // "(11) 99999-8888" também acha quem está gravado como 5511999998888.
  const digitos = q.replace(/\D/g, "");
  const porDigitos: Prisma.ContactWhereInput[] =
    digitos.length >= 4 && digitos !== q
      ? [{ phone: { contains: digitos } }, { channels: { some: { externalId: { contains: digitos } } } }]
      : [];
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { channels: { some: { externalId: { contains: q, mode: "insensitive" } } } },
      ...porDigitos,
    ],
  };
}

/** Busca da lista de negócios: nome do negócio, da empresa e dos contatos. */
export function whereDeBuscaDeNegocio(q: string): Prisma.DealWhereInput {
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { company: { is: { name: { contains: q, mode: "insensitive" } } } },
      {
        contacts: {
          some: {
            contact: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            },
          },
        },
      },
    ],
  };
}

// ── Montagem ───────────────────────────────────────────────────────────────

const usaCampo = (conds: FiltroDeConsulta[], pred: (c: string) => boolean) => conds.some((f) => pred(f.campo));

async function montar(
  ctx: Ctx,
  entidade: EntidadeCrm,
  filtroBruto: unknown,
  opcoes: OpcoesDoWhere
): Promise<WhereCrm<W>> {
  const agora = opcoes.agora ?? new Date();
  const { filtro, avisos } = sanearFiltroCrm(filtroBruto, entidade);
  // Atalhos da rota + filtros rápidos da barra: tudo em E, no banco.
  const extras = [...(opcoes.extras ?? []), ...(filtro.rapidos ?? [])];
  const todas = [...filtro.grupos.flatMap((g) => g.condicoes), ...extras];

  // Só consulta definições e segmentos quando o filtro usa.
  const defs: Defs = new Map();
  if (usaCampo(todas, (c) => c.startsWith("cf:"))) {
    const linhas = await prisma.customField.findMany({
      where: { orgId: ctx.orgId, entity: entidade === "contatos" ? "contact" : "deal" },
    });
    for (const d of linhas) defs.set(d.key, serializarDefinicao(d));
  }
  const segmentos = new Map<string, W>();
  if (entidade === "contatos" && usaCampo(todas, (c) => c === "segmento")) {
    const ids = [...new Set(todas.filter((f) => f.campo === "segmento").flatMap((f) => f.valores ?? []))];
    const linhas = await prisma.segment.findMany({ where: { orgId: ctx.orgId, id: { in: ids } } });
    for (const s of linhas) segmentos.set(s.id, buildSegmentWhere(ctx.orgId, s.match, parseRules(s.rules)) as W);
  }
  const c: Contexto = { orgId: ctx.orgId, agora, defs, segmentos };

  const traduzirOuAvisar = (f: FiltroDeConsulta): Cond | null => {
    const r = traduzir(entidade, f, c);
    if (typeof r === "string") {
      avisos.push(r);
      return null;
    }
    return r;
  };

  const arvore: Arvore = {
    logica: filtro.logica,
    grupos: filtro.grupos
      .map((g) => ({ logica: g.logica, conds: g.condicoes.map(traduzirOuAvisar).filter((x): x is Cond => !!x) }))
      .filter((g) => g.conds.length > 0),
  };

  // Base: escopo do papel, arquivados, atalhos e busca — tudo E, no banco.
  const base: W[] = [];
  const escopo = await filtroDeEscopo(ctx, entidade);
  if (!vazio(escopo)) base.push(escopo);
  if (entidade === "negocios" && !opcoes.incluirArquivados) base.push({ archivedAt: null });
  for (const f of extras) {
    const r = traduzirOuAvisar(f);
    if (r?.tipo === "banco" && !vazio(r.where)) base.push(r.where);
  }
  if (filtro.busca) base.push((entidade === "contatos" ? whereDeBuscaDeContato(filtro.busca) : whereDeBuscaDeNegocio(filtro.busca)) as W);
  const wf = whereDaArvore(arvore);
  if (wf) base.push(wf);

  return {
    where: { orgId: ctx.orgId, ...(base.length ? { AND: base } : {}) },
    emMemoria: temMemoria(arvore),
    avisos,
    entidade,
    orgId: ctx.orgId,
    arvore,
  };
}

/** Filtro de contatos → where (contrato + escopo + filtro). */
export async function whereDeContatos(ctx: Ctx, filtro: unknown, opcoes: OpcoesDoWhere = {}): Promise<WhereCrm<Prisma.ContactWhereInput>> {
  return (await montar(ctx, "contatos", filtro, opcoes)) as WhereCrm<Prisma.ContactWhereInput>;
}

/** Filtro de negócios → where (contrato + escopo + não arquivados + filtro). */
export async function whereDeNegocios(ctx: Ctx, filtro: unknown, opcoes: OpcoesDoWhere = {}): Promise<WhereCrm<Prisma.DealWhereInput>> {
  return (await montar(ctx, "negocios", filtro, opcoes)) as WhereCrm<Prisma.DealWhereInput>;
}

// ── Conjunto final (com a parte em memória) ────────────────────────────────

interface Delegado {
  findMany(args: unknown): Promise<{ id: string; customFields?: unknown }[]>;
  count(args: unknown): Promise<number>;
}

function delegado(entidade: EntidadeCrm): Delegado {
  return (entidade === "contatos" ? prisma.contact : prisma.deal) as unknown as Delegado;
}

export interface ConjuntoResolvido<T> {
  /** Where final, exato. */
  where: T;
  /** Ids que passaram (só quando houve avaliação em memória). */
  ids: string[] | null;
  /** A pré-seleção passou do limite: o conjunto pode estar incompleto. */
  truncado: boolean;
}

/**
 * Sem condição em memória, o where já é exato. Com, lê até `limite` linhas da
 * pré-seleção (na ordem pedida, para o corte ficar com as primeiras), avalia a
 * árvore inteira e devolve { orgId, id in [...] }. Condição do banco que não
 * está garantida pela pré-seleção (dentro de um OU) é conferida com uma
 * consulta de ids sobre as mesmas linhas — a resposta continua exata.
 */
export async function resolverConjunto<T>(
  w: WhereCrm<T>,
  opcoes: { orderBy?: unknown; limite?: number } = {}
): Promise<ConjuntoResolvido<T>> {
  if (!w.emMemoria) return { where: w.where, ids: null, truncado: false };
  const limite = opcoes.limite ?? LIMITE_DE_LINHAS;
  const d = delegado(w.entidade);
  const linhas = await d.findMany({
    where: w.where,
    select: { id: true, customFields: true },
    orderBy: opcoes.orderBy ?? { id: "asc" },
    take: limite + 1,
  });
  const truncado = linhas.length > limite;
  const candidatas = truncado ? linhas.slice(0, limite) : linhas;
  const ids = candidatas.map((l) => l.id);

  const { arvore } = w;
  const garantido = (g: Grupo) => (arvore.logica === "e" || arvore.grupos.length === 1) && (g.logica === "e" || g.conds.length === 1);
  const verdades = new Map<Cond, Set<string>>();
  if (ids.length) {
    const pendentes = arvore.grupos.filter((g) => !garantido(g)).flatMap((g) => g.conds.filter((c) => c.tipo === "banco" && !vazio(c.where)));
    await Promise.all(
      pendentes.map(async (cond) => {
        const where = { AND: [{ orgId: w.orgId }, (cond as { where: W }).where, { id: { in: ids } }] };
        const r = await d.findMany({ where, select: { id: true } });
        verdades.set(cond, new Set(r.map((x) => x.id)));
      })
    );
  }

  const passa = (l: { id: string; customFields?: unknown }) => {
    const cf = (l.customFields ?? {}) as Record<string, unknown>;
    const ok = (c: Cond) => (c.tipo === "memoria" ? c.avaliar(cf) : verdades.get(c)?.has(l.id) ?? true);
    const doGrupo = (g: Grupo) => (g.logica === "ou" ? g.conds.some(ok) : g.conds.every(ok));
    return arvore.logica === "ou" ? arvore.grupos.some(doGrupo) : arvore.grupos.every(doGrupo);
  };
  const aprovados = candidatas.filter(passa).map((l) => l.id);
  return { where: { orgId: w.orgId, id: { in: aprovados } } as T, ids: aprovados, truncado };
}

/**
 * Ids que batem com o filtro, dentro do contrato e do escopo — para as ações
 * em lote (Fase L5). Nunca devolve mais que `limite`; `truncado` avisa o corte.
 */
export async function idsDoFiltro(
  ctx: Ctx,
  entidade: EntidadeCrm,
  filtro: unknown,
  limite = LIMITE_DE_LINHAS,
  opcoes: OpcoesDoWhere = {}
): Promise<{ ids: string[]; truncado: boolean; avisos: string[] }> {
  const w = await montar(ctx, entidade, filtro, opcoes);
  const r = await resolverConjunto(w, { limite });
  if (r.ids) return { ids: r.ids, truncado: r.truncado, avisos: w.avisos };
  const linhas = await delegado(entidade).findMany({ where: w.where, select: { id: true }, orderBy: { id: "asc" }, take: limite + 1 });
  return { ids: linhas.slice(0, limite).map((l) => l.id), truncado: linhas.length > limite, avisos: w.avisos };
}

// ── Ordenação ──────────────────────────────────────────────────────────────

/** orderBy do Prisma para a ordenação (já validada por lerOrdenacao), com desempate por id. */
export function orderByDe(entidade: EntidadeCrm, o: Ordenacao): Record<string, unknown>[] {
  const d = o.direcao;
  const comNulos = { sort: d, nulls: "last" as const };
  const mapa: Record<string, Record<string, unknown>> =
    entidade === "contatos"
      ? {
          nome: { name: d },
          email: { email: d },
          telefone: { phone: d },
          empresa: { company: { name: d } },
          responsavel: { owner: { name: d } },
          criadoEm: { createdAt: d },
          ultimaAtividade: { lastSeenAt: d },
        }
      : {
          nome: { name: d },
          valor: { amountCents: d },
          etapa: { stage: { position: d } },
          responsavel: { owner: { name: d } },
          criadoEm: { createdAt: d },
          previsao: { expectedClosingAt: comNulos },
          fechadoEm: { closedAt: comNulos },
          // Mais dias na etapa = entrou ANTES: a direção inverte na coluna.
          diasNaEtapa: { stageSince: d === "desc" ? "asc" : "desc" },
        };
  return [mapa[o.campo], { id: "asc" }].filter(Boolean) as Record<string, unknown>[];
}

export type { FiltroCrm };
