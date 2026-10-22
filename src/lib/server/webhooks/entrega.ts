import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";
import { safeFetch } from "@/lib/server/ssrf";
import { headersAssinados } from "./assinatura";

// ---------------------------------------------------------------------------
// Entrega dos webhooks de saída. A tabela de entregas é a fila: o relógio
// (a cada minuto) pega as pendentes vencidas com FOR UPDATE SKIP LOCKED, então
// duas batidas ao mesmo tempo nunca mandam a mesma entrega.
//
// Regras (Standard Webhooks / crm-api-webhooks):
// - só 2xx é sucesso; tempo limite e recusa de redirect vêm do safeFetch;
// - 410 Gone desliga o endpoint na hora;
// - 429/5xx/rede: nova tentativa em 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h
//   (~1 dia e meio); respeita Retry-After quando maior;
// - falhando há 5 dias seguidos: o endpoint é desligado;
// - o webhook-id é o mesmo em todas as tentativas.
// ---------------------------------------------------------------------------

export const ESPERAS_SEG = [5, 5 * 60, 30 * 60, 2 * 3600, 5 * 3600, 10 * 3600, 10 * 3600];
export const MAX_TENTATIVAS = ESPERAS_SEG.length + 1;
const LIMITE_RESPOSTA = 4096;
const DIAS_ATE_DESLIGAR = 5;

type Resultado = { ok: true; status: number } | { ok: false; status: number | null; desligar?: string };

interface LinhaDaFila {
  id: string;
  endpointId: string;
  eventoId: string;
  payload: unknown;
  tentativas: number;
}

/** Quanto esperar antes da tentativa seguinte (null = acabou). */
export function proximaEspera(tentativasFeitas: number, retryAfterSeg: number | null): number | null {
  const base = ESPERAS_SEG[tentativasFeitas - 1];
  if (base === undefined) return null;
  return retryAfterSeg && retryAfterSeg > base ? Math.min(retryAfterSeg, 24 * 3600) : base;
}

function lerRetryAfter(valor: string | null): number | null {
  if (!valor) return null;
  const n = Number(valor);
  if (Number.isFinite(n)) return Math.max(0, n);
  const data = Date.parse(valor);
  return Number.isFinite(data) ? Math.max(0, (data - Date.now()) / 1000) : null;
}

/** Faz uma tentativa e grava o resultado. Nunca lança. */
export async function tentarEntrega(entrega: LinhaDaFila): Promise<Resultado> {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: entrega.endpointId } });
  if (!endpoint || !endpoint.ativo) {
    await prisma.webhookEntrega.update({ where: { id: entrega.id }, data: { status: "cancelada" } });
    return { ok: false, status: null };
  }

  const corpo = JSON.stringify(entrega.payload);
  const tentativa = entrega.tentativas + 1;
  const inicio = Date.now();
  let status: number | null = null;
  let resposta = "";
  let retryAfter: number | null = null;
  try {
    const r = await safeFetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "EvaStudio-Webhooks/1.0",
        ...headersAssinados(decryptSecret(endpoint.segredo), entrega.eventoId, corpo),
      },
      body: corpo,
    });
    status = r.status;
    retryAfter = lerRetryAfter(r.headers.get("retry-after"));
    resposta = (await r.text().catch(() => "")).slice(0, LIMITE_RESPOSTA);
  } catch (e) {
    resposta = e instanceof Error && e.name === "AbortError" ? "Sem resposta a tempo." : `Falha de rede: ${e instanceof Error ? e.message : String(e)}`;
    resposta = resposta.slice(0, LIMITE_RESPOSTA);
  }
  const latenciaMs = Date.now() - inicio;
  const agora = new Date();
  const base = { tentativas: tentativa, ultimoStatus: status, ultimaResposta: resposta, latenciaMs };

  if (status !== null && status >= 200 && status < 300) {
    await prisma.webhookEntrega.update({ where: { id: entrega.id }, data: { ...base, status: "entregue", entregueEm: agora } });
    await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { ultimoSucesso: agora, falhandoDesde: null } });
    return { ok: true, status };
  }

  if (status === 410) {
    await prisma.webhookEntrega.update({ where: { id: entrega.id }, data: { ...base, status: "falhou" } });
    await desligar(endpoint.id, "O endereço respondeu 410 (não existe mais).");
    return { ok: false, status, desligar: "410" };
  }

  // 4xx que não é 408/429: o outro lado recusou; repetir não muda nada.
  const definitivo = status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
  const espera = definitivo ? null : proximaEspera(tentativa, retryAfter);
  await prisma.webhookEntrega.update({
    where: { id: entrega.id },
    data: espera === null ? { ...base, status: "falhou" } : { ...base, proximaEm: new Date(agora.getTime() + espera * 1000) },
  });

  const falhandoDesde = endpoint.falhandoDesde ?? agora;
  if (!endpoint.falhandoDesde) await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { falhandoDesde } });
  if (agora.getTime() - falhandoDesde.getTime() > DIAS_ATE_DESLIGAR * 86_400_000) {
    await desligar(endpoint.id, `Falhou por ${DIAS_ATE_DESLIGAR} dias seguidos.`);
    return { ok: false, status, desligar: "dias" };
  }
  return { ok: false, status };
}

