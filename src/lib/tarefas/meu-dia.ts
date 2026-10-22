import { diaEmSP, mesmoDia, minutoDoDia } from "./calendario";
import { ehDiaTodo, tarefaEstaAtrasada } from "./agrupar";
import { INFO_DO_TIPO, contagemDoTipo, type Prioridade, type TipoDeTarefa } from "./tipos";

// ---------------------------------------------------------------------------
// "Meu dia" (skill crm-tasks-agenda, §6): ranqueia, não bloqueia agenda.
//
// 1. Fixos: reunião e visita com hora hoje, em ordem de horário, no topo.
// 2. Pool: tarefas atrasadas e de hoje + itens sintéticos — "Responder"
//    (cliente esperando resposta), "Primeiro contato" (lead novo) e "Definir
//    próximo passo" (negócio parado sem tarefa aberta).
// 3. Score = 40·sla + 25·resposta + 20·atraso + 15·valor + 10·etapa
//    + 10·risco + 5·lead + prioridade (alta = +15). Desempate: prazo, criação.
//    SLA cresce com o tempo parado (0 → 1) e estourado vale 1,2.
// 4. Capacidade: minutos até o fim do expediente − fixos que faltam − 15%.
//    O que passa vira "provavelmente amanhã" (adiar em 1 clique).
// 5. Filas por tipo ("Fila: 8 WhatsApps") para trabalhar registro a registro.
//
// Tudo puro: o servidor (src/lib/server/meu-dia.ts) só junta os dados. O
// resumo do dia (resumoDoDia) é o mesmo que o digest das 8h por WhatsApp vai
// usar (itens 13 e 20 do plano de melhorias).
// ---------------------------------------------------------------------------

export type FonteDoItem = "tarefa" | "responder" | "primeiro_contato" | "proximo_passo";

export interface ItemDoDia {
  id: string;
  fonte: FonteDoItem;
  tipo: TipoDeTarefa;
  titulo: string;
  dueAt: Date | null;
  diaTodo?: boolean | null;
  prioridade: Prioridade;
  criadoEm: Date;
  /** Minutos; padrão = duração do tipo. */
  duracaoMin?: number | null;
  /** Valor do negócio ligado (centavos). */
  valorCents?: number | null;
  /** 0 (primeira etapa) … 1 (última etapa aberta). */
  etapaProgresso?: number | null;
  /** 1 = parado além do prazo da etapa; 0,5 = perto; 0 = em dia. */
  risco?: number | null;
  /** Cliente mandou mensagem não lida desde… */
  esperandoDesde?: Date | null;
  /** Lead novo desde… (sem toque). */
  leadDesde?: Date | null;
  /** SLA do primeiro contato em minutos. */
  slaMin?: number | null;
  /** 0–1. */
  leadScore?: number | null;
}

export interface ContextoDoScore {
  agora: Date;
  /** Maior valor (centavos) entre os negócios do pool, para normalizar. */
  maxValorCents: number;
}

export const SLA_PADRAO_MIN = 30;
export const BOOST_PRIORIDADE_ALTA = 15;
const DIA_MS = 86_400_000;

export function duracaoDoItem(item: Pick<ItemDoDia, "tipo" | "duracaoMin">): number {
  return item.duracaoMin && item.duracaoMin > 0 ? item.duracaoMin : INFO_DO_TIPO[item.tipo].duracaoMin;
}

export function urgenciaDoSla(item: ItemDoDia, agora: Date): number {
  if (item.fonte !== "primeiro_contato" || !item.leadDesde) return 0;
  const sla = item.slaMin && item.slaMin > 0 ? item.slaMin : SLA_PADRAO_MIN;
  const passados = (agora.getTime() - item.leadDesde.getTime()) / 60_000;
  if (passados >= sla) return 1.2;
  return Math.max(0, passados / sla);
}

export function fatorDeResposta(item: ItemDoDia, agora: Date): number {
  if (item.fonte !== "responder" || !item.esperandoDesde) return 0;
  const horas = Math.max(0, (agora.getTime() - item.esperandoDesde.getTime()) / 3_600_000);
  // Esperando já pesa; quanto mais velho, mais (até 1 com 24h).
  return 0.6 + 0.4 * Math.min(horas / 24, 1);
}

