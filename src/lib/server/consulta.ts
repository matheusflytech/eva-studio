import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { serializarDefinicao } from "@/lib/server/custom-fields";
import {
  agrupamentoTemporal,
  formatoDaConsulta,
  type Consulta,
  type FiltroDeConsulta,
  type ResultadoDeConsulta,
} from "@/lib/consulta";
import { formatarValor, valorNumerico, type DefinicaoDeCampo } from "@/lib/custom-fields";

// ---------------------------------------------------------------------------
// Roda uma consulta montada pelo cliente.
//
// Segurança: nada da consulta vira SQL. O banco só recebe um `where` que este
// arquivo monta com colunas fixas (organização, funil, status, data). Campo
// personalizado, agrupamento e filtro por campo são resolvidos em memória
// sobre as linhas já filtradas. Por isso o limite de linhas: dashboard não é
// relatório de milhões de negócios, e é melhor avisar do corte do que travar.
// ---------------------------------------------------------------------------

const DIA = 24 * 60 * 60 * 1000;
const LIMITE_DE_LINHAS = 5000;
const FUSO = "America/Sao_Paulo";

type Linha = Prisma.DealGetPayload<{
  include: { stage: { select: { id: true; name: true; position: true; type: true } }; owner: { select: { id: true; name: true } } };
}>;

function diaLocal(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: FUSO });
}

function dataDeReferencia(l: Linha, c: Consulta): Date {
  return (c.status === "ganhos" || c.status === "perdidos") && l.closedAt ? l.closedAt : l.createdAt;
}

function valorCf(l: Linha, chave: string): unknown {
  return ((l.customFields ?? {}) as Record<string, unknown>)[chave];
}

function passaNoFiltro(l: Linha, f: FiltroDeConsulta, defs: Map<string, DefinicaoDeCampo>): boolean {
  const alvo = String(f.valor ?? "");

  let atual: unknown;
  let def: DefinicaoDeCampo | undefined;
  if (f.campo === "etapa") atual = l.stageId;
  else if (f.campo === "responsavel") atual = l.ownerId ?? "";
  else {
    const chave = f.campo.slice(3);
    def = defs.get(chave);
    // Filtro de um campo que foi apagado não derruba o cartão: ignora.
    if (!def) return true;
    atual = valorCf(l, chave);
  }

  const vazio = atual === undefined || atual === null || atual === "" || (Array.isArray(atual) && atual.length === 0);
  if (f.op === "vazio") return vazio;
  if (f.op === "preenchido") return !vazio;
  if (vazio) return f.op === "neq";

  if (f.op === "gt" || f.op === "lt") {
    const a = def ? (def.type === "date" ? Date.parse(String(atual)) : valorNumerico(def, atual)) : Number(atual);
    const b = def?.type === "date" ? Date.parse(alvo) : Number(alvo.replace(/\./g, "").replace(",", "."));
    if (a === null || Number.isNaN(a) || Number.isNaN(b)) return false;
    return f.op === "gt" ? a > b : a < b;
  }

  let igual: boolean;
  if (Array.isArray(atual)) igual = atual.map(String).includes(alvo);
  else if (typeof atual === "boolean") igual = String(atual) === alvo;
  else if (def && (def.type === "number" || def.type === "currency")) {
    const n = valorNumerico(def, atual);
    igual = n !== null && n === Number(alvo.replace(/\./g, "").replace(",", "."));
  } else igual = String(atual).toLowerCase() === alvo.toLowerCase();

  return f.op === "eq" ? igual : !igual;
}

function medidaDe(l: Linha, c: Consulta, defs: Map<string, DefinicaoDeCampo>): number | null {
  if (c.campo === "valor") return l.amountCents / 100;
  if (c.campo === "ponderado") return (l.amountCents * l.probability) / 100 / 100;
  const def = c.campo ? defs.get(c.campo.slice(3)) : undefined;
  return def ? valorNumerico(def, valorCf(l, def.key)) : null;
}

/** Em quais grupos a linha entra. Lista de várias opções entra em cada uma. */
function chavesDeGrupo(l: Linha, c: Consulta, defs: Map<string, DefinicaoDeCampo>): { chave: string; label: string; ordem: number }[] {
  const g = c.agrupar;
  if (g === "etapa") return [{ chave: l.stage.id, label: l.stage.name, ordem: l.stage.position }];
  if (g === "responsavel") return [{ chave: l.owner?.id ?? "", label: l.owner?.name ?? "Sem responsável", ordem: 0 }];

  if (agrupamentoTemporal(g)) {
    const dia = diaLocal(dataDeReferencia(l, c));
    const k = g === "mes" ? dia.slice(0, 7) : dia;
    return [{ chave: k, label: k, ordem: 0 }];
  }

  const def = defs.get(g.slice(3));
  if (!def) return [{ chave: "", label: "Campo removido", ordem: 0 }];
  const v = valorCf(l, def.key);
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
    return [{ chave: "", label: "Não informado", ordem: 9999 }];
  }
  if (def.type === "multiselect" && Array.isArray(v)) {
    return v.map((x) => ({ chave: String(x), label: def.options.find((o) => o.value === x)?.label ?? String(x), ordem: 0 }));
  }
  const label = formatarValor(def, v);
  return [{ chave: label, label, ordem: 0 }];
}

function rotuloTemporal(chave: string, g: string): string {
  const [a, m, d] = chave.split("-");
  return g === "mes" ? `${m}/${a}` : `${d}/${m}`;
}

