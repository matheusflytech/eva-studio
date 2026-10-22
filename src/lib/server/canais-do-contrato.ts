import "server-only";
import { prisma } from "@/lib/db/prisma";

import type { TipoDeCanal } from "@/lib/canais";
export type { TipoDeCanal };

// ---------------------------------------------------------------------------
// Lista das conexões a partir das tabelas de cada agente (MetaConnection,
// InstagramConnection...). É a leitura de antes dos canais do contrato: vale
// enquanto o SQL 2026-10-22 não foi aplicado (ver canais/repositorio.ts) e
// para o resumo de canais por agente.
// ---------------------------------------------------------------------------

export const TIPOS_DE_CANAL: TipoDeCanal[] = ["whatsapp_meta", "whatsapp_qr", "instagram", "messenger", "telegram", "tiktok"];


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
