import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { advanceConversation } from "@/lib/server/flow-engine";
import { anexoDeUrl, deliverToContact } from "@/lib/server/outbound";
import { CANAIS_DE_TESTE } from "@/lib/server/conversas";
import { CANAIS_POR_BUSCA } from "@/lib/server/inbox";

// O bloco "Esperar" só anda quando chega mensagem. No WhatsApp QR o worker
// retoma as esperas vencidas (worker/index.js); aqui o relógio retoma as dos
// outros canais.
export async function retomarEsperasVencidas(limite = 10): Promise<number> {
  const vencidas = await prisma.$queryRaw<{ id: string; agentId: string; channel: string; contactId: string; prazo: string }[]>`
    select id, "agentId", channel, "contactId", variables->>'__wait_until' as prazo
      from eva_studio_conversations
     where status = 'active'
       and channel not in ('whatsapp_qr', ${Prisma.join(CANAIS_DE_TESTE)})
       and variables->>'__wait_until' is not null
       and (variables->>'__wait_until')::timestamptz <= now()
     limit ${limite}`;

  let retomadas = 0;
  for (const c of vencidas) {
    // Só quem tirar o prazo retoma: duas rodadas não mandam o follow-up duas vezes.
    const tirou = await prisma.$executeRaw`
      update eva_studio_conversations set variables = variables - '__wait_until'
       where id = ${c.id} and variables->>'__wait_until' = ${c.prazo}`;
    if (!tirou) continue;
    try {
      const { messages } = await advanceConversation({ agentId: c.agentId, channel: c.channel, contactId: c.contactId });
      retomadas += 1;
      if (CANAIS_POR_BUSCA.has(c.channel)) continue; // o chat do site busca as mensagens sozinho
      for (const m of messages) {
        // Sem a rota do canal não há botões: as opções vão numeradas, e o motor aceita a resposta pelo número.
        const opcoes = m.options?.length ? `\n\n${m.options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}` : "";
        // Mídia por URL: o QR passa pela fila, que só conhece arquivo do storage; lá vai o link no texto.
        const qr = c.channel === "whatsapp_qr";
        const texto = [m.text + opcoes, m.media && qr ? m.media.url : ""].filter(Boolean).join("\n");
        const r = await deliverToContact({
          agentId: c.agentId,
          channel: c.channel,
          to: c.contactId,
          text: texto,
          template: m.template,
          media: m.media && !qr ? anexoDeUrl(m.media) : undefined,
        });
        if (!r.ok) console.error("[esperas] envio falhou", c.id, r.error);
      }
    } catch (e) {
      console.error("[esperas] retomada falhou", c.id, e instanceof Error ? e.message : e);
    }
  }
  return retomadas;
}