/** Todos os dias ou meses entre o primeiro e o último, com zero onde não houve nada. */
function preencherBuracos(chaves: string[], g: string, janela?: { de: Date; ate: Date }): string[] {
  if (chaves.length === 0 && !janela) return [];
  const ordenadas = [...chaves].sort();
  const inicio = janela ? diaLocal(janela.de) : ordenadas[0] + (g === "mes" ? "-01" : "");
  const fim = janela ? diaLocal(janela.ate) : ordenadas[ordenadas.length - 1] + (g === "mes" ? "-01" : "");
  const saida: string[] = [];
  const cursor = new Date(`${inicio}T12:00:00Z`);
  const limite = new Date(`${fim}T12:00:00Z`);
  while (cursor <= limite && saida.length < 400) {
    const iso = cursor.toISOString().slice(0, 10);
    const k = g === "mes" ? iso.slice(0, 7) : iso;
    if (saida[saida.length - 1] !== k) saida.push(k);
    if (g === "mes") cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return saida;
}

async function prepararBase(orgId: string, c: Consulta, dias: number) {
  // Todos os campos de negócio da organização, inclusive os de um funil só:
  // o cartão pode agrupar por qualquer um.
  const linhasDeCampo = await prisma.customField.findMany({ where: { orgId, entity: "deal" } });
  const defs = new Map<string, DefinicaoDeCampo>(linhasDeCampo.map((d) => [d.key, serializarDefinicao(d)]));

  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setTime(desde.getTime() - (dias - 1) * DIA);

  const usaFechamento = c.status === "ganhos" || c.status === "perdidos";
  const where: Prisma.DealWhereInput = {
    orgId,
    archivedAt: null,
    ...(c.funilId ? { pipelineId: c.funilId } : {}),
    ...(c.status === "abertos" ? { closedAt: null } : {}),
    ...(c.status === "ganhos" ? { stage: { type: "won" } } : {}),
    ...(c.status === "perdidos" ? { stage: { type: "lost" } } : {}),
    ...(c.periodo === "painel" ? (usaFechamento ? { closedAt: { gte: desde } } : { createdAt: { gte: desde } }) : {}),
  };

  const linhas = (await prisma.deal.findMany({
    where,
    include: {
      stage: { select: { id: true, name: true, position: true, type: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIMITE_DE_LINHAS,
  })) as Linha[];

  const filtradas = linhas.filter((l) => c.filtros.every((f) => passaNoFiltro(l, f, defs)));
  return { defs, desde, filtradas };
}

export async function rodarConsulta(orgId: string, c: Consulta, dias: number): Promise<ResultadoDeConsulta> {
  const { defs, desde, filtradas } = await prepararBase(orgId, c, dias);

  const formato = formatoDaConsulta(c, [...defs.values()]);

  const agregar = (grupo: Linha[]): number | null => {
    if (c.medida === "contagem") return grupo.length;
    const valores = grupo.map((l) => medidaDe(l, c, defs)).filter((v): v is number => v !== null);
    if (valores.length === 0) return c.medida === "soma" ? 0 : null;
    const soma = valores.reduce((s, v) => s + v, 0);
    return c.medida === "soma" ? soma : soma / valores.length;
  };

  if (!c.agrupar) {
    // Sem agrupar: um número, ou (se o cartão for tabela) a lista.
    return { tipo: "numero", valor: agregar(filtradas), formato, negocios: filtradas.length };
  }

  const grupos = new Map<string, { label: string; ordem: number; linhas: Linha[] }>();
  for (const l of filtradas) {
    for (const k of chavesDeGrupo(l, c, defs)) {
      const g = grupos.get(k.chave) ?? { label: k.label, ordem: k.ordem, linhas: [] };
      g.linhas.push(l);
      grupos.set(k.chave, g);
    }
  }

  const arredonda = (v: number | null) => (v === null ? 0 : formato === "inteiro" ? v : Math.round(v * 100) / 100);

  if (agrupamentoTemporal(c.agrupar)) {
    const janela = c.periodo === "painel" ? { de: desde, ate: new Date() } : undefined;
    const chaves = preencherBuracos([...grupos.keys()], c.agrupar, janela);
    return {
      tipo: "pontos",
      formato,
      negocios: filtradas.length,
      pontos: chaves.map((k) => ({ label: rotuloTemporal(k, c.agrupar), value: arredonda(agregar(grupos.get(k)?.linhas ?? [])) })),
    };
  }

  const pontos = [...grupos.values()].map((g) => ({ label: g.label, value: arredonda(agregar(g.linhas)), ordem: g.ordem }));
  pontos.sort((a, b) => (c.agrupar === "etapa" ? a.ordem - b.ordem : a.ordem !== b.ordem ? a.ordem - b.ordem : b.value - a.value));
  return { tipo: "pontos", formato, negocios: filtradas.length, pontos: pontos.slice(0, 30).map(({ label, value }) => ({ label, value })) };
}

/** Lista dos negócios que entram na consulta, para o cartão do tipo tabela. */
export async function listarNegociosDaConsulta(orgId: string, c: Consulta, dias: number): Promise<ResultadoDeConsulta> {
  const { filtradas } = await prepararBase(orgId, c, dias);
  filtradas.sort((a, b) => dataDeReferencia(b, c).getTime() - dataDeReferencia(a, c).getTime());

  return {
    tipo: "tabela",
    negocios: filtradas.length,
    linhas: filtradas.slice(0, 15).map((l) => ({
      id: l.id,
      titulo: l.name,
      etapa: l.stage.name,
      responsavel: l.owner?.name ?? "—",
      valorCents: l.amountCents,
      quando: dataDeReferencia(l, c).toISOString(),
    })),
  };
}
