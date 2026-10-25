import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assinaturaCobre, type TipoDeEvento } from "@/lib/webhooks/eventos";
import { tentarEntrega } from "./entrega";

// ---------------------------------------------------------------------------
// Emissão de eventos do CRM para os webhooks de saída.
//
// Quem chama (crm.ts, stage-events.ts, leads.ts...) nunca espera nem cai por
// causa disto: sem endpoint assinado, sai só uma consulta barata; sem a
// tabela, nada. O corpo do evento só é montado quando alguém vai receber.
//
// Corpo (híbrido): `data` é o objeto atual no mesmo
// formato da API v1 (o n8n não precisa buscar de novo) e `previous` traz só o
// que mudou, quando faz sentido.
// ---------------------------------------------------------------------------

export interface CorpoDoEvento {
  id: string;
  type: TipoDeEvento;
  timestamp: string;
  data: Record<string, unknown>;
  previous?: Record<string, unknown>;
}

type Montar = () => Promise<{ data: Record<string, unknown>; previous?: Record<string, unknown> } | null>;

/** Grava uma entrega por endpoint assinado e tenta já, depois da resposta. */
export async function emitirEvento(orgId: string, tipo: TipoDeEvento, montar: Montar): Promise<void> {
  // Cliente Prisma antigo (ou mock de teste) sem o modelo: nada a emitir.
  if (!prisma.webhookEndpoint) return;
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { orgId, ativo: true },
      select: { id: true, eventos: true },
    });
    const alvo = endpoints.filter((e) => assinaturaCobre(e.eventos, tipo));
    if (alvo.length === 0) return;
    const montado = await montar();
    if (!montado) return;

    const corpo: CorpoDoEvento = {
      id: `evt_${randomUUID()}`,
      type: tipo,
      timestamp: new Date().toISOString(),
      data: montado.data,
      ...(montado.previous ? { previous: montado.previous } : {}),
    };
    const linhas = alvo.map((e) => ({
      id: randomUUID(),
      orgId,
      endpointId: e.id,
      // Um webhook-id por endpoint: quem recebe dedupe por ele.
      eventoId: `msg_${randomUUID()}`,
      tipo,
      payload: corpo as object,
    }));
    await prisma.webhookEntrega.createMany({ data: linhas });
    entregarDepois(linhas.map((l) => ({ id: l.id, endpointId: l.endpointId, eventoId: l.eventoId, payload: l.payload, tentativas: 0 })));
  } catch (error) {
    // Tabela ausente (SQL não aplicado) ou erro de banco: o CRM segue.
    if (!/eva_studio_webhook|does not exist|P2021/i.test(String((error as Error)?.message ?? error))) {
      console.error("[webhooks] falha ao emitir", tipo, error);
    }
  }
}

/**
 * Primeira tentativa logo após a resposta da requisição. Fora de uma
 * requisição (testes, scripts) `after` não existe: fica para o relógio.
 */
function entregarDepois(linhas: Parameters<typeof tentarEntrega>[0][]) {
  try {
    after(async () => {
      for (const l of linhas) await tentarEntrega(l).catch(() => {});
    });
  } catch {
    // Sem contexto de requisição: o relógio entrega na próxima batida.
  }
}

// ---- atalhos por objeto (o formato vem da API v1) ----

/** Import dinâmico: api-v1/negocios importa crm.ts, que importa quem emite. */
export async function emitirEventoDeNegocio(
  orgId: string,
  dealId: string,
  tipo: TipoDeEvento,
  previous?: Record<string, unknown>
): Promise<void> {
  await emitirEvento(orgId, tipo, async () => {
    const { carregarNegocio, serializarNegocios } = await import("@/lib/server/api-v1/negocios");
    const linha = await carregarNegocio(orgId, dealId).catch(() => null);
    if (!linha) return null;
    const [data] = await serializarNegocios(orgId, [linha]);
    return { data: data as Record<string, unknown>, previous };
  });
}

export async function emitirEventoDeTarefa(orgId: string, taskId: string, tipo: TipoDeEvento): Promise<void> {
  await emitirEvento(orgId, tipo, async () => {
    const { serializarTarefa } = await import("@/lib/server/api-v1/tarefas-notas");
    const t = await prisma.task.findFirst({ where: { id: taskId, orgId } });
    return t ? { data: serializarTarefa(t) as Record<string, unknown> } : null;
  });
}

export async function emitirEventoDeEmpresa(orgId: string, companyId: string, tipo: TipoDeEvento, previous?: Record<string, unknown>): Promise<void> {
  await emitirEvento(orgId, tipo, async () => {
    const { carregarEmpresa, serializarEmpresas } = await import("@/lib/server/api-v1/empresas");
    const linha = await carregarEmpresa(orgId, companyId).catch(() => null);
    if (!linha) return null;
    const [data] = await serializarEmpresas(orgId, [linha]);
    return { data: data as Record<string, unknown>, previous };
  });
}

export async function emitirEventoDeContato(
  orgId: string,
  contactId: string,
  tipo: TipoDeEvento,
  previous?: Record<string, unknown>
): Promise<void> {
  await emitirEvento(orgId, tipo, async () => {
    const { carregarContato, serializarContatos } = await import("@/lib/server/api-v1/contatos");
    const linha = await carregarContato(orgId, contactId).catch(() => null);
    if (!linha) return null;
    const [data] = await serializarContatos(orgId, [linha]);
    return { data: data as Record<string, unknown>, previous };
  });
}
