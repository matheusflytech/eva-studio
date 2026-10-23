import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizarLayout, resolverLayout, type LayoutDoCartao } from "@/lib/cartao-layout";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";

// Leitura do layout do cartão de um funil, usada pela rota do cartão e pelo
// GET /api/deals. A tabela pode ainda não existir no banco: qualquer falha
// vira o layout padrão e o quadro segue funcionando.

export interface LayoutDoFunil {
  /** O que vale para quem pede: o da pessoa (quando há) ou o do funil. */
  layout: LayoutDoCartao;
  /** O layout do funil (o "padrão do funil" da personalização). */
  doFunil: LayoutDoCartao;
  /** A pessoa tem o seu próprio layout neste funil. */
  proprio: boolean;
  /** A tabela de layouts por pessoa respondeu (false = personalização desligada). */
  disponivelPessoal: boolean;
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

/**
 * Layout do funil e, com `userId`, o da pessoa por cima (quadro v4). Cada
 * tabela pode faltar no banco: a que falta não pesa e o quadro segue.
 */
export async function lerLayoutDoFunil(pipelineId: string, defs: DefinicaoDeCampo[], userId?: string): Promise<LayoutDoFunil> {
  const { chaves, legado } = chavesDosCampos(defs);
  let registro: { layout: unknown } | null = null;
  let disponivel = true;
  let daPessoa: { layout: unknown } | null = null;
  let disponivelPessoal = false;
  await Promise.all([
    prisma.pipelineCardLayout
      .findUnique({ where: { pipelineId }, select: { layout: true } })
      .then((r) => (registro = r))
      .catch(() => (disponivel = false)),
    userId
      ? Promise.resolve()
          .then(() => prisma.userCardLayout.findUnique({ where: { userId_pipelineId: { userId, pipelineId } }, select: { layout: true } }))
          .then((r) => {
            daPessoa = r;
            disponivelPessoal = true;
          })
          .catch(() => (disponivelPessoal = false))
      : Promise.resolve(),
  ]);
  const doFunil = normalizarLayout((registro as { layout: unknown } | null)?.layout ?? null, chaves, legado);
  const proprio = daPessoa ? normalizarLayout((daPessoa as { layout: unknown }).layout, chaves) : null;
  return {
    layout: resolverLayout(proprio, doFunil),
    doFunil,
    proprio: !!proprio,
    disponivelPessoal,
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