export function fatorDeAtraso(item: ItemDoDia, agora: Date): number {
  if (!item.dueAt || !tarefaEstaAtrasada({ dueAt: item.dueAt, doneAt: null, diaTodo: item.diaTodo }, agora)) return 0;
  const dias = Math.ceil((agora.getTime() - item.dueAt.getTime()) / DIA_MS);
  return Math.min(Math.max(dias, 1) / 3, 1);
}

export function valorNormalizado(valorCents: number | null | undefined, maxValorCents: number): number {
  if (!valorCents || valorCents <= 0 || maxValorCents <= 0) return 0;
  // Log de reais + 1: R$ 0 → 0; o maior negócio → 1.
  const v = Math.log(valorCents / 100 + 1);
  const max = Math.log(maxValorCents / 100 + 1);
  return max > 0 ? Math.min(v / max, 1) : 0;
}

export function pontuar(item: ItemDoDia, ctx: ContextoDoScore): number {
  const s =
    40 * urgenciaDoSla(item, ctx.agora) +
    25 * fatorDeResposta(item, ctx.agora) +
    20 * fatorDeAtraso(item, ctx.agora) +
    15 * valorNormalizado(item.valorCents, ctx.maxValorCents) +
    10 * clamp01(item.etapaProgresso) +
    10 * clamp01(item.risco) +
    5 * clamp01(item.leadScore) +
    (item.prioridade === "alta" ? BOOST_PRIORIDADE_ALTA : 0);
  return Math.round(s * 100) / 100;
}

function clamp01(v: number | null | undefined): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  return Math.min(Math.max(v, 0), 1);
}

/** Desempate: prazo (sem prazo por último), depois criação. */
function desempate(a: ItemDoDia, b: ItemDoDia): number {
  const da = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const db = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return a.criadoEm.getTime() - b.criadoEm.getTime();
}

export interface ItemPontuado<T extends ItemDoDia = ItemDoDia> {
  item: T;
  score: number;
  duracaoMin: number;
}

export interface Expediente {
  /** Minutos desde a meia-noite de SP. Padrão 9h–18h. */
  inicio: number;
  fim: number;
  /** Folga (0,15 = 15%). */
  folga: number;
}

export const EXPEDIENTE_PADRAO: Expediente = { inicio: 9 * 60, fim: 18 * 60, folga: 0.15 };

export interface Fila {
  tipo: TipoDeTarefa;
  rotulo: string;
  ids: string[];
}

export interface Capacidade {
  /** Minutos livres para o pool (já sem fixos e folga). */
  livres: number;
  /** Minutos do pool que cabem hoje. */
  planejados: number;
  /** Minutos que passaram da capacidade. */
  excedentes: number;
  /** Minutos dos fixos que ainda não aconteceram. */
  fixosMin: number;
}

export interface MeuDia<T extends ItemDoDia = ItemDoDia> {
  fixos: ItemPontuado<T>[];
  /** Pool ranqueado que cabe hoje. */
  agora: ItemPontuado<T>[];
  /** Excedente: "provavelmente amanhã". */
  provavelmenteAmanha: ItemPontuado<T>[];
  capacidade: Capacidade;
  /** Filas por tipo, maior primeiro (na ordem do ranking dentro de cada uma). */
  filas: Fila[];
}

/** Reunião e visita com hora marcada hoje: compromisso fixo, não entra no ranking. */
export function ehFixo(item: ItemDoDia, agora: Date): boolean {
  if (item.fonte !== "tarefa" || !item.dueAt) return false;
  if (item.tipo !== "reuniao" && item.tipo !== "visita") return false;
  if (ehDiaTodo(item.dueAt, item.diaTodo)) return false;
  return mesmoDia(diaEmSP(item.dueAt), diaEmSP(agora));
}

