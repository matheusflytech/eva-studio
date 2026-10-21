import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";
import { registrarWebhookDoTelegram } from "@/lib/server/telegram-webhook";

// ---------------------------------------------------------------------------
// Canais do contrato (F4, fase 1).
//
// As conexões continuam nas tabelas de sempre, cada uma presa ao agente que
// atende por ela (chave = agentId). A tela do contrato junta todas num lugar
// só e deixa trocar o agente que atende, sem mexer em nenhuma tabela: trocar
// = a linha da conexão passa para o outro agente. Entrada, envio, disparos e
// worker continuam lendo do mesmo jeito.
//
// Limites desta fase (a fase 2 tira): um agente atende no máximo uma conexão
// de cada tipo; toda conexão tem um agente; WhatsApp por QR e TikTok trocam
// reconectando (sessão do worker e URL cadastrada no TikTok são por agente).
// ---------------------------------------------------------------------------

import type { TipoDeCanal } from "@/lib/canais";
export type { TipoDeCanal };

export const TIPOS_DE_CANAL: TipoDeCanal[] = ["whatsapp_meta", "whatsapp_qr", "instagram", "messenger", "telegram", "tiktok"];

/** Tipos que trocam de agente sem reconectar. */
export const TROCA_DIRETA = new Set<TipoDeCanal>(["whatsapp_meta", "instagram", "messenger", "telegram"]);

export interface ConexaoDoContrato {
  tipo: TipoDeCanal;
  agentId: string;
  agentNome: string;
  /** Número, @conta, página ou bot. */
  rotulo: string;
  situacao: "conectado" | "atencao" | "pendente";
  detalhe?: string;
}

export interface CanaisDoContrato {
  conexoes: ConexaoDoContrato[];
  agentes: { id: string; nome: string; tipos: TipoDeCanal[]; widget: boolean }[];
}

interface AgenteComConexoes {
  id: string;
  name: string;
  widgetEnabled: boolean;
  whatsappConnection: { status: string; phoneNumber: string | null; lastError: string | null } | null;
  metaConnection: { displayPhone: string | null; phoneNumberId: string } | null;
  instagramConnection: { username: string | null; igBusinessId: string } | null;
  telegramConnection: { botUsername: string; webhookSet: boolean; lastError: string | null } | null;
  messengerConnection: { pageName: string; pageId: string } | null;
  tiktokConnection: { displayName: string; lastError: string | null; expiresAt: Date | null } | null;
}

/** As conexões de um agente, no formato da tela. Pura (testável). */
export function conexoesDoAgente(a: AgenteComConexoes, agora = new Date()): ConexaoDoContrato[] {
  const base = { agentId: a.id, agentNome: a.name };
  const lista: ConexaoDoContrato[] = [];

  if (a.metaConnection) {
    lista.push({ ...base, tipo: "whatsapp_meta", rotulo: a.metaConnection.displayPhone || a.metaConnection.phoneNumberId, situacao: "conectado" });
  }
  const qr = a.whatsappConnection;
  if (qr && qr.status !== "disconnected") {
    lista.push({
      ...base,
      tipo: "whatsapp_qr",
      rotulo: qr.phoneNumber || "Número ainda não lido",
      situacao: qr.status === "connected" ? "conectado" : "pendente",
      detalhe: qr.status === "connected" ? undefined : "Esperando ler o QR code",
    });
  }
  if (a.instagramConnection) {
    lista.push({
      ...base,
      tipo: "instagram",
      rotulo: a.instagramConnection.username ? `@${a.instagramConnection.username}` : a.instagramConnection.igBusinessId,
      situacao: "conectado",
    });
  }
  if (a.messengerConnection) {
    lista.push({ ...base, tipo: "messenger", rotulo: a.messengerConnection.pageName || a.messengerConnection.pageId, situacao: "conectado" });
  }
  if (a.telegramConnection) {
    const t = a.telegramConnection;
    lista.push({
      ...base,
      tipo: "telegram",
      rotulo: t.botUsername ? `@${t.botUsername}` : "Bot do Telegram",
      situacao: t.webhookSet ? "conectado" : "atencao",
      detalhe: t.webhookSet ? undefined : t.lastError ?? "Webhook não registrado",
    });
  }
  if (a.tiktokConnection) {
    const t = a.tiktokConnection;
    const vencido = t.expiresAt != null && t.expiresAt < agora;
    lista.push({
      ...base,
      tipo: "tiktok",
      rotulo: t.displayName || "Conta do TikTok",
      situacao: t.lastError || vencido ? "atencao" : "conectado",
      detalhe: t.lastError ?? (vencido ? "Acesso vencido: reconecte" : undefined),
    });
  }
  return lista;
}

