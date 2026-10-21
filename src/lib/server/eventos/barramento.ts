import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Barramento de eventos de domínio (plano das automações, parte B).
//
// Todo ponto que muda o CRM chama `publicarEvento`. O evento é gravado em
// eva_studio_eventos e, depois da resposta, entregue aos consumidores
// (webhooks de saída hoje; automações na parte C). Quem chama nunca espera
// consumidor nem cai por causa dele.
//
// Entrega no máximo uma vez: o primeiro que marca `processadoEm` entrega. Se a
// requisição morrer antes (`after` não roda), o relógio entrega os que ficaram
// para trás (`entregarEventosPendentes`). Sem a tabela (SQL não aplicado), o
// evento vai direto aos consumidores, como era antes.
// ---------------------------------------------------------------------------

export type TipoDeAtor = "usuario" | "automacao" | "agente" | "api" | "integracao" | "sistema";

/** Quem causou o evento. Automação carrega a cadeia (anti-loop na parte C). */
export interface Ator {
  tipo: TipoDeAtor;
  id?: string;
  automacaoId?: string;
  execucaoId?: string;
  /** Quantas automações encadeadas até aqui (0 = ação de gente, API ou sistema). */
  profundidade?: number;
}

export interface EventoNovo {
  orgId: string;
  /** contact.created, deal.stage_changed, contact.tag_added... */
  tipo: string;
  /** deal | contact | company | task | conversation */
  objeto: string;
  objetoId: string;
  /** Detalhe pequeno do evento (etapa de/para, etiqueta, mensagem). O objeto inteiro o consumidor busca. */
  dados?: Record<string, unknown>;
  /** Só o que mudou: { campo: { de, para } }. */
  diff?: Record<string, { de: unknown; para: unknown }>;
  ator?: Ator;
}

export interface EventoPublicado extends Omit<EventoNovo, "ator" | "dados"> {
  id: string | null;
  dados: Record<string, unknown>;
  ator: Ator;
  criadoEm: Date;
}

const contextoDoAtor = new AsyncLocalStorage<Ator>();

/** Roda `fn` com este ator: todo evento publicado lá dentro sai com ele. */
export function comAtor<T>(ator: Ator, fn: () => Promise<T>): Promise<T> {
  return contextoDoAtor.run(ator, fn);
}

/** Sem ator definido: tela e processos internos ("sistema"). */
export function atorAtual(): Ator {
  return contextoDoAtor.getStore() ?? { tipo: "sistema" };
}

// Consumidores em lista fixa (import tardio: evita ciclo de import e não carrega
// o que não é usado). A parte C acrescenta as automações aqui.
type Consumidor = { nome: string; carregar: () => Promise<(e: EventoPublicado) => Promise<void>> };
const CONSUMIDORES: Consumidor[] = [{ nome: "webhooks", carregar: () => import("@/lib/server/webhooks/do-barramento").then((m) => m.paraWebhooks) }];

function semTabela(error: unknown): boolean {
  return /eva_studio_eventos|does not exist|P2021/i.test(String((error as Error)?.message ?? error));
}

export async function publicarEvento(e: EventoNovo): Promise<void> {
  const ator = e.ator ?? atorAtual();
  const publicado: EventoPublicado = { ...e, dados: e.dados ?? {}, ator, id: null, criadoEm: new Date() };
  try {
    if (prisma.eventoDeDominio) {
      const linha = await prisma.eventoDeDominio.create({
        data: {
          orgId: e.orgId,
          tipo: e.tipo,
          objeto: e.objeto,
          objetoId: e.objetoId,
          dados: publicado.dados as object,
          diff: (e.diff ?? undefined) as object | undefined,
          ator: ator as object,
        },
        select: { id: true, createdAt: true },
      });
      publicado.id = linha.id;
      publicado.criadoEm = linha.createdAt;
    }
  } catch (error) {
    if (!semTabela(error)) console.error("[eventos] falha ao gravar", e.tipo, error);
  }
  depoisDaResposta(() => entregarEvento(publicado));
}

/** Fora de uma requisição (testes, scripts) `after` não existe: entrega já. */
function depoisDaResposta(fn: () => Promise<void>) {
  try {
    after(fn);
  } catch {
    void fn().catch(() => {});
  }
}

/** Entrega a todos os consumidores. Com linha gravada, só quem marcar primeiro entrega. */
export async function entregarEvento(e: EventoPublicado): Promise<void> {
  if (e.id) {
    try {
      const r = await prisma.eventoDeDominio.updateMany({ where: { id: e.id, processadoEm: null }, data: { processadoEm: new Date() } });
      if (r.count === 0) return;
    } catch {
      // Banco instável: entrega mesmo assim (antes do barramento era sempre assim).
    }
  }
  for (const c of CONSUMIDORES) {
    try {
      const consumir = await c.carregar();
      await consumir(e);
    } catch (error) {
      console.error(`[eventos] consumidor ${c.nome} falhou em ${e.tipo}`, error);
    }
  }
}

/**
 * Passo do relógio: eventos com mais de 1 minuto que ninguém entregou (a
 * requisição acabou antes do `after`). Sem a tabela, não faz nada.
 */
export async function entregarEventosPendentes(opcoes: { limite?: number; orcamentoMs?: number } = {}): Promise<{ entregues: number }> {
  const fim = Date.now() + (opcoes.orcamentoMs ?? 5_000);
  let linhas: { id: string; orgId: string; tipo: string; objeto: string; objetoId: string; dados: unknown; diff: unknown; ator: unknown; createdAt: Date }[];
  try {
    linhas = await prisma.eventoDeDominio.findMany({
      where: { processadoEm: null, createdAt: { lt: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: "asc" },
      take: opcoes.limite ?? 100,
    });
  } catch {
    return { entregues: 0 };
  }
  let entregues = 0;
  for (const l of linhas) {
    if (Date.now() > fim) break;
    await entregarEvento({
      id: l.id,
      orgId: l.orgId,
      tipo: l.tipo,
      objeto: l.objeto,
      objetoId: l.objetoId,
      dados: (l.dados ?? {}) as Record<string, unknown>,
      diff: (l.diff ?? undefined) as EventoPublicado["diff"],
      ator: (l.ator ?? { tipo: "sistema" }) as Ator,
      criadoEm: l.createdAt,
    });
    entregues++;
  }
  return { entregues };
}
