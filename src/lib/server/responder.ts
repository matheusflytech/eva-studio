import "server-only";
import { prisma } from "@/lib/db/prisma";
import { deliverToContact, type DeliverResult } from "@/lib/server/outbound";
import { CANAIS_RESPONDIVEIS, janelaDeResposta, registrarMensagens } from "@/lib/server/inbox";
import { CANAIS_DE_TESTE, INCLUDE_MENSAGEM, serializarMensagens } from "@/lib/server/conversas";
import { caminhoDaOrg, classificarMime, MAX_MEDIA_BYTES, urlAssinada } from "@/lib/server/storage";

// ---------------------------------------------------------------------------
// Resposta de um atendente.
//
// A versão anterior da rota fazia três coisas erradas ao mesmo tempo:
//   1. não olhava a resposta da Meta, então "janela de 24h fechada" virava
//      "enviado" na tela e a mensagem nunca chegava;
//   2. só enviava por WhatsApp, e em Instagram, Telegram e Messenger gravava a
//      mensagem como se tivesse saído — nunca saía;
//   3. só deixava responder quando o agente tinha passado a conversa, então o
//      atendente não podia entrar por conta própria.
//
// Aqui o envio passa pelo mesmo caminho de todo o resto do app
// (`deliverToContact`), confere o resultado e deixa o estado visível.
// ---------------------------------------------------------------------------

export interface AnexoRecebido {
  path: string;
  type: string;
  mime: string;
  name?: string;
  size?: number;
}

export interface PedidoDeResposta {
  conversationId: string;
  orgId: string;
  userId: string;
  text?: string;
  templateId?: string;
  attachment?: AnexoRecebido;
}

export type RespostaDoEnvio =
  | { ok: true; message: Awaited<ReturnType<typeof serializarMensagens>>[number] }
  | { ok: false; status: number; error: string; codigo?: string; extra?: Record<string, unknown> };

const TIPOS_DE_ANEXO = new Set(["image", "audio", "video", "document", "sticker"]);

function preencher(modelo: string, variaveis: Record<string, unknown>): string {
  return modelo.replace(/\{(\w+)\}/g, (_, chave) => {
    const v = variaveis[chave];
    return v === undefined || v === null ? "" : String(v);
  });
}

function validarAnexo(a: AnexoRecebido | undefined, orgId: string): string | null {
  if (!a) return null;
  if (typeof a.path !== "string" || !caminhoDaOrg(a.path, orgId)) return "Anexo inválido.";
  if (!TIPOS_DE_ANEXO.has(a.type)) return "Tipo de anexo inválido.";
  if (!classificarMime(a.mime)) return "Tipo de arquivo não suportado.";
  if (a.size !== undefined && a.size > MAX_MEDIA_BYTES) return "Arquivo maior que 16 MB.";
  return null;
}

export async function responderComoAtendente(pedido: PedidoDeResposta): Promise<RespostaDoEnvio> {
  const conversa = await prisma.conversation.findFirst({
    where: { id: pedido.conversationId, agent: { orgId: pedido.orgId } },
    include: {
      assignedTo: { select: { id: true, name: true } },
      contact: { select: { name: true, email: true, phone: true } },
    },
  });
  if (!conversa) return { ok: false, status: 404, error: "Conversa não encontrada." };

  const texto = (pedido.text ?? "").trim();
  if (!texto && !pedido.attachment && !pedido.templateId) {
    return { ok: false, status: 400, error: "Escreva uma mensagem ou anexe um arquivo." };
  }
  if (texto.length > 4096) return { ok: false, status: 400, error: "A mensagem passa de 4096 caracteres." };

  const erroAnexo = validarAnexo(pedido.attachment, pedido.orgId);
  if (erroAnexo) return { ok: false, status: 400, error: erroAnexo };

  const simulado = CANAIS_DE_TESTE.includes(conversa.channel);
  if (!simulado && !CANAIS_RESPONDIVEIS.has(conversa.channel)) {
    return {
      ok: false,
      status: 400,
      error: "Este canal não permite responder por aqui: a mensagem não chegaria até o cliente.",
      codigo: "canal_sem_resposta",
    };
  }

  // Outra pessoa está com a conversa: não atropelar. Quem quer, assume de forma
  // explícita. Sem isso, dois atendentes respondem o mesmo cliente.
  if (
    conversa.status === "human" &&
    conversa.assignedToId &&
    conversa.assignedToId !== pedido.userId
  ) {
    return {
      ok: false,
      status: 409,
      error: `${conversa.assignedTo?.name ?? "Outra pessoa"} está atendendo esta conversa.`,
      codigo: "de_outro",
      extra: { assignedTo: conversa.assignedTo },
    };
  }

  // Janela de 24h: só vale pros canais que têm a regra e só pra conversa real.
  const janela = janelaDeResposta(conversa.channel, conversa.lastContactMessageAt);
  let template: { name: string; languageCode: string; parameters: string[] } | undefined;
  let textoFinal = texto;

  if (pedido.templateId) {
    if (conversa.channel !== "whatsapp_meta") {
      return { ok: false, status: 400, error: "Modelo aprovado só existe no WhatsApp oficial." };
    }
    const modelo = await prisma.messageTemplate.findFirst({
      where: { id: pedido.templateId, agentId: conversa.agentId },
    });
    if (!modelo) return { ok: false, status: 404, error: "Modelo não encontrado." };
    if (!modelo.metaTemplateName) {
      return { ok: false, status: 400, error: "Este modelo não está ligado a um template aprovado da Meta." };
    }
    const variaveis: Record<string, unknown> = {
      ...(conversa.variables as Record<string, unknown>),
      nome: conversa.contact?.name ?? "",
      email: conversa.contact?.email ?? "",
      telefone: conversa.contact?.phone ?? "",
    };
    const ordem = (modelo.variableOrder as unknown as string[]) ?? [];
    template = {
      name: modelo.metaTemplateName,
      languageCode: modelo.metaLanguageCode,
      parameters: ordem.map((n) => String(variaveis[n] ?? "")),
    };
    // O que fica na conversa é o texto do modelo já preenchido, que é o que o
    // cliente lê — não o nome técnico do template.
    textoFinal = preencher(modelo.bodyText, variaveis);
  } else if (!simulado && janela.restrita && !janela.aberta) {
    return {
      ok: false,
      status: 409,
      error: "A janela de 24h desta conversa acabou. Só dá para enviar um modelo aprovado pela Meta.",
      codigo: "janela_fechada",
    };
  }

  // Assume a conversa ANTES de enviar. Se o agente ainda estivesse ativo e o
  // cliente respondesse no meio do envio, o agente responderia por cima do
  // atendente.
  await prisma.conversation.update({
    where: { id: conversa.id },
    data: { status: "human", assignedToId: pedido.userId, readAt: new Date() },
  });

  const [criada] = await registrarMensagens(conversa.id, [
    {
      role: "human",
      text: textoFinal,
      authorId: pedido.userId,
      mediaPath: pedido.attachment?.path,
      mediaType: pedido.attachment?.type,
      mediaMime: pedido.attachment?.mime,
      mediaName: pedido.attachment?.name,
      mediaSize: pedido.attachment?.size,
      deliveryStatus: simulado ? "sent" : "sending",
    },
  ]);

  if (!simulado) {
    const resultado = await enviar(conversa, textoFinal, pedido.attachment, template);
    await prisma.message.update({
      where: { id: criada.id },
      data: resultado.ok
        ? { deliveryStatus: resultado.queued ? "queued" : "sent", externalId: resultado.id ?? null, deliveryError: null }
        : { deliveryStatus: "failed", deliveryError: (resultado.error ?? "Falha no envio.").slice(0, 500) },
    });
  }

  const final = await prisma.message.findUniqueOrThrow({ where: { id: criada.id }, include: INCLUDE_MENSAGEM });
  const [serializada] = await serializarMensagens([final]);
  return { ok: true, message: serializada };
}

