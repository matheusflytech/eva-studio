import type { CategoryColor } from "@/lib/design-system/tokens";
import type { CalendarEventDto } from "@/lib/google-calendar/slots";
import { diaDaSemana, diaEmSP, minutoDoDia, somarDias, type Dia } from "@/lib/tarefas/calendario";
import { ehDiaTodo, tarefaEstaAtrasada } from "@/lib/tarefas/agrupar";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import type { TipoDeTarefa } from "@/lib/tarefas/tipos";

// Dados do Calendário de Tarefas, sem React (testável). O calendário não
// desenha tarefas: desenha EVENTOS. Fontes: as tarefas (eventosDasTarefas) e
// os fechamentos previstos dos negócios abertos (eventosDosNegocios); quando a
// agenda da pessoa (Google Agenda, Outlook) for espelhada, entra outra fonte
// que devolve EventoDoCalendario com origem "agenda", e a grade, o resumo do
// dia e o painel lateral não mudam.
// Tudo no relógio de São Paulo; semana começa no domingo (como o calendário
// de parede).

export type OrigemDoEvento = "tarefa" | "negocio" | "agenda";

/** O negócio por trás de um fechamento previsto (origem "negocio"). */
export interface NegocioDoEvento {
  id: string;
  valorCents: number;
  etapa: string;
  funil: string;
  empresa: string | null;
}

export interface EventoDoCalendario {
  id: string;
  titulo: string;
  inicio: Date;
  /** Fim estimado (tarefa: início + duração; agenda: o fim do evento). */
  fim: Date | null;
  diaTodo: boolean;
  origem: OrigemDoEvento;
  /** Cor de dado (agenda externa: a cor da agenda dela). Tarefa usa o estado (aberta, atrasada, feita). */
  cor?: CategoryColor;
  /** Tipo da tarefa (ícone e "reuniões" no resumo); evento de agenda sem tipo conta como compromisso. */
  tipo: TipoDeTarefa | null;
  atrasada: boolean;
  feita: boolean;
  /** A tarefa original (para concluir, adiar etc. no painel do dia). */
  tarefa: TarefaDaTela | null;
  /** Fechamento previsto: o negócio (link para a ficha, valor e etapa). */
  negocio?: NegocioDoEvento;
  /** Evento do Google Agenda: de que agenda, de quem e os links. */
  agenda?: AgendaDoEvento;
}

export interface AgendaDoEvento {
  calendario: string;
  dono: string;
  minha: boolean;
  link: string | null;
  reuniao: string | null;
}

export const SEMANA_CURTA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"] as const;
export const NOMES_DOS_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;
const DIAS_DA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export interface Mes {
  ano: number;
  /** 1–12 */
  mes: number;
}

const dois = (n: number) => String(n).padStart(2, "0");

/** "2026-10-23": chave estável do dia (mapa de eventos, dia aberto no painel). */
export function chaveDoDia(d: Dia): string {
  return `${d.ano}-${dois(d.mes)}-${dois(d.dia)}`;
}

export function diaDaChave(chave: string): Dia {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return { ano, mes, dia };
}

