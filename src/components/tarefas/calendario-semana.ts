import { diaDaSemana, diaEmSP, minutoDoDia, somarDias, type Dia } from "@/lib/tarefas/calendario";
import { valorCurto } from "@/components/crm/negocios/modelo";
import { chaveDoDia, intervaloDaGrade, type EventoDoCalendario } from "./calendario-dados";

// Visão semanal do calendário, sem React (testável): os dias da semana
// (segunda a domingo, como na agenda de trabalho), onde cada evento cai na
// grade de horas e o "quando" do painel de detalhe ("em 10 min", "agora").
// Tudo no relógio de São Paulo.

/** Altura mínima de um evento na grade (um evento de 5 min ainda precisa de título). */
const DURACAO_MINIMA = 45;
const MINUTOS_NO_DIA = 24 * 60;

/** Segunda a domingo da semana do dia. */
export function diasDaSemana(d: Dia): Dia[] {
  const segunda = somarDias(d, -((diaDaSemana(d) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

/**
 * O que buscar para o dia escolhido: a grade do mês dele (o mini calendário e
 * a visão mensal) junto com a semana dele, que pode passar para o mês vizinho.
 */
export function intervaloDaVisao(d: Dia): { de: string; ate: string } {
  const grade = intervaloDaGrade({ ano: d.ano, mes: d.mes });
  const semana = diasDaSemana(d);
  const de = chaveDoDia(semana[0]);
  const ate = chaveDoDia(semana[6]);
  return { de: de < grade.de ? de : grade.de, ate: ate > grade.ate ? ate : grade.ate };
}

export interface BlocoNaGrade {
  evento: EventoDoCalendario;
  /** Minutos desde a meia-noite de SP. */
  inicioMin: number;
  fimMin: number;
  /** Coluna dentro do grupo de eventos que se cruzam, e quantas o grupo tem. */
  coluna: number;
  colunas: number;
}

/**
 * Eventos com hora de um dia → blocos posicionados. Eventos que se cruzam
 * dividem a largura (cada grupo encadeado tem tantas colunas quanto o máximo
 * de sobrepostos); dia todo não entra (vai na faixa de cima).
 */
export function blocosDoDia(eventos: EventoDoCalendario[]): BlocoNaGrade[] {
  const blocos: BlocoNaGrade[] = eventos
    .filter((e) => !e.diaTodo)
    .map((e) => {
      const inicioMin = minutoDoDia(e.inicio);
      const duracao = e.fim ? Math.round((e.fim.getTime() - e.inicio.getTime()) / 60_000) : 0;
      const fimMin = Math.min(MINUTOS_NO_DIA, inicioMin + Math.max(DURACAO_MINIMA, duracao));
      return { evento: e, inicioMin, fimMin, coluna: 0, colunas: 1 };
    })
    .sort((a, b) => a.inicioMin - b.inicioMin || b.fimMin - a.fimMin);

  let grupo: BlocoNaGrade[] = [];
  let fimDoGrupo = -1;
  let fimDasColunas: number[] = [];
  const fecharGrupo = () => {
    for (const b of grupo) b.colunas = fimDasColunas.length;
    grupo = [];
    fimDasColunas = [];
  };
  for (const b of blocos) {
    if (b.inicioMin >= fimDoGrupo) fecharGrupo();
    let coluna = fimDasColunas.findIndex((fim) => fim <= b.inicioMin);
    if (coluna === -1) {
      coluna = fimDasColunas.length;
      fimDasColunas.push(b.fimMin);
    } else fimDasColunas[coluna] = b.fimMin;
    b.coluna = coluna;
    grupo.push(b);
    fimDoGrupo = Math.max(fimDoGrupo, b.fimMin);
  }
  fecharGrupo();
  return blocos;
}

export interface Antecedencia {
  texto: string;
  tom: "normal" | "aviso" | "perigo";
}

/** "em 10 min", "em 3 h", "agora", "atrasada", "feita"; dia todo sem hora: null. */
export function antecedencia(e: EventoDoCalendario, agora: Date): Antecedencia | null {
  if (e.feita) return { texto: "feita", tom: "normal" };
  if (e.atrasada) return { texto: "atrasada", tom: "perigo" };
  if (e.diaTodo) return null;
  const ate = Math.round((e.inicio.getTime() - agora.getTime()) / 60_000);
  const fim = e.fim ?? new Date(e.inicio.getTime() + DURACAO_MINIMA * 60_000);
  if (ate <= 0) return fim.getTime() > agora.getTime() ? { texto: "agora", tom: "aviso" } : null;
  if (ate < 60) return { texto: `em ${ate} min`, tom: "aviso" };
  if (ate < 24 * 60) return { texto: `em ${Math.round(ate / 60)} h`, tom: "normal" };
  const dias = Math.round(ate / (24 * 60));
  return { texto: `em ${dias} ${dias === 1 ? "dia" : "dias"}`, tom: "normal" };
}

/** O que o painel de detalhe mostra ao escolher um dia: o próximo em aberto que ainda não acabou; senão o primeiro. */
export function eventoEmDestaque(eventos: EventoDoCalendario[], agora: Date): EventoDoCalendario | null {
  const t = agora.getTime();
  const proximo = eventos.find((e) => !e.feita && (e.diaTodo || (e.fim ?? e.inicio).getTime() >= t));
  return proximo ?? eventos[0] ?? null;
}

export function minutosDeDuracao(e: EventoDoCalendario): number | null {
  return e.fim ? Math.round((e.fim.getTime() - e.inicio.getTime()) / 60_000) : null;
}

export interface AvisoDoCalendario {
  id: "atrasadas" | "proximo" | "fechamentos" | "livre";
  tom: "perigo" | "aviso" | "normal" | "sucesso";
  texto: string;
  /** Item que o aviso abre no detalhe (null: nada a abrir). */
  eventoId: string | null;
}

/**
 * Avisos de cima do calendário, na ordem de urgência: atrasadas (abre a mais
 * recente), o próximo compromisso de hoje e os fechamentos previstos da
 * semana. Sem atrasada nem compromisso pela frente hoje: "Nada mais hoje".
 */
export function avisosDoCalendario(eventos: EventoDoCalendario[], semana: Dia[], agora: Date): AvisoDoCalendario[] {
  const avisos: AvisoDoCalendario[] = [];
  const atrasadas = eventos.filter((e) => e.atrasada && !e.feita).sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
  if (atrasadas.length) avisos.push({ id: "atrasadas", tom: "perigo", texto: `${atrasadas.length} ${atrasadas.length === 1 ? "atrasada" : "atrasadas"}`, eventoId: atrasadas[0].id });

  const hoje = chaveDoDia(diaEmSP(agora));
  const t = agora.getTime();
  const deHoje = eventos
    .filter((e) => !e.feita && !e.diaTodo && !e.atrasada && chaveDoDia(diaEmSP(e.inicio)) === hoje && (e.fim ?? e.inicio).getTime() >= t)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const proximo = deHoje[0];
  if (proximo) {
    const quando = antecedencia(proximo, agora);
    avisos.push({ id: "proximo", tom: quando?.tom === "aviso" ? "aviso" : "normal", texto: `Próximo: ${proximo.titulo}${quando ? ` · ${quando.texto}` : ""}`, eventoId: proximo.id });
  }

  const dias = new Set(semana.map(chaveDoDia));
  const fechamentos = eventos.filter((e) => e.origem === "negocio" && dias.has(chaveDoDia(diaEmSP(e.inicio))));
  if (fechamentos.length) {
    const soma = fechamentos.reduce((s, e) => s + (e.negocio?.valorCents ?? 0), 0);
    avisos.push({
      id: "fechamentos",
      tom: "sucesso",
      texto: `${fechamentos.length} ${fechamentos.length === 1 ? "fechamento previsto" : "fechamentos previstos"} na semana · ${valorCurto(soma)}`,
      eventoId: fechamentos[0].id,
    });
  }

  if (!atrasadas.length && !proximo) avisos.push({ id: "livre", tom: "normal", texto: "Nada mais hoje", eventoId: null });
  return avisos;
}

/** Compromissos que começam nos próximos 10 minutos e ainda não foram avisados na ilha. */
export function paraAvisarNaIlha(eventos: EventoDoCalendario[], agora: Date, avisados: Set<string>): EventoDoCalendario[] {
  const t = agora.getTime();
  return eventos.filter((e) => {
    if (e.feita || e.diaTodo || avisados.has(e.id)) return false;
    const falta = e.inicio.getTime() - t;
    return falta > 0 && falta <= 10 * 60_000;
  });
}
