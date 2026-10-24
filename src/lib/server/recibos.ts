import "server-only";
import { prisma } from "@/lib/db/prisma";

// Placar de entregues/lidas dos disparos pelo WhatsApp oficial. O do QR é o
// mesmo, no worker (worker/entrega.js): o item da fila guarda o id da
// mensagem no WhatsApp e quando cada recibo chegou; o disparo soma uma vez.

/** Recibo de entregue/lida de uma mensagem enviada: soma no disparo dela, se houver. */
export async function contarReciboNoDisparo(externalId: string, status: "delivered" | "read"): Promise<void> {
  // Lida sem "entregue" antes (recibo perdido) também conta como entregue.
  await marcar(externalId, "deliveredAt", "deliveredCount");
  if (status === "read") await marcar(externalId, "readAt", "readCount");
}

async function marcar(externalId: string, coluna: "deliveredAt" | "readAt", contador: "deliveredCount" | "readCount") {
  // Só a linha com a data ainda vazia é marcada, então cada mensagem soma uma vez.
  const itens = await prisma.outboundQueueItem.updateManyAndReturn({
    where: { externalId, [coluna]: null },
    data: { [coluna]: new Date() },
    select: { broadcastId: true },
  });
  const disparos = itens.map((i) => i.broadcastId).filter((id): id is string => !!id);
  if (disparos.length > 0) {
    await prisma.broadcast.updateMany({ where: { id: { in: disparos } }, data: { [contador]: { increment: 1 } } });
  }
}
