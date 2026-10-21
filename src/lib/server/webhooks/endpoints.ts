import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { assertSafeUrl } from "@/lib/server/ssrf";
import { normalizarFiltros } from "@/lib/webhooks/eventos";
import { novoSegredo } from "./assinatura";
import { tentarEntrega } from "./entrega";
import type { WebhookEndpoint } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Endpoints dos webhooks de saída: a mesma regra para a tela (Integrações →
// n8n e webhooks) e para a API v1 (o gatilho do n8n assina sozinho).
// ---------------------------------------------------------------------------

export const LIMITE_POR_CONTRATO = 25;

export const SEM_TABELA = "Os webhooks ainda não foram ativados no banco deste ambiente (SQL 2026-10-23-webhooks.sql).";

export class ErroDeWebhook extends Error {
  constructor(
    message: string,
    public status: number,
    public codigo: string
  ) {
    super(message);
  }
}

export function serializarEndpoint(e: WebhookEndpoint) {
  return {
    id: e.id,
    url: e.url,
    description: e.descricao,
    events: e.eventos,
    active: e.ativo,
    source: e.origem,
    disabled_reason: e.desativadoPor,
    failing_since: e.falhandoDesde?.toISOString() ?? null,
    last_success_at: e.ultimoSucesso?.toISOString() ?? null,
    created_at: e.createdAt.toISOString(),
  };
}

async function urlValida(bruta: unknown): Promise<string> {
  const url = String(bruta ?? "").trim();
  if (!/^https?:\/\//i.test(url)) throw new ErroDeWebhook("Informe a URL completa, começando com https://.", 400, "invalid_url");
  if (url.length > 2000) throw new ErroDeWebhook("URL longa demais.", 400, "invalid_url");
  try {
    await assertSafeUrl(url);
  } catch (e) {
    throw new ErroDeWebhook(e instanceof Error ? e.message : "URL não permitida.", 400, "invalid_url");
  }
  return url;
}

function eventosValidos(bruto: unknown): string[] {
  const lista = normalizarFiltros(bruto);
  if (!lista) throw new ErroDeWebhook("Escolha pelo menos um evento do catálogo (ou \"*\").", 400, "invalid_events");
  return lista;
}

/** Cria e devolve o segredo em texto (só nesta resposta e no "Mostrar"). */
export async function criarEndpoint(
  orgId: string,
  entrada: { url: unknown; eventos: unknown; descricao?: unknown; origem?: "tela" | "api"; createdById?: string | null }
): Promise<{ endpoint: WebhookEndpoint; segredo: string }> {
  const url = await urlValida(entrada.url);
  const eventos = eventosValidos(entrada.eventos);
  const total = await prisma.webhookEndpoint.count({ where: { orgId } });
  if (total >= LIMITE_POR_CONTRATO) {
    throw new ErroDeWebhook(`Limite de ${LIMITE_POR_CONTRATO} webhooks por contrato. Apague um que não usa mais.`, 409, "limit_reached");
  }
  const segredo = novoSegredo();
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      orgId,
      url,
      eventos,
      descricao: String(entrada.descricao ?? "").trim().slice(0, 200),
      segredo: encryptSecret(segredo),
      origem: entrada.origem ?? "tela",
      createdById: entrada.createdById ?? null,
    },
  });
  return { endpoint, segredo };
}

export async function atualizarEndpoint(
  orgId: string,
  id: string,
  entrada: { url?: unknown; eventos?: unknown; descricao?: unknown; ativo?: unknown }
): Promise<WebhookEndpoint> {
  const atual = await prisma.webhookEndpoint.findFirst({ where: { id, orgId } });
  if (!atual) throw new ErroDeWebhook("Webhook não encontrado.", 404, "not_found");
  const data: Record<string, unknown> = {};
  if (entrada.url !== undefined) data.url = await urlValida(entrada.url);
  if (entrada.eventos !== undefined) data.eventos = eventosValidos(entrada.eventos);
  if (entrada.descricao !== undefined) data.descricao = String(entrada.descricao ?? "").trim().slice(0, 200);
  if (typeof entrada.ativo === "boolean") {
    data.ativo = entrada.ativo;
    // Religar zera o histórico de falha: conta de novo do zero.
    if (entrada.ativo) Object.assign(data, { desativadoPor: null, falhandoDesde: null });
  }
  return prisma.webhookEndpoint.update({ where: { id }, data });
}

export async function apagarEndpoint(orgId: string, id: string): Promise<boolean> {
  const r = await prisma.webhookEndpoint.deleteMany({ where: { id, orgId } });
  return r.count > 0;
}

export async function segredoDoEndpoint(orgId: string, id: string, trocar: boolean): Promise<string | null> {
  const e = await prisma.webhookEndpoint.findFirst({ where: { id, orgId } });
  if (!e) return null;
  if (!trocar) return decryptSecret(e.segredo);
  const novo = novoSegredo();
  await prisma.webhookEndpoint.update({ where: { id }, data: { segredo: encryptSecret(novo) } });
  return novo;
}

/** "Enviar teste": entrega `webhook.test` agora e devolve o que o outro lado respondeu. */
export async function testarEndpoint(orgId: string, id: string) {
  const e = await prisma.webhookEndpoint.findFirst({ where: { id, orgId } });
  if (!e) throw new ErroDeWebhook("Webhook não encontrado.", 404, "not_found");
  if (!e.ativo) throw new ErroDeWebhook("Ligue o webhook antes de testar.", 409, "inactive");
  const payload = {
    id: `evt_${randomUUID()}`,
    type: "webhook.test",
    timestamp: new Date().toISOString(),
    data: { message: "Teste do Eva Studio. Se chegou, a ligação está certa.", webhook_id: e.id },
  };
  const entrega = await prisma.webhookEntrega.create({
    data: { orgId, endpointId: e.id, eventoId: `msg_${randomUUID()}`, tipo: "webhook.test", payload },
  });
  const r = await tentarEntrega({ id: entrega.id, endpointId: e.id, eventoId: entrega.eventoId, payload, tentativas: 0 });
  const final = await prisma.webhookEntrega.findUnique({ where: { id: entrega.id } });
  // Teste que falhou não fica tentando de novo sozinho.
  if (!r.ok && final?.status === "pendente") await prisma.webhookEntrega.update({ where: { id: entrega.id }, data: { status: "falhou" } });
  return { ok: r.ok, status: final?.ultimoStatus ?? null, resposta: final?.ultimaResposta ?? "", latenciaMs: final?.latenciaMs ?? null };
}

export function serializarEntrega(e: {
  id: string;
  eventoId: string;
  tipo: string;
  status: string;
  tentativas: number;
  proximaEm: Date;
  ultimoStatus: number | null;
  ultimaResposta: string | null;
  latenciaMs: number | null;
  entregueEm: Date | null;
  createdAt: Date;
  payload?: unknown;
}) {
  return {
    id: e.id,
    eventoId: e.eventoId,
    tipo: e.tipo,
    status: e.status,
    tentativas: e.tentativas,
    proximaEm: e.status === "pendente" ? e.proximaEm.toISOString() : null,
    ultimoStatus: e.ultimoStatus,
    ultimaResposta: e.ultimaResposta,
    latenciaMs: e.latenciaMs,
    entregueEm: e.entregueEm?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    payload: e.payload,
  };
}
