import "server-only";
import { prisma } from "@/lib/db/prisma";
import { tabelaAusente } from "@/lib/server/layout-do-cartao";

// ---------------------------------------------------------------------------
// Detalhes da tarefa (eva_studio_task_details, prisma/sql/2026-10-20-tarefas.sql):
// dia todo, prioridade, duração, origem e a conclusão (resultado, nota,
// decisão do próximo passo). Tabela à parte, 1:1 com a tarefa.
//
// Nunca derruba quem chamou: sem a tabela (SQL ainda não aplicado) a leitura
// volta vazia (cada tarefa usa o padrão) e a escrita é ignorada.
// ---------------------------------------------------------------------------

export interface DetalheDaTarefa {
  allDay: boolean;
  priority: string;
  durationMin: number | null;
  origin: string;
  outcome: string | null;
  outcomeNote: string | null;
  nextStepDecision: string | null;
  nextTaskId: string | null;
  snoozedCount: number;
}

export type DadosDoDetalhe = Partial<Omit<DetalheDaTarefa, "snoozedCount">> & { completedById?: string | null };

export async function lerDetalhes(taskIds: string[]): Promise<{ disponivel: boolean; mapa: Map<string, DetalheDaTarefa> }> {
  const mapa = new Map<string, DetalheDaTarefa>();
  const ids = [...new Set(taskIds.filter(Boolean))];
  if (ids.length === 0) return { disponivel: true, mapa };
  try {
    const linhas = await prisma.taskDetail.findMany({ where: { taskId: { in: ids } } });
    for (const l of linhas) {
      mapa.set(l.taskId, {
        allDay: l.allDay,
        priority: l.priority,
        durationMin: l.durationMin,
        origin: l.origin,
        outcome: l.outcome,
        outcomeNote: l.outcomeNote,
        nextStepDecision: l.nextStepDecision,
        nextTaskId: l.nextTaskId,
        snoozedCount: l.snoozedCount,
      });
    }
    return { disponivel: true, mapa };
  } catch (e) {
    if (!tabelaAusente(e)) console.warn("[tarefas] detalhes indisponíveis", e instanceof Error ? e.message : e);
    return { disponivel: false, mapa };
  }
}

/** Grava (upsert) os detalhes. false = tabela ausente ou falha (a tarefa segue sem eles). */
export async function gravarDetalhes(
  task: { id: string; orgId: string },
  dados: DadosDoDetalhe,
  opcoes: { contarAdiamento?: boolean } = {}
): Promise<boolean> {
  const limpo = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined));
  try {
    await prisma.taskDetail.upsert({
      where: { taskId: task.id },
      create: { taskId: task.id, orgId: task.orgId, ...limpo, snoozedCount: opcoes.contarAdiamento ? 1 : 0 },
      update: { ...limpo, ...(opcoes.contarAdiamento ? { snoozedCount: { increment: 1 } } : {}) },
    });
    return true;
  } catch (e) {
    if (!tabelaAusente(e)) console.warn("[tarefas] não foi possível gravar os detalhes", e instanceof Error ? e.message : e);
    return false;
  }
}
