import type { CategoryColor } from "@/lib/design-system/tokens";
import { deParedeSP, partesEmSP } from "@/lib/fuso-sp";
import { diaDaSemana, type Dia } from "@/lib/tarefas/calendario";

// Horários livres para a IA marcar reunião (bloco "Agenda Google"), sem
// React nem Google (testável). Tudo no relógio de São Paulo.

export interface BusinessHours {
  /** Dias da semana atendidos (0 = domingo). */
  days: number[];
  /** "09:00" */
  start: string;
  /** "18:00" */
  end: string;
  durationMin: number;
}

/** Evento do Google como o calendário de Tarefas recebe (/api/integrations/google-calendar/events). */
export interface CalendarEventDto {
  key: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  link: string | null;
  meet: string | null;
  color: CategoryColor;
  calendar: string;
  owner: string;
  mine: boolean;
}

export interface Busy {
  start: Date;
  end: Date;
}

/** Antecedência mínima para marcar: ninguém recebe reunião daqui a 5 minutos. */
export const MIN_LEAD_MIN = 60;

const minutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

const overlaps = (a: Busy, b: Busy) => a.start < b.end && b.start < a.end;

/** Começos livres do dia, de `durationMin` em `durationMin` (no máximo de 30 em 30). */
export function freeSlots(day: Dia, hours: BusinessHours, busy: Busy[], now: Date): Date[] {
  const from = minutes(hours.start);
  const to = minutes(hours.end);
  const dur = Math.max(5, hours.durationMin);
  if (!hours.days.includes(diaDaSemana(day)) || !(from < to)) return [];
  const step = Math.min(dur, 30);
  const earliest = now.getTime() + MIN_LEAD_MIN * 60_000;
  const out: Date[] = [];
  for (let m = from; m + dur <= to; m += step) {
    const start = deParedeSP(day.ano, day.mes, day.dia, Math.floor(m / 60), m % 60);
    const slot = { start, end: new Date(start.getTime() + dur * 60_000) };
    if (start.getTime() >= earliest && !busy.some((b) => overlaps(slot, b))) out.push(start);
  }
  return out;
}

/** Por que não dá para marcar neste horário (null = pode). */
export function whyNot(start: Date, hours: BusinessHours, busy: Busy[], now: Date): string | null {
  const p = partesEmSP(start);
  const day = { ano: p.ano, mes: p.mes, dia: p.dia };
  const m = p.hora * 60 + p.minuto;
  const end = new Date(start.getTime() + hours.durationMin * 60_000);
  if (start.getTime() < now.getTime() + MIN_LEAD_MIN * 60_000) return "horário no passado ou muito em cima";
  if (!hours.days.includes(diaDaSemana(day)) || m < minutes(hours.start) || m + hours.durationMin > minutes(hours.end)) {
    return "fora do horário de atendimento";
  }
  if (busy.some((b) => overlaps({ start, end }, b))) return "horário ocupado";
  return null;
}

// Cores do Google Agenda → cores de dado do design system (pelo matiz).
const HUES: [number, CategoryColor][] = [
  [0, "red"], [20, "orange"], [42, "amber"], [140, "green"], [178, "teal"],
  [195, "cyan"], [215, "blue"], [235, "indigo"], [265, "violet"], [290, "purple"], [335, "rose"], [360, "red"],
];

export function categoryFromHex(hex: string | null | undefined): CategoryColor {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return "blue";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.12) return "slate";
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  let best = HUES[0];
  for (const c of HUES) if (Math.abs(c[0] - h) < Math.abs(best[0] - h)) best = c;
  return best[1];
}