async function desligar(endpointId: string, motivo: string) {
  await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { ativo: false, desativadoPor: motivo } });
  await prisma.webhookEntrega.updateMany({ where: { endpointId, status: "pendente" }, data: { status: "cancelada" } });
}

/**
 * Passo do relógio: entrega as pendentes vencidas até o tempo acabar.
 * Sem a tabela (SQL não aplicado), não faz nada.
 */
export async function entregarPendentes(opcoes: { limite?: number; orcamentoMs?: number } = {}): Promise<{ entregues: number; falhas: number }> {
  const limite = opcoes.limite ?? 50;
  const fim = Date.now() + (opcoes.orcamentoMs ?? 15_000);
  let entregues = 0;
  let falhas = 0;
  let linhas: LinhaDaFila[];
  try {
    // Pega e empurra o horário de uma vez: outra batida não vê estas linhas
    // enquanto esta tenta (se esta morrer no meio, voltam em 2 minutos).
    linhas = await prisma.$queryRaw<LinhaDaFila[]>`
      UPDATE "eva_studio_webhook_entregas" SET "proximaEm" = NOW() + INTERVAL '2 minutes', "updatedAt" = NOW()
      WHERE "id" IN (
        SELECT "id" FROM "eva_studio_webhook_entregas"
        WHERE "status" = 'pendente' AND "proximaEm" <= NOW()
        ORDER BY "proximaEm" ASC
        LIMIT ${limite}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "endpointId", "eventoId", "payload", "tentativas"`;
  } catch {
    return { entregues, falhas };
  }
  for (const linha of linhas) {
    if (Date.now() > fim) {
      // Sem tempo: devolve para a próxima batida.
      await prisma.webhookEntrega.update({ where: { id: linha.id }, data: { proximaEm: new Date() } }).catch(() => {});
      continue;
    }
    const r = await tentarEntrega(linha).catch(() => ({ ok: false as const, status: null }));
    if (r.ok) entregues++;
    else falhas++;
  }
  return { entregues, falhas };
}

/** "Reenviar" da tela: volta a entrega para a fila, mesma webhook-id. */
export async function reenviarEntrega(orgId: string, entregaId: string): Promise<Resultado | null> {
  const e = await prisma.webhookEntrega.findFirst({ where: { id: entregaId, orgId } });
  if (!e) return null;
  // Volta para a fila: se esta tentativa falhar, segue nas próximas esperas.
  await prisma.webhookEntrega.update({ where: { id: e.id }, data: { status: "pendente" } });
  return tentarEntrega({ id: e.id, endpointId: e.endpointId, eventoId: e.eventoId, payload: e.payload, tentativas: e.tentativas });
}
