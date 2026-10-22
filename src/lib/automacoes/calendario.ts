import { partesEmSP } from "@/lib/fuso-sp";
import { diaDaSemana, diaEmSP, noDia, somarDias, type Dia } from "@/lib/tarefas/calendario";
import type { Unidade } from "./tipos";

// ---------------------------------------------------------------------------
// Tempo das automações, sempre no relógio de São Paulo: dias úteis (seg–sex,
// sem feriado nacional), horário comercial para falar com o cliente e o
// cálculo das esperas. Feriados: os nacionais fixos + Sexta-feira Santa.
// Carnaval e Corpus Christi são ponto facultativo: contam como dia útil.
// ---------------------------------------------------------------------------

const FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): Dia {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { ano, mes, dia };
}

const dd = (n: number) => String(n).padStart(2, "0");

export function ehFeriado(d: Dia): boolean {
  if (FIXOS.includes(`${dd(d.mes)}-${dd(d.dia)}`)) return true;
  const santa = somarDias(pascoa(d.ano), -2);
  return santa.mes === d.mes && santa.dia === d.dia;
}

export function ehDiaUtil(d: Dia): boolean {
  const dow = diaDaSemana(d);
  return dow !== 0 && dow !== 6 && !ehFeriado(d);
}

/** Mesmo horário de parede, `n` dias úteis depois (o dia de hoje não conta). */
export function somarDiasUteis(instante: Date, n: number): Date {
  const p = partesEmSP(instante);
  let d = diaEmSP(instante);
  let faltam = Math.max(0, Math.floor(n));
  while (faltam > 0) {
    d = somarDias(d, 1);
    if (ehDiaUtil(d)) faltam--;
  }
  return noDia(d, p.hora, p.minuto);
}

const MS: Record<Exclude<Unidade, "dias_uteis">, number> = { minutos: 60_000, horas: 3_600_000, dias: 86_400_000 };

/** Fim de uma duração ("2 dias úteis", "30 minutos") a partir de agora. */
export function fimDaDuracao(agora: Date, quantidade: number, unidade: Unidade): Date {
  if (unidade === "dias_uteis") return somarDiasUteis(agora, quantidade);
  return new Date(agora.getTime() + quantidade * MS[unidade]);
}

// ---- horário comercial (para falar com o cliente) ----

export interface Janela {
  /** Dias da semana permitidos (0 = domingo). */
  dias: number[];
  inicio: number; // hora cheia, inclusive
  fim: number; // hora cheia, exclusive
}

/** Seg–sáb, 8h–20h, sem feriado (guardrail do catálogo). */
export const JANELA_PADRAO: Janela = { dias: [1, 2, 3, 4, 5, 6], inicio: 8, fim: 20 };

export function dentroDaJanela(instante: Date, j: Janela = JANELA_PADRAO): boolean {
  const d = diaEmSP(instante);
  const p = partesEmSP(instante);
  return j.dias.includes(diaDaSemana(d)) && !ehFeriado(d) && p.hora >= j.inicio && p.hora < j.fim;
}

/** Agora, se já está na janela; senão o próximo começo dela (no máximo 14 dias à frente). */
export function proximaJanela(instante: Date, j: Janela = JANELA_PADRAO): Date {
  if (dentroDaJanela(instante, j)) return instante;
  let d = diaEmSP(instante);
  const p = partesEmSP(instante);
  // Hoje ainda dá, se é dia permitido e antes do começo.
  if (j.dias.includes(diaDaSemana(d)) && !ehFeriado(d) && p.hora < j.inicio) return noDia(d, j.inicio, 0);
  for (let i = 0; i < 14; i++) {
    d = somarDias(d, 1);
    if (j.dias.includes(diaDaSemana(d)) && !ehFeriado(d)) return noDia(d, j.inicio, 0);
  }
  return instante;
}

/** Campos de "agora" que as condições enxergam (`sistema.*`). */
export function sistemaAgora(instante: Date) {
  const d = diaEmSP(instante);
  const p = partesEmSP(instante);
  return {
    agora: instante.toISOString(),
    dia_util: ehDiaUtil(d),
    horario_comercial: dentroDaJanela(instante),
    dia_semana: diaDaSemana(d),
    hora: p.hora,
  };
}
