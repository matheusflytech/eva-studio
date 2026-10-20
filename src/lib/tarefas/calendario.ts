import { deParedeSP, partesEmSP } from "@/lib/fuso-sp";

// ---------------------------------------------------------------------------
// Calendário de São Paulo para as tarefas: "hoje", "amanhã", "segunda" e
// "esta semana" são dias do relógio de SP, não do servidor (UTC) nem do
// navegador. Semana começa na segunda (como o vendedor fala "esta semana").
// ---------------------------------------------------------------------------

export interface Dia {
  ano: number;
  mes: number;
  dia: number;
}

/** Dia do calendário de SP em que o instante cai. */
export function diaEmSP(instante: Date): Dia {
  const p = partesEmSP(instante);
  return { ano: p.ano, mes: p.mes, dia: p.dia };
}

/** Soma (ou subtrai) dias de calendário. */
export function somarDias(d: Dia, n: number): Dia {
  // Meio-dia UTC: a soma nunca cruza borda de fuso.
  const t = new Date(Date.UTC(d.ano, d.mes - 1, d.dia + n, 12));
  return { ano: t.getUTCFullYear(), mes: t.getUTCMonth() + 1, dia: t.getUTCDate() };
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(d: Dia): number {
  return new Date(Date.UTC(d.ano, d.mes - 1, d.dia, 12)).getUTCDay();
}

/** Instante do dia de SP na hora pedida. */
export function noDia(d: Dia, hora = 0, minuto = 0): Date {
  return deParedeSP(d.ano, d.mes, d.dia, hora, minuto);
}

export function mesmoDia(a: Dia, b: Dia): boolean {
  return a.ano === b.ano && a.mes === b.mes && a.dia === b.dia;
}

/** Diferença em dias de calendário (b − a). */
export function diasEntre(a: Dia, b: Dia): number {
  return Math.round((Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / 86_400_000);
}

/** Próxima ocorrência do dia da semana (0–6), sempre depois de hoje. */
export function proximoDiaDaSemana(hoje: Dia, alvo: number): Dia {
  const atual = diaDaSemana(hoje);
  const n = ((alvo - atual + 7) % 7) || 7;
  return somarDias(hoje, n);
}

/** Domingo que fecha a semana (segunda a domingo) do dia. */
export function fimDaSemana(d: Dia): Dia {
  const dow = diaDaSemana(d);
  return somarDias(d, dow === 0 ? 0 : 7 - dow);
}

/** Minutos desde a meia-noite de SP. */
export function minutoDoDia(instante: Date): number {
  const p = partesEmSP(instante);
  return p.hora * 60 + p.minuto;
}
