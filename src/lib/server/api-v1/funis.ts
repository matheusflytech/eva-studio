import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Pipeline, PipelineStage } from "@/generated/prisma/client";
import { ErroApi, iso } from "./http";

// Formato público de funil e etapa. A regra (limites, tipos, mover negócios
// ao apagar) é a da tela, em src/lib/server/funis-acoes.ts.

type EtapaComContagem = PipelineStage & { _count?: { deals: number } };

export function serializarEtapa(s: EtapaComContagem) {
  return {
    id: s.id,
    pipeline_id: s.pipelineId,
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
    id: p.id,
    name: p.name,
    is_default: p.isDefault,
    position: p.position,
    ...(p._count ? { deal_count: p._count.deals } : {}),
    stages: p.stages.map(serializarEtapa),
    created_at: iso(p.createdAt),
  };
}

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

/** Lista de ids para reordenar: { ids: [...] }. */
export function lerIds(corpo: Record<string, unknown>): string[] {
  const ids = corpo.ids;
  if (!Array.isArray(ids) || ids.length > 100 || !ids.every((i) => typeof i === "string")) {
    throw new ErroApi(400, "invalid_parameter", "ids precisa ser uma lista de ids.", { param: "ids" });
  }
  return ids as string[];
}
