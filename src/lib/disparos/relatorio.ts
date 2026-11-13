// Contas do relatório de disparos (funções puras; a rota busca os dados).

import { inicioDoDiaEmBrasilia } from "./situacao";

export const METRICAS = ["enviados", "entregues", "lidos", "falhas", "respostas"] as const;
export type Metrica = (typeof METRICAS)[number];
export type Totais = Record<Metrica, number>;

export const ROTULO_DA_METRICA: Record<Metrica, string> = {
  enviados: "Enviados",
  entregues: "Entregues",
  lidos: "Lidos",
  falhas: "Não chegaram",
  respostas: "Responderam",
};

const DIA_MS = 86400_000;

/** Período de N dias (Brasília) que termina hoje, e o período anterior de mesmo tamanho. */
export function periodo(dias: number, agora = new Date()) {
  const n = Math.min(90, Math.max(1, Math.floor(dias) || 7));
  const hoje = inicioDoDiaEmBrasilia(agora);
  const de = new Date(hoje.getTime() - (n - 1) * DIA_MS);
  const ate = new Date(hoje.getTime() + DIA_MS);
  return { dias: n, de, ate, antesDe: new Date(de.getTime() - n * DIA_MS), antesAte: de };
}

/** Os dias do período no formato YYYY-MM-DD (Brasília), em ordem. */
export function diasDoPeriodo(de: Date, dias: number): string[] {
  return Array.from({ length: dias }, (_, i) => new Date(de.getTime() + i * DIA_MS - 3 * 3600_000).toISOString().slice(0, 10));
}

/** Linhas {metrica, dia, total} do banco viram uma série por dia, com zero onde não houve nada. */
export function seriePorDia(linhas: { metrica: string; dia: string; total: number | bigint }[], dias: string[]) {
  const mapa = new Map<string, number>();
  for (const l of linhas) mapa.set(`${l.metrica}|${l.dia}`, Number(l.total));
  return dias.map((dia) => ({
    dia,
    ...(Object.fromEntries(METRICAS.map((m) => [m, mapa.get(`${m}|${dia}`) ?? 0])) as Totais),
  }));
}

export function somar(serie: Totais[]): Totais {
  const t = Object.fromEntries(METRICAS.map((m) => [m, 0])) as Totais;
  for (const d of serie) for (const m of METRICAS) t[m] += d[m];
  return t;
}

/** Variação em relação ao período anterior: null quando antes era zero (não dá para dizer %). */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (atual - anterior) / anterior;
}

/** Taxa segura (0 quando o denominador é 0). */
export const taxa = (parte: number, todo: number) => (todo > 0 ? parte / todo : 0);
