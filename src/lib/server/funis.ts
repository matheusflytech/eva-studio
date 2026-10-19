import "server-only";
import { CORES_DE_ETAPA } from "@/lib/custom-fields";
import type { Prisma } from "@/generated/prisma/client";

// Regras compartilhadas das rotas de funil e etapa.

export const MAX_ETAPAS = 20;
export const MAX_FUNIS = 15;
export const TIPOS_DE_ETAPA = ["open", "won", "lost"] as const;

export function tipoValido(v: unknown): "open" | "won" | "lost" {
  return (TIPOS_DE_ETAPA as readonly string[]).includes(String(v)) ? (String(v) as "open" | "won" | "lost") : "open";
}

export function corValida(v: unknown): string {
  return (CORES_DE_ETAPA as readonly string[]).includes(String(v)) ? String(v) : "";
}

/** Chance de uma etapa aberta quando ninguém informou (ex.: ganho virou aberta). */
export const PROBABILIDADE_ABERTA_PADRAO = 50;

export function probabilidade(v: unknown, tipo: string): number {
  // Ganho vale 100 e perdido vale 0, sempre: previsão ponderada não pode
  // contar uma etapa de perda como chance de venda.
  if (tipo === "won") return 100;
  if (tipo === "lost") return 0;
  return Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
}

/**
 * Move todos os negócios de uma etapa para outra (ao apagar etapa ou funil),
 * dentro da transação de quem chamou. Devolve os ids movidos, para o
 * histórico ser gravado depois do commit.
 *
 * Fechamento segue o destino: aberto limpa closedAt e o motivo da perda;
 * fechado carimba agora só quem ainda não tinha data, para "ganho em março"
 * não virar "ganho hoje" porque alguém reorganizou o funil.
 */
export async function moverNegociosDaEtapa(
  tx: Prisma.TransactionClient,
  origemId: string,
  destino: { id: string; pipelineId: string; type: string; probability: number },
  agora = new Date()
): Promise<string[]> {
  const ids = (await tx.deal.findMany({ where: { stageId: origemId }, select: { id: true } })).map((d) => d.id);
  if (ids.length === 0) return ids;

  const fechando = destino.type !== "open";
  if (fechando) {
    await tx.deal.updateMany({ where: { stageId: origemId, closedAt: null }, data: { closedAt: agora } });
  }
  await tx.deal.updateMany({
    where: { stageId: origemId },
    data: {
      pipelineId: destino.pipelineId,
      stageId: destino.id,
      probability: destino.probability,
      stageSince: agora,
      ...(fechando ? {} : { closedAt: null }),
      // Motivo da perda só sobrevive indo para outra etapa de perda.
      ...(destino.type === "lost" ? {} : { lostReason: "" }),
    },
  });
  return ids;
}

/** Escolhe a etapa de destino de um funil por nome, depois por tipo, depois a primeira aberta. */
export function etapaEquivalente<T extends { id: string; name: string; type: string }>(
  destino: T[],
  origem: { name: string; type: string }
): T {
  const norm = (s: string) => s.trim().toLowerCase();
  return (
    destino.find((e) => norm(e.name) === norm(origem.name)) ??
    (origem.type !== "open" ? destino.find((e) => e.type === origem.type) : undefined) ??
    destino.find((e) => e.type === "open") ??
    destino[0]
  );
}
