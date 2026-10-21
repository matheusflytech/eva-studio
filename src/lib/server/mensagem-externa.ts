import "server-only";
import { prisma } from "@/lib/db/prisma";
import { deliverToContact } from "@/lib/server/outbound";
import { CANAIS_RESPONDIVEIS, janelaDeResposta, registrarMensagens } from "@/lib/server/inbox";

// ---------------------------------------------------------------------------
// Mensagem que um sistema de fora (n8n, ERP, script) manda PELO agente.
//
// É o "caminho contrário" do bloco "Enviar para o n8n": o fluxo do cliente
// pode responder depois, com calma, em vez de ter de responder no mesmo POST.
// Entra pela URL de entrada do agente (token na URL) e pela API v1
// (POST /v1/messages, com chave). As mesmas regras do atendente valem aqui:
// janela de 24h dos canais da Meta e modelo aprovado fora dela.
// ---------------------------------------------------------------------------

export interface PedidoExterno {
  agentId: string;
  /** "whatsapp_qr:5511..." (o conversation_id que o bloco manda) ou canal + to. */
  conversationId?: string;
  channel?: string;
  to?: string;
  text?: string;
  /** Modelo do agente (WhatsApp oficial), para fora da janela de 24h. */
  templateId?: string;
  /** Valores das variáveis do modelo, por nome. */
  variables?: Record<string, unknown>;
}

export type ResultadoExterno =
  | { ok: true; messageId: string; conversationId: string; status: "sent" | "queued" }
  | { ok: false; status: number; code: string; error: string };

const erro = (status: number, code: string, error: string): ResultadoExterno => ({ ok: false, status, code, error });

export function lerDestino(p: Pick<PedidoExterno, "conversationId" | "channel" | "to">): { channel: string; to: string } | null {
  if (p.conversationId) {
    const i = p.conversationId.indexOf(":");
    if (i > 0) return { channel: p.conversationId.slice(0, i), to: p.conversationId.slice(i + 1) };
  }
  if (p.channel && p.to) return { channel: p.channel, to: p.to };
  return null;
}

export async function enviarMensagemExterna(orgId: string, p: PedidoExterno): Promise<ResultadoExterno> {
  const agente = await prisma.agent.findFirst({ where: { id: p.agentId, orgId }, select: { id: true } });
  if (!agente) return erro(404, "agent_not_found", "Agente não encontrado.");

  const destino = lerDestino(p);
  if (!destino) return erro(400, "missing_destination", "Informe conversation_id, ou channel e to.");
  if (!CANAIS_RESPONDIVEIS.has(destino.channel)) {
    return erro(400, "channel_not_supported", `O canal "${destino.channel}" não envia mensagem por aqui.`);
  }
  const texto = String(p.text ?? "").trim();
  if (!texto && !p.templateId) return erro(400, "missing_text", "Informe text (ou template_id no WhatsApp oficial).");
  if (texto.length > 4096) return erro(400, "text_too_long", "A mensagem passa de 4096 caracteres.");

  const conversa = await prisma.conversation.upsert({
    where: { agentId_channel_contactId: { agentId: agente.id, channel: destino.channel, contactId: destino.to } },
    create: { agentId: agente.id, channel: destino.channel, contactId: destino.to, variables: {} },
    update: {},
  });

  let template: { name: string; languageCode: string; parameters: string[] } | undefined;
  let textoFinal = texto;
  if (p.templateId) {
    if (destino.channel !== "whatsapp_meta") return erro(400, "template_not_supported", "Modelo aprovado só existe no WhatsApp oficial.");
    const modelo = await prisma.messageTemplate.findFirst({ where: { id: p.templateId, agentId: agente.id } });
    if (!modelo?.metaTemplateName) return erro(404, "template_not_found", "Modelo aprovado não encontrado neste agente.");
    const valores = { ...(conversa.variables as Record<string, unknown>), ...(p.variables ?? {}) };
    const ordem = (modelo.variableOrder as unknown as string[]) ?? [];
    template = { name: modelo.metaTemplateName, languageCode: modelo.metaLanguageCode, parameters: ordem.map((n) => String(valores[n] ?? "")) };
    textoFinal = modelo.bodyText.replace(/\{(\w+)\}/g, (_, k) => String(valores[k] ?? ""));
  } else {
    const janela = janelaDeResposta(destino.channel, conversa.lastContactMessageAt);
    if (janela.restrita && !janela.aberta) {
      return erro(409, "window_closed", "A janela de 24h desta conversa acabou. Mande um template_id aprovado pela Meta.");
    }
  }

  // "bot": saiu em nome do agente (a conversa não passa para um atendente).
  const [criada] = await registrarMensagens(conversa.id, [{ role: "bot", text: textoFinal, deliveryStatus: "sending" }]);
  const r = await deliverToContact({ agentId: agente.id, channel: destino.channel, to: destino.to, text: textoFinal, template });
  await prisma.message.update({
    where: { id: criada.id },
    data: r.ok
      ? { deliveryStatus: r.queued ? "queued" : "sent", externalId: r.id ?? null }
      : { deliveryStatus: "failed", deliveryError: (r.error ?? "Falha no envio.").slice(0, 500) },
  });
  if (!r.ok) return erro(502, "delivery_failed", r.error ?? "O canal recusou a mensagem.");
  return { ok: true, messageId: criada.id, conversationId: `${destino.channel}:${destino.to}`, status: r.queued ? "queued" : "sent" };
}
