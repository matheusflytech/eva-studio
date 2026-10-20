import { diaEmSP, diasEntre, fimDaSemana, minutoDoDia } from "./calendario";
import { HORA_DIA_TODO } from "./quick-add";

// ---------------------------------------------------------------------------
// Grupos da tela de tarefas (skill crm-tasks-agenda, E7): Atrasadas · Hoje ·
// Amanhã · Esta semana · Depois · Sem data · Concluídas. Dias de SP; semana
// de segunda a domingo. Tarefa de dia todo só atrasa quando o dia acaba.
// ---------------------------------------------------------------------------

export const GRUPOS = ["atrasadas", "hoje", "amanha", "semana", "depois", "sem_data", "concluidas"] as const;
export type GrupoDeTarefa = (typeof GRUPOS)[number];

export const ROTULO_DO_GRUPO: Record<GrupoDeTarefa, string> = {
  atrasadas: "Atrasadas",
  hoje: "Hoje",
  amanha: "Amanhã",
  semana: "Esta semana",
  depois: "Depois",
  sem_data: "Sem data",
  concluidas: "Concluídas",
};

export interface TarefaParaAgrupar {
  dueAt: Date | string | null;
  doneAt: Date | string | null;
  /** undefined/null = deduzido da hora (23:59 de SP = dia todo). */
  diaTodo?: boolean | null;
}

const comoData = (v: Date | string) => (typeof v === "string" ? new Date(v) : v);

/** Dia todo explícito, ou deduzido da hora gravada (funciona sem a tabela de detalhes). */
export function ehDiaTodo(dueAt: Date | string | null, diaTodo?: boolean | null): boolean {
  if (typeof diaTodo === "boolean") return diaTodo;
  if (!dueAt) return false;
  return minutoDoDia(comoData(dueAt)) === HORA_DIA_TODO.hora * 60 + HORA_DIA_TODO.minuto;
}

export function tarefaEstaAtrasada(t: TarefaParaAgrupar, agora: Date): boolean {
  if (t.doneAt || !t.dueAt) return false;
  const due = comoData(t.dueAt);
  if (ehDiaTodo(due, t.diaTodo)) return diasEntre(diaEmSP(due), diaEmSP(agora)) > 0;
  return due.getTime() < agora.getTime();
}

export function grupoDaTarefa(t: TarefaParaAgrupar, agora: Date): GrupoDeTarefa {
  if (t.doneAt) return "concluidas";
  if (!t.dueAt) return "sem_data";
  if (tarefaEstaAtrasada(t, agora)) return "atrasadas";
  const hoje = diaEmSP(agora);
  const dia = diaEmSP(comoData(t.dueAt));
  const delta = diasEntre(hoje, dia);
  if (delta <= 0) return "hoje";
  if (delta === 1) return "amanha";
  if (diasEntre(dia, fimDaSemana(hoje)) >= 0) return "semana";
  return "depois";
}

export interface GrupoMontado<T> {
  grupo: GrupoDeTarefa;
  rotulo: string;
  itens: T[];
}

/** Grupos na ordem da tela, só os que têm itens. Dentro: prazo crescente; concluídas: mais recente primeiro. */
export function agruparTarefas<T extends TarefaParaAgrupar>(tarefas: T[], agora: Date): GrupoMontado<T>[] {
  const mapa = new Map<GrupoDeTarefa, T[]>();
  for (const t of tarefas) {
    const g = grupoDaTarefa(t, agora);
    const l = mapa.get(g) ?? [];
    l.push(t);
    mapa.set(g, l);
  }
  const tempo = (v: Date | string | null) => (v ? comoData(v).getTime() : Number.POSITIVE_INFINITY);
  return GRUPOS.filter((g) => mapa.has(g)).map((g) => {
    const itens = [...mapa.get(g)!];
    if (g === "concluidas") itens.sort((a, b) => tempo(b.doneAt) - tempo(a.doneAt));
    else itens.sort((a, b) => tempo(a.dueAt) - tempo(b.dueAt));
    return { grupo: g, rotulo: ROTULO_DO_GRUPO[g], itens };
  });
}
