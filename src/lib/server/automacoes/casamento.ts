import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { EventoPublicado } from "@/lib/server/eventos/barramento";
import { fotoDoRegistro } from "@/lib/server/eventos/alteracoes";
import { alvosDoEvento, gatilhoCasa } from "@/lib/automacoes/casar";
import type { Definicao, Gatilho } from "@/lib/automacoes/tipos";
import { inscrever } from "./inscricao";
import { executarExecucao } from "./executor";

// ---------------------------------------------------------------------------
// Consumidor do barramento: cada evento de domínio
//  1. inscreve o registro nas automações ativas cujo gatilho casa;
//  2. acorda quem está em "esperar evento" daquele tipo naquele registro;
//  3. acorda quem tem objetivo e está esperando (o executor confere o objetivo);
//  4. roda na hora o que inscreveu/acordou (o resto o relógio pega).
// Anti-loop: evento causado por automação com cadeia ≥ 3 não inscreve; fica
// uma execução cancelada "Loop detectado" no histórico, visível.
// ---------------------------------------------------------------------------

export const PROFUNDIDADE_MAXIMA = 3;
const RODAR_NA_HORA = 10;

type Registro = Record<string, unknown> | null;

async function fotoDoEvento(e: EventoPublicado): Promise<Registro> {
  if (e.objeto === "deal" || e.objeto === "contact" || e.objeto === "company") return fotoDoRegistro(e.orgId, e.objeto, e.objetoId);
  if (e.objeto === "task") {
    const t = await prisma.task.findFirst({ where: { id: e.objetoId, orgId: e.orgId } });
    if (!t) return null;
    const { serializarTarefa } = await import("@/lib/server/api-v1/tarefas-notas");
    return { ...serializarTarefa(t), type: t.type } as Record<string, unknown>; // tipo gravado: é o que as regras comparam
  }
  return null;
}

export async function paraAutomacoes(e: EventoPublicado): Promise<void> {
  let automacoes;
  try {
    automacoes = await prisma.automacao.findMany({
      where: { orgId: e.orgId, status: "ativa", versaoPublicadaId: { not: null }, objeto: e.objeto },
      include: { versaoPublicada: { select: { definicao: true } } },
    });
  } catch {
    return; // Sem as tabelas das automações: nada a fazer.
  }

  const rodar: string[] = [];
  let registro: Registro | undefined;
  const registroDoEvento = async () => (registro === undefined ? (registro = await fotoDoEvento(e)) : registro);
  const profundidade = e.ator.tipo === "automacao" ? (e.ator.profundidade ?? 1) : 0;

  for (const a of automacoes) {
    const def = a.versaoPublicada?.definicao as unknown as Definicao | undefined;
    const gatilho = def?.gatilho as Gatilho | null | undefined;
    if (!gatilho) continue;
    const c = gatilho.config ?? {};
    const precisaRegistro = !!(c.motivo || c.tipo_tarefa || c.funil);
    if (!gatilhoCasa(gatilho, e, { automacaoId: a.id, registro: precisaRegistro ? await registroDoEvento() : null })) continue;

    // A própria automação no mesmo registro: nunca redispara a si mesma.
    if (e.ator.tipo === "automacao" && e.ator.automacaoId === a.id) continue;

    const base = { origem: e.id ?? `${e.tipo}:${e.criadoEm.getTime()}`, eventoId: e.id, gatilho: { tipo: e.tipo, ...e.dados, ...(e.diff ? { diff: e.diff } : {}) }, profundidade };
    if (profundidade >= PROFUNDIDADE_MAXIMA) {
      await inscrever(a, e.objetoId, {
        ...base,
        status: "cancelada",
        erro: `Loop detectado: ${profundidade} automações em cadeia dispararam esta. Parou aqui para não repetir sem fim.`,
      }).catch(() => {});
      continue;
    }
    const intervaloMin = Number(c.intervalo_min) || undefined;
    const r = await inscrever(a, e.objetoId, { ...base, intervaloMin });
    if (r.inscrita) rodar.push(r.execucaoId);
  }

  rodar.push(...(await acordarEsperas(e, await registroDoEvento().catch(() => null))));

  for (const id of rodar.slice(0, RODAR_NA_HORA)) await executarExecucao(id).catch((err) => console.error("[automacoes] execução falhou", id, err));
}

/** "Esperar evento" e objetivo: acorda as execuções que dependem deste evento. */
async function acordarEsperas(e: EventoPublicado, registro: Registro): Promise<string[]> {
  const alvos = alvosDoEvento(e, registro);
  // O contato toca também os negócios abertos dele ("esperar o cliente responder" num fluxo de negócio).
  const contato = alvos.find((a) => a.objeto === "contact");
  if (contato) {
    const negocios = await prisma.deal
      .findMany({ where: { orgId: e.orgId, closedAt: null, contacts: { some: { contactId: contato.id } } }, select: { id: true }, take: 20 })
      .catch(() => []);
    for (const n of negocios) if (!alvos.some((a) => a.objeto === "deal" && a.id === n.id)) alvos.push({ objeto: "deal", id: n.id });
  }

  const acordadas: string[] = [];
  try {
    const esperas = await prisma.automacaoEspera.findMany({
      where: { orgId: e.orgId, tipo: e.tipo, OR: alvos.map((a) => ({ objeto: a.objeto, objetoId: a.id })) },
      take: 100,
    });
    for (const w of esperas) {
      const exec = await prisma.automacaoExecucao.findUnique({ where: { id: w.execucaoId }, select: { variaveis: true, status: true } });
      if (!exec || exec.status !== "esperando") continue;
      const v = (exec.variaveis ?? {}) as { __espera?: Record<string, unknown> };
      const apagou = await prisma.automacaoEspera.deleteMany({ where: { id: w.id } });
      if (apagou.count === 0) continue; // outro evento já acordou
      await prisma.automacaoExecucao.update({
        where: { id: w.execucaoId },
        data: { variaveis: { ...v, __espera: { ...(v.__espera ?? {}), noId: w.noId, resultado: "aconteceu", evento: { tipo: e.tipo, ...e.dados } } } as object, proximaEm: new Date() },
      });
      acordadas.push(w.execucaoId);
    }

    // Objetivo: quem está esperando num destes registros, numa automação com objetivo, volta para conferir.
    const comObjetivo = await prisma.automacaoExecucao.findMany({
      where: {
        orgId: e.orgId,
        status: "esperando",
        OR: alvos.map((a) => ({ objeto: a.objeto, objetoId: a.id })),
      },
      select: { id: true, automacao: { select: { objetivo: true } } },
      take: 100,
    });
    const ids = comObjetivo.filter((x) => x.automacao.objetivo !== null && !acordadas.includes(x.id)).map((x) => x.id);
    if (ids.length) {
      await prisma.automacaoExecucao.updateMany({ where: { id: { in: ids }, status: "esperando" }, data: { proximaEm: new Date() } });
      acordadas.push(...ids);
    }
  } catch {
    // Sem as tabelas: nada esperando.
  }
  return acordadas;
}
