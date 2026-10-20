import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type OrigemDoMovimento = "usuario" | "fluxo" | "api" | "importacao" | "backfill";

interface Evento {
  orgId: string;
  dealId: string;
  pipelineId: string;
  fromStageId: string | null;
  toStageId: string;
  origem: OrigemDoMovimento;
  ignorouObrigatorios?: boolean;
}

/** A coluna `ignorouObrigatorios` (SQL 2026-10-20-regras-de-etapa) ainda não existe no banco. */
function colunaDaFlagAusente(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /ignorouObrigatorios/i.test(msg);
}

/**
 * Grava os eventos. createMany (sem RETURNING) e, se a coluna nova ainda não
 * existe, de novo sem ela por SQL direto: o histórico não pode sumir só porque
 * o SQL das regras de etapa não foi aplicado. A flag só se perde nesse caso.
 */
async function gravar(eventos: Evento[]): Promise<void> {
  const linha = (e: Evento) => ({
    orgId: e.orgId,
    dealId: e.dealId,
    pipelineId: e.pipelineId,
    fromStageId: e.fromStageId,
    toStageId: e.toStageId,
    origem: e.origem,
    ...(e.ignorouObrigatorios ? { ignorouObrigatorios: true } : {}),
  });
  try {
    await prisma.dealStageEvent.createMany({ data: eventos.map(linha) });
  } catch (error) {
    if (!colunaDaFlagAusente(error)) throw error;
    for (const e of eventos) {
      await prisma.$executeRaw`INSERT INTO "eva_studio_deal_stage_events" ("id", "orgId", "dealId", "pipelineId", "fromStageId", "toStageId", "origem", "at")
        VALUES (${randomUUID()}, ${e.orgId}, ${e.dealId}, ${e.pipelineId}, ${e.fromStageId}, ${e.toStageId}, ${e.origem}, (${new Date().toISOString()}::timestamptz AT TIME ZONE 'UTC'))`;
    }
  }
}

/**
 * Histórico de etapas. Nunca derruba quem moveu o negócio: se não gravar, o
 * dashboard perde um ponto, mas o negócio continua na etapa certa.
 * `ignorouObrigatorios`: importação/automação moveu com a flag explícita de
 * pular os campos obrigatórios da etapa (e faltava algum).
 */
export async function registrarMudancaDeEtapa(e: {
  orgId: string;
  dealId: string;
  pipelineId: string;
  fromStageId: string | null;
  toStageId: string;
  origem?: OrigemDoMovimento;
  ignorouObrigatorios?: boolean;
}): Promise<void> {
  if (e.fromStageId === e.toStageId) return;
  try {
    await gravar([{ ...e, origem: e.origem ?? "usuario" }]);
  } catch (error) {
    console.error("[stage-events] falha ao registrar mudança de etapa", error);
  }
}

/**
 * Mesmo histórico, para vários negócios movidos de uma vez (apagar etapa ou
 * funil). Chamado depois da transação: falha aqui não desfaz a mudança.
 */
export async function registrarMudancasEmLote(
  eventos: Array<{ orgId: string; dealId: string; pipelineId: string; fromStageId: string | null; toStageId: string }>,
  origem: OrigemDoMovimento = "usuario"
): Promise<void> {
  const reais = eventos.filter((e) => e.fromStageId !== e.toStageId);
  if (reais.length === 0) return;
  try {
    await gravar(reais.map((e) => ({ ...e, origem })));
  } catch (error) {
    console.error("[stage-events] falha ao registrar mudanças de etapa em lote", error);
  }
}
