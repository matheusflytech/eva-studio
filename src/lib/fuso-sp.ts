// ---------------------------------------------------------------------------
// Horário de São Paulo, independente do fuso do navegador.
//
// O <input type="datetime-local"> devolve "2026-10-20T09:00" sem fuso, e
// `new Date(...)` lê isso no fuso de quem está com a tela aberta. Um atendente
// viajando (ou um navegador com fuso errado) agendaria "9h" para outra hora.
// Aqui o campo é sempre lido e escrito como America/Sao_Paulo. O offset é
// calculado pelo Intl (não fixo em -3), então continua certo se o horário de
// verão voltar.
// ---------------------------------------------------------------------------

export const FUSO_SP = "America/Sao_Paulo";

const partes = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_SP,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface Partes {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

export function partesEmSP(data: Date): Partes {
  const p: Record<string, string> = {};
  for (const { type, value } of partes.formatToParts(data)) p[type] = value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** Diferença (ms) entre o relógio de SP e o UTC naquele instante. */
function offsetSP(instante: Date): number {
  const p = partesEmSP(instante);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

export function deParedeSP(ano: number, mes: number, dia: number, hora: number, minuto: number, segundo = 0): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  // Duas passadas resolvem a borda de troca de offset.
  let t = comoUtc - offsetSP(new Date(comoUtc));
  t = comoUtc - offsetSP(new Date(t));
  return new Date(t);
}

/** "2026-10-20T09:00" (horário de SP) → instante. null se inválido. */
export function deSaoPaulo(valor: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor?.trim() ?? "");
  if (!m) return null;
  const [ano, mes, dia, hora, minuto, segundo] = m.slice(1).map((x) => Number(x ?? 0));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59 || segundo > 59) return null;
  const data = deParedeSP(ano, mes, dia, hora, minuto, segundo);
  // 31/02 e afins: o Date "rola" pro mês seguinte; isso é entrada inválida.
  const volta = partesEmSP(data);
  if (volta.dia !== dia || volta.mes !== mes) return null;
  return data;
}

const dois = (n: number) => String(n).padStart(2, "0");

/** Instante → valor do campo datetime-local em horário de SP. */
export function paraCampoSaoPaulo(data: Date): string {
  const p = partesEmSP(data);
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}`;
}

/** "20/10/2026 às 09:00". */
export function formatarSaoPaulo(data: Date | string): string {
  const p = partesEmSP(typeof data === "string" ? new Date(data) : data);
  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano} às ${dois(p.hora)}:${dois(p.minuto)}`;
}

/** Amanhã (no calendário de SP) na hora cheia pedida. */
export function amanhaAs(hora: number, agora: Date = new Date()): Date {
  const p = partesEmSP(agora);
  // Meio-dia evita qualquer borda de offset ao somar um dia.
  const amanha = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + 1, 12));
  return deParedeSP(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate(), hora, 0);
}

/** Daqui a N minutos, com segundos zerados (o campo não mostra segundos). */
export function daquiA(minutos: number, agora: Date = new Date()): Date {
  const t = agora.getTime() + minutos * 60_000;
  return new Date(Math.floor(t / 60_000) * 60_000);
}
