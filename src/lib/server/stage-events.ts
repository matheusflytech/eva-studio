import "server-only";
import { prisma } from "@/lib/db/prisma";

export type OrigemDoMovimento = "usuario" | "fluxo" | "api" | "importacao" | "backfill";

/**
 * Histórico de etapas. Nunca derruba quem moveu o negócio: se não gravar, o
 * dashboard perde um ponto, mas o negócio continua na etapa certa.
 */
export async function registrarMudancaDeEtapa(e: {
  orgId: string;
  dealId: string;
  pipelineId: string;
  fromStageId: string | null;
  toStageId: string;
  origem?: OrigemDoMovimento;
}): Promise<void> {
  if (e.fromStageId === e.toStageId) return;
  try {
    await prisma.dealStageEvent.create({
      data: {
        orgId: e.orgId,
        dealId: e.dealId,
        pipelineId: e.pipelineId,
        fromStageId: e.fromStageId,
        toStageId: e.toStageId,
        origem: e.origem ?? "usuario",
      },
    });
  } catch (error) {
    console.error("[stage-events] falha ao registrar mudança de etapa", error);
  }
}

/**
 * Mesmo histórico, para vários negócios movidos de uma vez (apagar etapa ou
 * funil). Chamado depois da transação: falha aqui não desfaz a mudança.
 */
export async function registrarMudancasEmLote(
  eventos: Array<{ orgId: string; dealId: string; pipelineId: string; fromStageId: string | null; toStageId: string }>,
  origem: OrigemDoMovimento = "usuario"
): Promise<void> {
  const reais = eventos.filter((e) => e.fromStageId !== e.toStageId);
  if (reais.length === 0) return;
  try {
    await prisma.dealStageEvent.createMany({ data: reais.map((e) => ({ ...e, origem })) });
  } catch (error) {
    console.error("[stage-events] falha ao registrar mudanças de etapa em lote", error);
  }
}
