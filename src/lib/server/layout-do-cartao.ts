import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizarLayout, type LayoutDoCartao } from "@/lib/cartao-layout";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";

// Leitura do layout do cartão de um funil, usada pela rota do cartão e pelo
// GET /api/deals. A tabela pode ainda não existir no banco: qualquer falha
// vira o layout padrão e o quadro segue funcionando.

export interface LayoutDoFunil {
  layout: LayoutDoCartao;
  /** Há um layout gravado para o funil (senão vale o padrão). */
  salvo: boolean;
  /** A tabela respondeu; false = personalização ainda não ativada no banco. */
  disponivel: boolean;
  /** O padrão para este funil (padrão + campos legados "mostrar no cartão"). */
  padrao: LayoutDoCartao;
}

export function chavesDosCampos(defs: DefinicaoDeCampo[]) {
  return { chaves: defs.map((d) => d.key), legado: defs.filter((d) => d.showOnCard).map((d) => d.key) };
}

export async function lerLayoutDoFunil(pipelineId: string, defs: DefinicaoDeCampo[]): Promise<LayoutDoFunil> {
  const { chaves, legado } = chavesDosCampos(defs);
  let registro: { layout: unknown } | null = null;
  let disponivel = true;
  try {
    registro = await prisma.pipelineCardLayout.findUnique({ where: { pipelineId }, select: { layout: true } });
  } catch {
    disponivel = false;
  }
  return {
    layout: normalizarLayout(registro?.layout ?? null, chaves, legado),
    salvo: !!registro,
    disponivel,
    padrao: normalizarLayout(null, chaves, legado),
  };
}

/** Erro do Prisma de tabela (ou coluna) que não existe no banco. */
export function tabelaAusente(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2021" || e.code === "P2022";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /eva_studio_pipeline_card_layouts|does not exist|não existe/i.test(msg);
}