export async function listarCanais(orgId: string): Promise<CanaisDoContrato> {
  const agentes = await prisma.agent.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      widgetEnabled: true,
      whatsappConnection: { select: { status: true, phoneNumber: true, lastError: true } },
      metaConnection: { select: { displayPhone: true, phoneNumberId: true } },
      instagramConnection: { select: { username: true, igBusinessId: true } },
      telegramConnection: { select: { botUsername: true, webhookSet: true, lastError: true } },
      messengerConnection: { select: { pageName: true, pageId: true } },
      tiktokConnection: { select: { displayName: true, lastError: true, expiresAt: true } },
    },
  });
  const conexoes = agentes.flatMap((a) => conexoesDoAgente(a));
  return {
    conexoes,
    agentes: agentes.map((a) => ({
      id: a.id,
      nome: a.name,
      tipos: conexoes.filter((c) => c.agentId === a.id).map((c) => c.tipo),
      widget: a.widgetEnabled,
    })),
  };
}

export type ResultadoDaTroca = { ok: true; aviso?: string } | { ok: false; status: number; error: string };

/**
 * Passa a conexão `tipo` do agente `de` para o agente `para`. Os dois têm de
 * ser do contrato; `para` não pode já ter uma conexão desse tipo.
 */
export async function trocarAgenteDoCanal(orgId: string, tipo: TipoDeCanal, de: string, para: string): Promise<ResultadoDaTroca> {
  if (!TIPOS_DE_CANAL.includes(tipo)) return { ok: false, status: 400, error: "Canal desconhecido." };
  if (de === para) return { ok: true };
  if (!TROCA_DIRETA.has(tipo)) {
    return {
      ok: false,
      status: 409,
      error:
        tipo === "whatsapp_qr"
          ? "O WhatsApp por QR code fica preso à sessão do agente: desconecte aqui e leia o QR de novo no outro agente."
          : "O TikTok guarda o endereço do agente no portal dele: desconecte e conecte de novo no outro agente.",
    };
  }

  const agentes = await prisma.agent.findMany({ where: { orgId, id: { in: [de, para] } }, select: { id: true } });
  if (agentes.length !== 2) return { ok: false, status: 404, error: "Agente não encontrado neste contrato." };

  const onde = { agentId: de };
  const jaTem = { agentId: para };
  const mover = { agentId: para };

  try {
    if (tipo === "whatsapp_meta") {
      if (await prisma.metaConnection.findUnique({ where: jaTem })) return ocupado();
      await prisma.metaConnection.update({ where: onde, data: mover });
      return { ok: true, aviso: "Os modelos de mensagem (templates) cadastrados no agente anterior continuam com ele." };
    }
    if (tipo === "instagram") {
      if (await prisma.instagramConnection.findUnique({ where: jaTem })) return ocupado();
      await prisma.instagramConnection.update({ where: onde, data: mover });
      return { ok: true, aviso: "Gatilhos e automações de comentário continuam no agente anterior." };
    }
    if (tipo === "messenger") {
      if (await prisma.messengerConnection.findUnique({ where: jaTem })) return ocupado();
      await prisma.messengerConnection.update({ where: onde, data: mover });
      return { ok: true };
    }
    // Telegram: o webhook do bot leva o id do agente; registra de novo.
    if (await prisma.telegramConnection.findUnique({ where: jaTem })) return ocupado();
    const conn = await prisma.telegramConnection.update({ where: onde, data: mover });
    const registro = await registrarWebhookDoTelegram(decryptSecret(conn.botToken), para);
    await prisma.telegramConnection.update({
      where: { agentId: para },
      data: { webhookSet: registro.ok, lastError: registro.ok ? null : registro.erro },
    });
    return registro.ok ? { ok: true } : { ok: true, aviso: `O bot passou, mas o Telegram recusou o webhook: ${registro.erro}` };
  } catch {
    return { ok: false, status: 404, error: "Esse agente não tem esse canal conectado." };
  }
}

function ocupado(): ResultadoDaTroca {
  return { ok: false, status: 409, error: "O agente escolhido já atende por um canal desse tipo. Tire o outro antes." };
}
