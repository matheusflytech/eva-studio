import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Pipeline, PipelineStage } from "@/generated/prisma/client";
import { ErroApi, iso } from "./http";

// Formato público de funil e etapa. A regra (limites, tipos, mover negócios
// ao apagar) é a da tela, em src/lib/server/funis-acoes.ts.

type EtapaComContagem = PipelineStage & { _count?: { deals: number } };

// ---------------------------------------------------------------------------
// Na API, funil e etapa são identificados pelo número no contrato (funil 1,
// 2...; etapa 1..N somando todos os funis). O UUID fica só aqui dentro: a
// entrada troca número por UUID e a saída, UUID por número.
// ---------------------------------------------------------------------------

/** Número de funil/etapa: inteiro positivo ou texto só de dígitos. UUID ou outra coisa: 400. */
export function lerNumero(v: unknown, param: string): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n <= 0 || n > 2_000_000_000) {
    throw new ErroApi(
      400,
      "invalid_parameter",
      `${param} precisa ser o número do funil/etapa no contrato (1, 2, 3...), como aparece em GET /pipelines. O UUID não é aceito.`,
      { param }
    );
  }
  return n;
}

export async function uuidDoFunil(orgId: string, v: unknown, param = "pipeline_id"): Promise<string> {
  const numero = lerNumero(v, param);
  const p = await prisma.pipeline.findFirst({ where: { orgId, numero }, select: { id: true } });
  if (!p) throw new ErroApi(404, "invalid_reference", `Funil ${numero} não encontrado nesta organização.`, { param });
  return p.id;
}

export async function uuidDaEtapa(orgId: string, v: unknown, param = "stage_id"): Promise<string> {
  const numero = lerNumero(v, param);
  const s = await prisma.pipelineStage.findFirst({ where: { orgId, numero }, select: { id: true } });
  if (!s) throw new ErroApi(404, "invalid_reference", `Etapa ${numero} não encontrada nesta organização.`, { param });
  return s.id;
}

/** Campo opcional do corpo: ausente = undefined; null ou "" = null; senão o UUID do número. */
export async function refOpc(v: unknown, resolver: (v: unknown) => Promise<string>): Promise<string | null | undefined> {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return resolver(v);
}

/** UUID → número dos ids guardados (histórico, eventos). Apagado não volta: fica null. */
export async function numerosDeFunis(ids: (string | null | undefined)[]): Promise<Map<string, number>> {
  const lista = [...new Set(ids.filter((i): i is string => !!i))];
  if (lista.length === 0) return new Map();
  const linhas = await prisma.pipeline.findMany({ where: { id: { in: lista } }, select: { id: true, numero: true } });
  return new Map(linhas.map((l) => [l.id, l.numero]));
}

export async function numerosDeEtapas(ids: (string | null | undefined)[]): Promise<Map<string, number>> {
  const lista = [...new Set(ids.filter((i): i is string => !!i))];
  if (lista.length === 0) return new Map();
  const linhas = await prisma.pipelineStage.findMany({ where: { id: { in: lista } }, select: { id: true, numero: true } });
  return new Map(linhas.map((l) => [l.id, l.numero]));
}

const CHAVES_DE_FUNIL = ["pipeline_id"];
const CHAVES_DE_ETAPA = ["stage_id", "from_stage_id", "to_stage_id"];

/**
 * Objeto interno (foto da automação, detalhe do evento) que vai para fora:
 * pipeline_id/stage_id/from_stage_id/to_stage_id com UUID viram o número.
 * Só o primeiro nível; o resto fica como veio.
 */
export async function comNumeros<T>(objeto: T): Promise<T> {
  if (!objeto || typeof objeto !== "object" || Array.isArray(objeto)) return objeto;
  const o = objeto as Record<string, unknown>;
  const uuids = (chaves: string[]) => chaves.map((k) => o[k]).filter((v): v is string => typeof v === "string");
  const funis = await numerosDeFunis(uuids(CHAVES_DE_FUNIL));
  const etapas = await numerosDeEtapas(uuids(CHAVES_DE_ETAPA));
  const r: Record<string, unknown> = { ...o };
  for (const k of CHAVES_DE_FUNIL) if (typeof o[k] === "string") r[k] = funis.get(o[k] as string) ?? null;
  for (const k of CHAVES_DE_ETAPA) if (typeof o[k] === "string") r[k] = etapas.get(o[k] as string) ?? null;
  return r as T;
}

export function serializarEtapa(s: EtapaComContagem, numeroDoFunil: number) {
  return {
    id: s.numero,
    pipeline_id: numeroDoFunil,
    name: s.name,
    position: s.position,
    probability: s.probability,
    type: s.type,
    color: s.color,
    ...(s._count ? { deal_count: s._count.deals } : {}),
  };
}

export function serializarFunil(p: Pipeline & { stages: EtapaComContagem[]; _count?: { deals: number } }) {
  return {
    id: p.numero,
    name: p.name,
    is_default: p.isDefault,
    position: p.position,
    ...(p._count ? { deal_count: p._count.deals } : {}),
    stages: p.stages.map((s) => serializarEtapa(s, p.numero)),
    created_at: iso(p.createdAt),
  };
}

/** Funil pelo UUID (já resolvido) com etapas e contagens. */
export async function carregarFunil(orgId: string, id: string) {
  const p = await prisma.pipeline.findFirst({
    where: { id, orgId },
    include: {
      stages: { orderBy: { position: "asc" }, include: { _count: { select: { deals: true } } } },
      _count: { select: { deals: true } },
    },
  });
  if (!p) throw new ErroApi(404, "not_found", "Funil não encontrado.");
  return p;
}

/** Funil do caminho /pipelines/{id}: número → UUID; número que não existe é 404 not_found. */
export async function funilDoCaminho(orgId: string, id: string): Promise<{ id: string; numero: number }> {
  const numero = lerNumero(id, "id");
  const p = await prisma.pipeline.findFirst({ where: { orgId, numero }, select: { id: true, numero: true } });
  if (!p) throw new ErroApi(404, "not_found", "Funil não encontrado.");
  return p;
}

/** Etapa do caminho /pipelines/{id}/stages/{stageId}, dentro do funil do caminho. */
export async function etapaDoCaminho(orgId: string, pipelineId: string, stageId: string): Promise<string> {
  const numero = lerNumero(stageId, "stageId");
  const s = await prisma.pipelineStage.findFirst({ where: { orgId, numero, pipelineId }, select: { id: true } });
  if (!s) throw new ErroApi(404, "not_found", "Etapa não encontrada.");
  return s.id;
}

/** Lista de números para reordenar: { ids: [1, 2, ...] }. */
export function lerIds(corpo: Record<string, unknown>): number[] {
  const ids = corpo.ids;
  if (!Array.isArray(ids) || ids.length > 100) {
    throw new ErroApi(400, "invalid_parameter", "ids precisa ser uma lista de números.", { param: "ids" });
  }
  return ids.map((i) => lerNumero(i, "ids"));
}