async function enviar(
  conversa: { agentId: string; channel: string; contactId: string },
  texto: string,
  anexo: AnexoRecebido | undefined,
  template: { name: string; languageCode: string; parameters: string[] } | undefined
): Promise<DeliverResult> {
  let media;
  if (anexo) {
    // Os canais que buscam o arquivo sozinhos precisam de uma URL pública; a
    // nossa é assinada e dura 15 minutos, o suficiente pra eles baixarem.
    const url = await urlAssinada(anexo.path, 900);
    if (!url && conversa.channel !== "whatsapp_qr") {
      return { ok: false, error: "Não foi possível gerar o link do arquivo." };
    }
    media = { url: url ?? undefined, path: anexo.path, type: anexo.type, mime: anexo.mime, name: anexo.name };
  }

  return deliverToContact({
    agentId: conversa.agentId,
    channel: conversa.channel,
    to: conversa.contactId,
    text: texto,
    template,
    media,
  });
}

/**
 * Tenta de novo uma mensagem que falhou. Reenvia como texto (ou com o mesmo
 * anexo): o modelo da Meta não é guardado na mensagem, então se a janela
 * fechou nesse meio tempo o atendente precisa escolher o modelo outra vez.
 */
export async function reenviarMensagem(params: {
  messageId: string;
  conversationId: string;
  orgId: string;
}): Promise<RespostaDoEnvio> {
  const mensagem = await prisma.message.findFirst({
    where: {
      id: params.messageId,
      conversationId: params.conversationId,
      role: "human",
      conversation: { agent: { orgId: params.orgId } },
    },
    include: { conversation: true },
  });
  if (!mensagem) return { ok: false, status: 404, error: "Mensagem não encontrada." };
  if (mensagem.deliveryStatus !== "failed") {
    return { ok: false, status: 409, error: "Esta mensagem não está com falha." };
  }

  const conversa = mensagem.conversation;
  const janela = janelaDeResposta(conversa.channel, conversa.lastContactMessageAt);
  if (janela.restrita && !janela.aberta) {
    return {
      ok: false,
      status: 409,
      error: "A janela de 24h acabou. Envie um modelo aprovado em vez de repetir esta mensagem.",
      codigo: "janela_fechada",
    };
  }

  await prisma.message.update({ where: { id: mensagem.id }, data: { deliveryStatus: "sending", deliveryError: null } });

  const anexo: AnexoRecebido | undefined = mensagem.mediaPath
    ? {
        path: mensagem.mediaPath,
        type: mensagem.mediaType ?? "document",
        mime: mensagem.mediaMime ?? "application/octet-stream",
        name: mensagem.mediaName ?? undefined,
      }
    : undefined;

  const resultado = await enviar(conversa, mensagem.text, anexo, undefined);
  await prisma.message.update({
    where: { id: mensagem.id },
    data: resultado.ok
      ? { deliveryStatus: resultado.queued ? "queued" : "sent", externalId: resultado.id ?? null, deliveryError: null }
      : { deliveryStatus: "failed", deliveryError: (resultado.error ?? "Falha no envio.").slice(0, 500) },
  });

  const final = await prisma.message.findUniqueOrThrow({ where: { id: mensagem.id }, include: INCLUDE_MENSAGEM });
  const [serializada] = await serializarMensagens([final]);
  return { ok: true, message: serializada };
}
