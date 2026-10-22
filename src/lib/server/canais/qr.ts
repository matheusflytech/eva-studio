import "server-only";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// WhatsApp por QR de cada agente, para quem pergunta "ele tem QR conectado?"
// (visão dos agentes, disponibilidade de disparo, canais para a IA).
//
// Com os canais do contrato, a sessão é do canal (eva_studio_canais_whatsapp_qr)
// e o agente é o que atende o canal. Sem a tabela, vale a linha antiga do
// agente (eva_studio_whatsapp_connections), como antes. Quando a tabela
// existe, ela manda: a linha antiga (cópia migrada) não vale mais.
// ---------------------------------------------------------------------------

export interface QrDoAgente {
  status: string;
  phoneNumber: string | null;
}

/**
 * Estado do QR de cada agente pedido. `modoCanal` = a tabela nova existe e
 * respondeu; nesse caso agente fora do mapa não tem QR. Sem a tabela,
 * `modoCanal` = false e quem chama usa a linha antiga.
 */
export async function qrDosAgentes(agentIds: string[]): Promise<{ modoCanal: boolean; porAgente: Map<string, QrDoAgente> }> {
  const porAgente = new Map<string, QrDoAgente>();
  if (agentIds.length === 0) return { modoCanal: false, porAgente };
  try {
    const canais = await prisma.canal.findMany({
      where: { agentId: { in: agentIds }, tipo: "whatsapp_qr" },
      select: { id: true, agentId: true, rotulo: true, externalId: true },
    });
    const sessoes = canais.length
      ? await prisma.canalWhatsAppQr.findMany({ where: { canalId: { in: canais.map((c) => c.id) } }, select: { canalId: true, status: true, phoneNumber: true } })
      : [];
    const porCanal = new Map(sessoes.map((s) => [s.canalId, s]));
    for (const c of canais) {
      if (!c.agentId) continue;
      const s = porCanal.get(c.id);
      porAgente.set(c.agentId, { status: s?.status ?? "disconnected", phoneNumber: s?.phoneNumber ?? c.externalId ?? null });
    }
    return { modoCanal: true, porAgente };
  } catch {
    return { modoCanal: false, porAgente };
  }
}

/** Atalho para um agente: estado do QR, escolhendo entre canal e linha antiga. */
export async function qrConectado(agentId: string, linhaAntiga: { status: string } | null | undefined): Promise<boolean> {
  const { modoCanal, porAgente } = await qrDosAgentes([agentId]);
  const status = modoCanal ? porAgente.get(agentId)?.status : linhaAntiga?.status;
  return status === "connected";
}