export function somarMeses(m: Mes, n: number): Mes {
  const total = m.ano * 12 + (m.mes - 1) + n;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/** −1, 0 ou 1: de que lado b fica em relação a a (direção da animação). */
export function compararMeses(a: Mes, b: Mes): number {
  return Math.sign(b.ano * 12 + b.mes - (a.ano * 12 + a.mes));
}

/** Semanas (domingo a sábado) que cobrem o mês: 4 a 6 linhas de 7 dias. */
export function semanasDoMes(m: Mes): Dia[][] {
  const primeiro: Dia = { ano: m.ano, mes: m.mes, dia: 1 };
  const diasNoMes = new Date(Date.UTC(m.ano, m.mes, 0)).getUTCDate();
  const antes = diaDaSemana(primeiro);
  const linhas = Math.ceil((antes + diasNoMes) / 7);
  const inicio = somarDias(primeiro, -antes);
  return Array.from({ length: linhas }, (_, s) => Array.from({ length: 7 }, (_, d) => somarDias(inicio, s * 7 + d)));
}

/** Primeiro e último dia (AAAA-MM-DD, SP) da grade do mês: o intervalo que o calendário busca. */
export function intervaloDaGrade(m: Mes): { de: string; ate: string } {
  const semanas = semanasDoMes(m);
  return { de: chaveDoDia(semanas[0][0]), ate: chaveDoDia(semanas[semanas.length - 1][6]) };
}

/** O que o calendário lê de cada negócio (POST /api/deals/busca). */
export interface NegocioComPrevisao {
  id: string;
  name: string;
  amountCents: number;
  expectedClosingAt: string | null;
  stage: { name: string };
  pipeline?: { name: string } | null;
  company?: { name: string } | null;
}

/** Adaptador: negócios abertos com previsão → fechamentos previstos (dia todo). */
export function eventosDosNegocios(negocios: NegocioComPrevisao[]): EventoDoCalendario[] {
  const eventos: EventoDoCalendario[] = [];
  for (const n of negocios) {
    if (!n.expectedClosingAt) continue;
    eventos.push({
      id: `negocio:${n.id}`,
      titulo: n.name,
      inicio: new Date(n.expectedClosingAt),
      fim: null,
      diaTodo: true,
      origem: "negocio",
      tipo: null,
      atrasada: false,
      feita: false,
      tarefa: null,
      negocio: { id: n.id, valorCents: n.amountCents, etapa: n.stage.name, funil: n.pipeline?.name ?? "", empresa: n.company?.name ?? null },
    });
  }
  return eventos;
}

/** Adaptador: eventos do Google Agenda → eventos (origem "agenda", na cor da agenda). */
export function eventosDaAgenda(lista: CalendarEventDto[]): EventoDoCalendario[] {
  return lista.map((e) => ({
    id: `agenda:${e.key}`,
    titulo: e.title,
    inicio: new Date(e.start),
    fim: e.end ? new Date(e.end) : null,
    diaTodo: e.allDay,
    origem: "agenda",
    cor: e.color,
    tipo: null,
    atrasada: false,
    feita: false,
    tarefa: null,
    agenda: { calendario: e.calendar, dono: e.owner, minha: e.mine, link: e.link, reuniao: e.meet },
  }));
}

/** Adaptador: tarefas com prazo → eventos. Sem prazo não tem dia no calendário. */
export function eventosDasTarefas(tarefas: TarefaDaTela[], agora: Date): EventoDoCalendario[] {
  const eventos: EventoDoCalendario[] = [];
  for (const t of tarefas) {
    if (!t.dueAt) continue;
    const inicio = new Date(t.dueAt);
    const diaTodo = ehDiaTodo(inicio, t.diaTodo);
    eventos.push({
      id: `tarefa:${t.id}`,
      titulo: t.text,
      inicio,
      fim: diaTodo ? null : new Date(inicio.getTime() + Math.max(0, t.duracaoMin) * 60_000),
      diaTodo,
      origem: "tarefa",
      tipo: t.type,
      feita: !!t.doneAt,
      atrasada: t.overdue || tarefaEstaAtrasada(t, agora),
      tarefa: t,
    });
  }
  return eventos;
}

/** Ordem dentro do dia: dia todo primeiro, depois pela hora; feitas no fim. */
function ordemDoDia(a: EventoDoCalendario, b: EventoDoCalendario): number {
  if (a.feita !== b.feita) return a.feita ? 1 : -1;
  if (a.diaTodo !== b.diaTodo) return a.diaTodo ? -1 : 1;
  return a.inicio.getTime() - b.inicio.getTime();
}

/** Eventos por dia de SP (chaveDoDia), já ordenados. */
export function agruparPorDia(eventos: EventoDoCalendario[]): Map<string, EventoDoCalendario[]> {
  const mapa = new Map<string, EventoDoCalendario[]>();
  for (const e of eventos) {
    const chave = chaveDoDia(diaEmSP(e.inicio));
    const lista = mapa.get(chave);
    if (lista) lista.push(e);
    else mapa.set(chave, [e]);
  }
  for (const lista of mapa.values()) lista.sort(ordemDoDia);
  return mapa;
}

export interface ResumoDoDia {
  /** Tarefas em aberto (inclui as atrasadas). */
  tarefas: number;
  atrasadas: number;
  /** Tarefas de reunião em aberto. */
  reunioes: number;
  /** Fechamentos previstos de negócios abertos. */
  fechamentos: number;
  /** Soma dos valores dos fechamentos previstos. */
  valorCents: number;
  /** Eventos da agenda externa (quando houver). */
  agenda: number;
  feitas: number;
  total: number;
}

export function resumirDia(eventos: EventoDoCalendario[]): ResumoDoDia {
  const r: ResumoDoDia = { tarefas: 0, atrasadas: 0, reunioes: 0, fechamentos: 0, valorCents: 0, agenda: 0, feitas: 0, total: eventos.length };
  for (const e of eventos) {
    if (e.origem === "negocio") {
      r.fechamentos++;
      r.valorCents += e.negocio?.valorCents ?? 0;
      continue;
    }
    if (e.origem === "agenda") {
      r.agenda++;
      continue;
    }
    if (e.feita) {
      r.feitas++;
      continue;
    }
    r.tarefas++;
    if (e.atrasada) r.atrasadas++;
    if (e.tipo === "reuniao") r.reunioes++;
  }
  return r;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Pedaços do resumo ("3 tarefas", "1 reunião", "1 atrasada"), na ordem de leitura. */
export function partesDoResumo(r: ResumoDoDia): { texto: string; tom: "normal" | "danger" }[] {
  const partes: { texto: string; tom: "normal" | "danger" }[] = [];
  if (r.tarefas) partes.push({ texto: plural(r.tarefas, "tarefa", "tarefas"), tom: "normal" });
  if (r.reunioes) partes.push({ texto: plural(r.reunioes, "reunião", "reuniões"), tom: "normal" });
  if (r.fechamentos) partes.push({ texto: plural(r.fechamentos, "fechamento", "fechamentos"), tom: "normal" });
  if (r.agenda) partes.push({ texto: plural(r.agenda, "na agenda", "na agenda"), tom: "normal" });
  if (r.atrasadas) partes.push({ texto: plural(r.atrasadas, "atrasada", "atrasadas"), tom: "danger" });
  if (!partes.length && r.feitas) partes.push({ texto: plural(r.feitas, "feita", "feitas"), tom: "normal" });
  return partes;
}

export function textoDoResumo(r: ResumoDoDia): string {
  const partes = partesDoResumo(r).map((p) => p.texto);
  return partes.length ? partes.join(" · ") : "Nada marcado";
}

/** 0 (nada em aberto) a 3 (dia cheio): quanto o cartão do dia se tinge. */
export function densidade(r: ResumoDoDia): 0 | 1 | 2 | 3 {
  const n = r.tarefas + r.fechamentos + r.agenda;
  if (n === 0) return 0;
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  return 3;
}

/** "quinta-feira, 23 de outubro" */
export function tituloDoDia(d: Dia): string {
  return `${DIAS_DA_SEMANA[diaDaSemana(d)]}, ${d.dia} de ${NOMES_DOS_MESES[d.mes - 1].toLowerCase()}`;
}

/** "14:00" no relógio de SP. */
export function horaDoEvento(e: EventoDoCalendario): string {
  const m = minutoDoDia(e.inicio);
  return `${dois(Math.floor(m / 60))}:${dois(m % 60)}`;
}