export function montarMeuDia<T extends ItemDoDia>(itens: T[], agora: Date, expediente: Expediente = EXPEDIENTE_PADRAO): MeuDia<T> {
  const maxValorCents = itens.reduce((m, i) => Math.max(m, i.valorCents ?? 0), 0);
  const ctx = { agora, maxValorCents };
  const pontuado = (item: T): ItemPontuado<T> => ({ item, score: pontuar(item, ctx), duracaoMin: duracaoDoItem(item) });

  const fixos = itens.filter((i) => ehFixo(i, agora)).map(pontuado);
  fixos.sort((a, b) => a.item.dueAt!.getTime() - b.item.dueAt!.getTime());

  const pool = itens.filter((i) => !ehFixo(i, agora)).map(pontuado);
  pool.sort((a, b) => b.score - a.score || desempate(a.item, b.item));

  // Capacidade (Sunsama): do agora (ou do início do expediente) até o fim,
  // menos os fixos que ainda vão acontecer, menos a folga.
  const inicio = Math.max(minutoDoDia(agora), expediente.inicio);
  const bruto = Math.max(0, expediente.fim - inicio);
  const fixosMin = fixos
    .filter((f) => f.item.dueAt!.getTime() + f.duracaoMin * 60_000 > agora.getTime())
    .reduce((s, f) => s + f.duracaoMin, 0);
  const livres = Math.max(0, Math.floor((bruto - fixosMin) * (1 - expediente.folga)));

  const cabem: ItemPontuado<T>[] = [];
  const sobram: ItemPontuado<T>[] = [];
  let usados = 0;
  for (const p of pool) {
    if (usados + p.duracaoMin <= livres) {
      cabem.push(p);
      usados += p.duracaoMin;
    } else {
      sobram.push(p);
    }
  }

  const porTipo = new Map<TipoDeTarefa, string[]>();
  for (const p of pool) {
    const l = porTipo.get(p.item.tipo) ?? [];
    l.push(p.item.id);
    porTipo.set(p.item.tipo, l);
  }
  const filas: Fila[] = [...porTipo.entries()]
    .map(([tipo, ids]) => ({ tipo, ids, rotulo: `Fila: ${contagemDoTipo(tipo, ids.length)}` }))
    .sort((a, b) => b.ids.length - a.ids.length);

  return {
    fixos,
    agora: cabem,
    provavelmenteAmanha: sobram,
    capacidade: { livres, planejados: usados, excedentes: sobram.reduce((s, p) => s + p.duracaoMin, 0), fixosMin },
    filas,
  };
}

export interface ResumoDoDia {
  reunioes: number;
  tarefas: number;
  atrasadas: number;
  aguardandoResposta: number;
  leadsNovos: number;
  negociosEmRisco: number;
  provavelmenteAmanha: number;
  /** "Hoje: 3 reuniões, 12 tarefas, 2 leads novos aguardando, 1 negócio em risco." */
  texto: string;
}

/**
 * Resumo do dia — reutilizável pelo digest das 8h por WhatsApp e pelo alerta
 * de SLA (itens 13 e 20 do plano de melhorias, ainda não feitos).
 */
export function resumoDoDia(dia: MeuDia, agora: Date): ResumoDoDia {
  const pool = [...dia.agora, ...dia.provavelmenteAmanha].map((p) => p.item);
  const conta = (f: FonteDoItem) => pool.filter((i) => i.fonte === f).length;
  const r = {
    reunioes: dia.fixos.length,
    tarefas: conta("tarefa"),
    atrasadas: pool.filter((i) => i.fonte === "tarefa" && fatorDeAtraso(i, agora) > 0).length,
    aguardandoResposta: conta("responder"),
    leadsNovos: conta("primeiro_contato"),
    negociosEmRisco: conta("proximo_passo"),
    provavelmenteAmanha: dia.provavelmenteAmanha.length,
  };
  const partes: string[] = [];
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  if (r.reunioes) partes.push(plural(r.reunioes, "compromisso", "compromissos"));
  if (r.tarefas) partes.push(plural(r.tarefas, "tarefa", "tarefas") + (r.atrasadas ? ` (${r.atrasadas} atrasada${r.atrasadas === 1 ? "" : "s"})` : ""));
  if (r.aguardandoResposta) partes.push(plural(r.aguardandoResposta, "cliente esperando resposta", "clientes esperando resposta"));
  if (r.leadsNovos) partes.push(plural(r.leadsNovos, "lead novo aguardando", "leads novos aguardando"));
  if (r.negociosEmRisco) partes.push(plural(r.negociosEmRisco, "negócio sem próximo passo", "negócios sem próximo passo"));
  const texto = partes.length ? `Hoje: ${juntar(partes)}.` : "Nada pendente para hoje.";
  return { ...r, texto };
}

function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}
