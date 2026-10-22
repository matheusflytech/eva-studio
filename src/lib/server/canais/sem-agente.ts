import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatarSaoPaulo } from "@/lib/fuso-sp";

// ---------------------------------------------------------------------------
// Mensagem chegando num canal do contrato que nenhum agente atende.
//
// A conversa é sempre de um agente (Conversation.agentId), então sem agente
// não há onde guardá-la nem quem responda. O canal fica em "atenção", com a
// contagem e a hora da última, para a tela de Canais e o Início avisarem:
// "escolha um agente para este canal". Nunca lança: é chamado de webhook.
// ---------------------------------------------------------------------------

const PREFIXO = "Recebendo mensagens sem agente";

/** "Recebendo mensagens sem agente: 3 (última 21/10/2026 14:05)". */
export function detalheSemAgente(anterior: string | null | undefined, agora: Date): string {
  const m = (anterior ?? "").match(new RegExp(`^${PREFIXO}: (\\d+)`));
  const total = (m ? Number(m[1]) : 0) + 1;
  return `${PREFIXO}: ${total} (última ${formatarSaoPaulo(agora)})`;
}

export async function registrarMensagemSemAgente(
  onde: { canalId: string } | { tipo: string; externalId: string },
  agora: Date = new Date()
): Promise<void> {
  try {
    const canal = await prisma.canal.findFirst({
      where: "canalId" in onde ? { id: onde.canalId } : { tipo: onde.tipo, externalId: onde.externalId },
      select: { id: true, agentId: true, detalhe: true },
    });
    if (!canal || canal.agentId) return;
    await prisma.canal.update({ where: { id: canal.id }, data: { status: "atencao", detalhe: detalheSemAgente(canal.detalhe, agora) } });
  } catch {
    // Sem a tabela de canais (SQL não aplicado) ou banco instável: segue.
  }
}

export const ehAvisoDeSemAgente = (detalhe: string | null | undefined) => (detalhe ?? "").startsWith(PREFIXO);
