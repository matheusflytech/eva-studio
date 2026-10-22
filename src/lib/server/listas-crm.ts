import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { FiltroDeConsulta } from "@/lib/consulta";
import { lerOrdenacao, lerPagina, lerTamanhoDePagina } from "@/lib/filtro-crm";
import { orderByDe, resolverConjunto, whereDeContatos, whereDeNegocios } from "@/lib/server/filtro-crm";
import { serializeContact } from "@/lib/server/contact-dto";
import { INCLUDE_CARTAO, serializarCartao } from "@/lib/server/quadro-negocios";
import { lerRegras } from "@/lib/server/regras-de-etapa";
import { ultimaAtividadePorNegocio } from "@/lib/server/atividade-do-negocio";
import type { SessionContext } from "@/lib/server/permissions";

// ---------------------------------------------------------------------------
// Listas paginadas de contatos e negócios (Fase L1): filtro + escopo pelo
// motor de src/lib/server/filtro-crm.ts, ordenação só por colunas
// permitidas, página numerada com total. A contagem e a página usam o MESMO
// where, então a soma das páginas é o total.
// ---------------------------------------------------------------------------

type Ctx = Pick<SessionContext, "userId" | "orgId" | "escopo">;

export interface EntradaDaLista {
  filtro?: unknown;
  /** "campo", "campo:asc", "-campo" ou { campo, direcao }. */
  sort?: unknown;
  dir?: unknown;
  page?: unknown;
  /** 25/50/100; inválido = 25. */
  pageSize?: unknown;
  /** Sem pageSize nenhum: este tamanho (o GET de contatos mantém os 50 de sempre). */
  tamanhoSemPedido?: number;
  /** Atalhos somados (E) ao filtro. */
  extras?: FiltroDeConsulta[];
  incluirArquivados?: boolean;
  /** Só a contagem (as abas de visão): não busca as linhas. */
  apenasTotal?: boolean;
}

function lerPaginacao(e: EntradaDaLista) {
  const semPedido = e.pageSize === undefined || e.pageSize === null || e.pageSize === "";
  const pageSize = semPedido && e.tamanhoSemPedido ? e.tamanhoSemPedido : lerTamanhoDePagina(e.pageSize);
  const page = lerPagina(e.page);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

const INCLUDE_CONTATO = {
  tags: { include: { tag: true } },
  channels: true,
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.ContactInclude;

/** Junta a busca da caixa (?q=) ao filtro (objeto ou JSON em texto). */
export function comBusca(filtro: unknown, q: string): unknown {
  if (!q) return filtro ?? "";
  let f = filtro;
  if (typeof f === "string") {
    if (!f.trim()) f = {};
    else {
      try {
        f = JSON.parse(f);
      } catch {
        return f; // o saneamento avisa que o JSON é inválido
      }
    }
  }
  if (Array.isArray(f)) f = { logica: "e", grupos: [{ logica: "e", condicoes: f }] };
  if (!f || typeof f !== "object") f = {};
  return { ...(f as Record<string, unknown>), busca: q };
}

/** Atalhos antigos da URL de contatos (?tag, ?segment, ?company) como condições E. */
export function atalhosDeContato(a: { tag?: string; segment?: string; company?: string }): FiltroDeConsulta[] {
  const extras: FiltroDeConsulta[] = [];
  if (a.tag) extras.push({ campo: "etiqueta", op: "qualquer", valores: [a.tag] });
  if (a.segment) extras.push({ campo: "segmento", op: "qualquer", valores: [a.segment] });
  if (a.company) extras.push({ campo: "empresa", op: "qualquer", valores: [a.company] });
  return extras;
}

export async function listarContatos(ctx: Ctx, e: EntradaDaLista) {
  const { page, pageSize, skip } = lerPaginacao(e);
  const { ordenacao, aviso } = lerOrdenacao(e.sort, "contatos", e.dir);
  const orderBy = orderByDe("contatos", ordenacao) as Prisma.ContactOrderByWithRelationInput[];
  const w = await whereDeContatos(ctx, e.filtro ?? "", { extras: e.extras });
  const r = await resolverConjunto(w, { orderBy });
  const [total, linhas] = await Promise.all([
    r.ids ? r.ids.length : prisma.contact.count({ where: r.where }),
    e.apenasTotal ? [] : prisma.contact.findMany({ where: r.where, include: INCLUDE_CONTATO, orderBy, skip, take: pageSize }),
  ]);
  return {
    total,
    page,
    pageSize,
    contacts: linhas.map((c) => ({ ...serializeContact(c), ownerId: c.ownerId, owner: c.owner ?? null })),
    avisos: aviso ? [...w.avisos, aviso] : w.avisos,
    truncado: r.truncado,
    ordenacao,
  };
}

const INCLUDE_LINHA_DE_NEGOCIO = {
  ...INCLUDE_CARTAO,
  stage: { select: { id: true, name: true, type: true, position: true } },
  pipeline: { select: { id: true, name: true } },
} satisfies Prisma.DealInclude;

export async function listarNegocios(ctx: Ctx, e: EntradaDaLista) {
  const { page, pageSize, skip } = lerPaginacao(e);
  const { ordenacao, aviso } = lerOrdenacao(e.sort, "negocios", e.dir);
  const orderBy = orderByDe("negocios", ordenacao) as Prisma.DealOrderByWithRelationInput[];
  const w = await whereDeNegocios(ctx, e.filtro ?? "", { extras: e.extras, incluirArquivados: e.incluirArquivados });
  const r = await resolverConjunto(w, { orderBy });
  const [total, soma, linhas] = await Promise.all([
    r.ids ? r.ids.length : prisma.deal.count({ where: r.where }),
    prisma.deal.aggregate({ where: r.where, _sum: { amountCents: true } }),
    e.apenasTotal ? [] : prisma.deal.findMany({ where: r.where, include: INCLUDE_LINHA_DE_NEGOCIO, orderBy, skip, take: pageSize }),
  ]);
  // Parado pela regra da etapa e pela última atividade (o mesmo do quadro).
  const [{ regras }, atividade] = await Promise.all([
    lerRegras([...new Map(linhas.map((d) => [d.stage.id, d.stage])).values()]),
    ultimaAtividadePorNegocio(linhas.map((d) => d.id)),
  ]);
  return {
    total,
    page,
    pageSize,
    deals: linhas.map((d) => ({
      ...serializarCartao(d),
      lastActivityAt: atividade.get(d.id)?.toISOString() ?? null,
      stage: { ...d.stage, rottingDays: regras.get(d.stage.id)?.diasParado ?? null },
      pipeline: d.pipeline,
      ownerId: d.ownerId,
    })),
    somaCents: soma._sum.amountCents ?? 0,
    avisos: aviso ? [...w.avisos, aviso] : w.avisos,
    truncado: r.truncado,
    ordenacao,
  };
}
