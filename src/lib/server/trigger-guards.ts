import "server-only";
import { prisma } from "@/lib/db/prisma";
import { TRIGGER_LIMITS } from "@/lib/server/triggers";

/**
 * O bloco de destino tem que ser do fluxo DESTE agente. Sem isso, um id
 * qualquer (de outro agente, de outra org, ou de um bloco já apagado) seria
 * gravado e o gatilho só responderia sem seguir — falha silenciosa.
 */
export async function erroDoBlocoDeDestino(agentId: string, targetNodeId: string): Promise<string | null> {
  if (!targetNodeId) return null;
  const flow = await prisma.agentFlow.findUnique({ where: { agentId }, select: { nodes: true } });
  const nodes = (flow?.nodes ?? []) as unknown as { id?: string }[];
  return nodes.some((n) => n?.id === targetNodeId) ? null : "O bloco escolhido não existe mais no fluxo deste agente.";
}

export async function erroDoTetoDeGatilhos(agentId: string): Promise<string | null> {
  const total = await prisma.agentTrigger.count({ where: { agentId } });
  return total >= TRIGGER_LIMITS.perAgent
    ? `Este agente já tem ${TRIGGER_LIMITS.perAgent} gatilhos, o máximo permitido.`
    : null;
}
