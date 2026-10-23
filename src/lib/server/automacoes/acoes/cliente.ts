import "server-only";
import { prisma } from "@/lib/db/prisma";
import { contatoDaAcao, lerJson, membrosAtivos, seguro } from "./comum";
import type { CtxDaAcao, ManipuladorDeAcao } from "./tipos";

// Ações que falam com o cliente (ou mexem na conversa dele). O executor já
// conferiu opt-out e horário comercial antes de chegar aqui; a janela de 24h
// do WhatsApp oficial é conferida no envio (mensagem-externa.ts).

const PASSAGEIRO = /429|130429|tempo|timeout|ECONN|rede|network|5\d\d/i;

/** Para quem mandar no WhatsApp: a própria conversa, um canal do contato com o agente ou o telefone. */
export async function destinoDoWhatsApp(
  ctx: CtxDaAcao,
  agentId: string,
  canalPreferido: string | null
): Promise<{ channel: string; to: string } | null> {
  const r = ctx.contexto.registro as Record<string, unknown>;
  // Conversa no próprio WhatsApp: responde nela. Conversa do site/playground cai no telefone do contato.
  if (ctx.objeto === "conversation" && typeof r.channel === "string" && r.channel.startsWith("whatsapp") && typeof r.channel_contact_id === "string") {
    if (!canalPreferido || canalPreferido === r.channel) return { channel: r.channel, to: r.channel_contact_id };
  }
  const contato = contatoDaAcao(ctx);
  if (!contato) return null;
  const canais = await prisma.contactChannel.findMany({ where: { contactId: contato, agentId }, select: { channel: true, externalId: true } });
  const ordem = canalPreferido ? [canalPreferido] : ["whatsapp_meta", "whatsapp_qr"];
  for (const c of ordem) {
    const achado = canais.find((x) => x.channel === c);
    if (achado) return { channel: achado.channel, to: achado.externalId };
  }
  const telefone = String((ctx.contexto.contato as Record<string, unknown>)?.phone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return null;
  if (canalPreferido) return canalPreferido.startsWith("whatsapp") ? { channel: canalPreferido, to: telefone } : null;
  const oficial = await prisma.metaConnection.findUnique({ where: { agentId }, select: { agentId: true } }).catch(() => null);
  return { channel: oficial ? "whatsapp_meta" : "whatsapp_qr", to: telefone };
}

export const ACOES_DE_CLIENTE: Record<string, ManipuladorDeAcao> = {
  "whatsapp.send": (config, ctx) =>
    seguro(async () => {
      const agentId = String(config.agente ?? "");
      if (!agentId) return { ok: false, erro: "Escolha o agente que manda a mensagem." };
      const canal = typeof config.canal === "string" && config.canal ? config.canal : null;
      const destino = await destinoDoWhatsApp(ctx, agentId, canal);
      if (!destino) return { ok: true, pulado: "o contato não tem WhatsApp neste agente" };
      const modelo = config.modo === "modelo";
      const variaveis = lerJson(config.variaveis, {});
      const { enviarMensagemExterna } = await import("@/lib/server/mensagem-externa");
      const r = await enviarMensagemExterna(ctx.orgId, {
        agentId,
        channel: destino.channel,
        to: destino.to,
        text: modelo ? undefined : String(config.texto ?? ""),
        templateId: modelo ? String(config.modelo ?? "") : undefined,
        variables: variaveis.ok && variaveis.valor && typeof variaveis.valor === "object" ? (variaveis.valor as Record<string, unknown>) : undefined,
      });
      if (r.ok) return { ok: true, saida: { message_id: r.messageId, conversation_id: r.conversationId, status: r.status } };
      if (r.code === "window_closed" && (config.sem_janela ?? "pular") === "pular") return { ok: true, pulado: "janela de 24h fechada (use um modelo aprovado)" };
      return { ok: false, erro: r.error, retentavel: r.status >= 500 && PASSAGEIRO.test(r.error) };
    }),

  "email.send": (config, ctx) =>
    seguro(async () => {
      const contato = contatoDaAcao(ctx);
      if (!contato) return { ok: true, pulado: "sem contato ligado ao registro" };
      const { enviarEmailDoContrato } = await import("@/lib/server/email/envio");
      const r = await enviarEmailDoContrato(ctx.orgId, {
        contactId: contato,
        conteudo: { modeloId: String(config.modelo ?? "") },
        origem: "automacao",
        refId: ctx.execucaoId,
        extras: { "automacao.execucao": ctx.execucaoId },
      });
      if (r.ok) return { ok: true, saida: { envio_id: r.envioId } };
      if (r.motivo === "sem_email" || r.motivo === "suprimido") return { ok: true, pulado: r.erro };
      return { ok: false, erro: r.erro, retentavel: r.motivo === "erro" };
    }),

  "sequence.enroll": (config, ctx) =>
    seguro(async () => {
      const contato = contatoDaAcao(ctx);
      if (!contato) return { ok: true, pulado: "sem contato ligado ao registro" };
      const regua = await prisma.sequence.findFirst({ where: { id: String(config.regua ?? ""), agent: { orgId: ctx.orgId } }, select: { id: true, active: true } });
      if (!regua) return { ok: false, erro: "A régua escolhida não existe mais." };
      if (!regua.active) return { ok: true, pulado: "a régua está desligada" };
      const { enrollContact } = await import("@/lib/server/sequences");
      const inscricao = await enrollContact(regua.id, contato);
      return inscricao ? { ok: true, saida: { enrollment_id: inscricao } } : { ok: true, pulado: "o contato não pode entrar (não aceita mensagens ou já passou pela régua)" };
    }),

  "sequence.remove": (config, ctx) =>
    seguro(async () => {
      const contato = contatoDaAcao(ctx);
      if (!contato) return { ok: true, pulado: "sem contato ligado ao registro" };
      const r = await prisma.sequenceEnrollment.updateMany({
        where: { contactId: contato, status: "active", ...(config.regua ? { sequenceId: String(config.regua) } : {}), sequence: { agent: { orgId: ctx.orgId } } },
        data: { status: "stopped", stoppedReason: "automação" },
      });
      return r.count ? { ok: true, saida: { paradas: r.count } } : { ok: true, pulado: "não estava em régua ativa" };
    }),

  "conversation.handoff": (config, ctx) =>
    seguro(async () => {
      const conversa = ctx.objeto === "conversation" ? ctx.objetoId : ctx.ids.conversa;
      if (!conversa) return { ok: true, pulado: "o contato não tem conversa" };
      let pessoa: string | null = null;
      if (config.usuario) {
        [pessoa] = await membrosAtivos(ctx.orgId, config.usuario);
        if (!pessoa) return { ok: false, erro: "A pessoa escolhida não está ativa no contrato." };
      }
      await prisma.conversation.updateMany({
        where: { id: conversa, agent: { orgId: ctx.orgId } },
        data: pessoa ? { status: "human", assignedToId: pessoa } : { status: "waiting_human" },
      });
      return { ok: true, saida: { conversation_id: conversa, status: pessoa ? "human" : "waiting_human", assigned_to_id: pessoa } };
    }),
};
