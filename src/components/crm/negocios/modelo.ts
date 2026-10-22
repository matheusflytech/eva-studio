// Tipos e regras puras da tela de Negócios (kanban e lista). Sem React nem
// rede: filtro, indicadores e formatação ficam testados à parte.

import { DIAS_PARADO_PADRAO, diasSemAtividade, negocioParado } from "@/lib/regras-de-etapa";

export interface NegocioKanban {
  id: string;
  name: string;
  amountCents: number;
  probability: number;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  /** Contatos do negócio; o primeiro é o principal. phone/email vêm do GET /api/deals. */
  contacts: { id: string; name: string; phone?: string; email?: string }[];
  openTasks: number;
  expectedClosingAt: string | null;
  closedAt: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  stageSince: string;
  /** Última atividade (nota, tarefa concluída, mensagem, edição). Relógio do parado. */
  lastActivityAt?: string | null;
  /** Conversa de WhatsApp do contato, se houver; naoLida = cliente falou e ninguém leu. */
  whatsapp: { conversationId: string; naoLida: boolean } | null;
  /** Próxima tarefa em aberto (a de prazo mais próximo). */
  nextTask: { type: string; text: string; dueAt: string | null } | null;
  /** Nomes dos itens (produtos), na ordem. Só vem quando o layout do funil mostra produtos. */
  produtos?: string[];
}

export interface EtapaKanban {
  id: string;
  name: string;
  type: string;
  color: string;
  probability: number;
  /** Dias sem atividade para "parado" (regra da etapa); null = nunca; ausente = 7. */
  rottingDays?: number | null;
  /** "O que fazer nesta etapa" (regra da etapa). */
  guidance?: string;
  totalCents: number;
  weightedCents: number;
  deals: NegocioKanban[];
  /** Quadro paginado: quantos negócios a etapa tem no total (agregado no banco). */
  count?: number;
  /** Há mais cartões para carregar nesta coluna. */
  temMais?: boolean;
  /** Cursor do último cartão entregue (para "Carregar mais"). */
  depois?: string | null;
}

export type VisaoSalva = "todos" | "meus" | "atencao" | "parados" | "fechando";

export interface FiltrosDeNegocio {
  busca?: string;
  /** id do responsável; "__sem" = sem responsável. */
  dono?: string;
  soParados?: boolean;
  visao?: VisaoSalva;
  /** Usuário logado, para a visão "Meus". */
  meuId?: string;
}

/**
 * Prazo de parado de quem não tem regra de etapa (o de antes das regras).
 * Cada etapa tem o seu (`EtapaKanban.rottingDays`); este é só o padrão.
 */
export const DIAS_PARADO = DIAS_PARADO_PADRAO;
const DIA = 86_400_000;

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Dias sem atividade: agora − greatest(última atividade, entrada na etapa). */
export function diasParado(n: Pick<NegocioKanban, "stageSince" | "lastActivityAt">, agora: Date): number {
  return diasSemAtividade(n, agora);
}

/**
 * Aberto E prazo da etapa não nulo E dias sem atividade > prazo (skill
 * crm-pipeline-kanban). `prazo` ausente = 7 (tela sem regra carregada).
 */
export function estaParado(n: NegocioKanban, tipoDaEtapa: string, agora: Date, prazo?: number | null): boolean {
  return negocioParado(n, tipoDaEtapa, prazo, agora);
}

// ---- datas no fuso de São Paulo (é o horário de quem vende) ----

const FUSO = "America/Sao_Paulo";
const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: FUSO }); // AAAA-MM-DD
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function dataCurta(iso: string): string {
  const [, m, d] = diaSP(new Date(iso)).split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

function horaCurta(d: Date): string {
  const [h, m] = d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false }).split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** "hoje 16h", "amanhã 10h30" ou "28 out". */
export function quandoCurto(iso: string, agora: Date): string {
  const alvo = new Date(iso);
  const hoje = diaSP(agora);
  const amanha = diaSP(new Date(agora.getTime() + DIA));
  if (diaSP(alvo) === hoje) return `hoje ${horaCurta(alvo)}`;
  if (diaSP(alvo) === amanha) return `amanhã ${horaCurta(alvo)}`;
  return dataCurta(iso);
}

const mesSP = (d: Date) => diaSP(d).slice(0, 7);

/**
 * Dia da previsão de fechamento (AAAA-MM-DD). É data sem hora: o servidor
 * grava meio-dia UTC, e registro antigo ficou à meia-noite UTC — nos dois
 * casos o dia escolhido é a parte UTC. Converter para SP jogaria o antigo
 * para a véspera.
 */
export function diaDaPrevisao(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** "28 out" de um dia AAAA-MM-DD, sem passar por fuso. */
export function dataCurtaDoDia(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

function tarefaAtrasada(n: NegocioKanban, agora: Date): boolean {
  return !!n.nextTask?.dueAt && new Date(n.nextTask.dueAt).getTime() < agora.getTime();
}

/** Previsão vencida: o dia previsto já passou no calendário de SP (o próprio dia ainda não conta). */
export function fechamentoPassou(n: Pick<NegocioKanban, "expectedClosingAt">, agora: Date): boolean {
  return !!n.expectedClosingAt && diaDaPrevisao(n.expectedClosingAt) < diaSP(agora);
}

/** Aberto e com algo pedindo ação agora: parado, tarefa atrasada ou previsão vencida. */
export function pedeAtencao(n: NegocioKanban, tipoDaEtapa: string, agora: Date, prazo?: number | null): boolean {
  if (tipoDaEtapa !== "open" || n.closedAt) return false;
  return estaParado(n, tipoDaEtapa, agora, prazo) || tarefaAtrasada(n, agora) || fechamentoPassou(n, agora);
}

export function precisaAtencao(etapas: EtapaKanban[], agora: Date): number {
  return etapas.reduce((s, e) => s + e.deals.filter((n) => pedeAtencao(n, e.type, agora, e.rottingDays)).length, 0);
}

export type IconeDoSinal = "clock" | "cal" | "hour" | "phone" | "mail" | "task" | "check";
export interface SinalDoNegocio {
  tom: "bad" | "warn" | "ok" | "neu";
  icone: IconeDoSinal;
  texto: string;
}

const TAREFA: Record<string, { rotulo: string; icone: IconeDoSinal; tom: SinalDoNegocio["tom"] }> = {
  ligar: { rotulo: "Ligar", icone: "phone", tom: "neu" },
  reuniao: { rotulo: "Reunião", icone: "cal", tom: "ok" },
  email: { rotulo: "E-mail", icone: "mail", tom: "neu" },
  whatsapp: { rotulo: "WhatsApp", icone: "phone", tom: "neu" },
  visita: { rotulo: "Visita", icone: "cal", tom: "ok" },
};

/**
 * O único sinal que o cartão mostra, do mais urgente para o menos: retorno
 * atrasado, previsão vencida, parado, próxima atividade, previsão futura.
 * Um sinal só: dois chips de alerta no mesmo cartão viram ruído.
 */
export function sinalDoNegocio(n: NegocioKanban, tipoDaEtapa: string, agora: Date, prazo?: number | null): SinalDoNegocio | null {
  if (tipoDaEtapa === "won") return n.closedAt ? { tom: "ok", icone: "check", texto: `Ganho ${dataCurta(n.closedAt)}` } : null;
  if (tipoDaEtapa !== "open") return null;

  if (tarefaAtrasada(n, agora)) {
    const dias = Math.max(1, Math.floor((agora.getTime() - new Date(n.nextTask!.dueAt!).getTime()) / DIA));
    return { tom: "bad", icone: "clock", texto: `Retorno atrasado ${dias}d` };
  }
  if (fechamentoPassou(n, agora)) {
    return { tom: "bad", icone: "cal", texto: `Fechamento passou ${dataCurtaDoDia(diaDaPrevisao(n.expectedClosingAt!))}` };
  }
  // Marca discreta com o tempo (skill: "parado há 12d"), sem pintar o cartão.
  if (estaParado(n, tipoDaEtapa, agora, prazo)) return { tom: "warn", icone: "hour", texto: `Parado há ${diasParado(n, agora)}d` };

  if (n.nextTask) {
    const t = TAREFA[n.nextTask.type];
    const quando = n.nextTask.dueAt ? quandoCurto(n.nextTask.dueAt, agora) : "";
    if (t) return { tom: t.tom, icone: t.icone, texto: [t.rotulo, quando].filter(Boolean).join(" ") };
    const texto = n.nextTask.text.trim().slice(0, 40) || "Tarefa";
    return { tom: "neu", icone: "task", texto: quando ? `${texto} · ${quando}` : texto };
  }
  if (n.expectedClosingAt) return { tom: "neu", icone: "cal", texto: `Fecha ${dataCurtaDoDia(diaDaPrevisao(n.expectedClosingAt))}` };
  return null;
}

export function comparativoDeGanho(etapas: EtapaKanban[], agora: Date) {
  const este = mesSP(agora);
  const ref = new Date(agora);
  ref.setUTCDate(1);
  ref.setUTCMonth(ref.getUTCMonth() - 1);
  const anterior = mesSP(new Date(ref.getTime() + 12 * 3600_000));
  let esteMesCents = 0;
  let mesAnteriorCents = 0;
  for (const e of etapas) {
    if (e.type !== "won") continue;
    for (const n of e.deals) {
      if (!n.closedAt) continue;
      const m = mesSP(new Date(n.closedAt));
      if (m === este) esteMesCents += n.amountCents;
      else if (m === anterior) mesAnteriorCents += n.amountCents;
    }
  }
  return { esteMesCents, mesAnteriorCents, variacao: mesAnteriorCents > 0 ? (esteMesCents - mesAnteriorCents) / mesAnteriorCents : null };
}

/** Ganho acumulado dia a dia, do dia 1 até hoje (fuso de São Paulo). */
export function serieDeGanhoDoMes(etapas: EtapaKanban[], agora: Date): number[] {
  const [ano, mes, hoje] = diaSP(agora).split("-").map(Number);
  const porDia = new Array<number>(hoje).fill(0);
  for (const e of etapas) {
    if (e.type !== "won") continue;
    for (const n of e.deals) {
      if (!n.closedAt) continue;
      const [a, m, d] = diaSP(new Date(n.closedAt)).split("-").map(Number);
      if (a === ano && m === mes && d <= hoje) porDia[d - 1] += n.amountCents;
    }
  }
  let soma = 0;
  return porDia.map((v) => (soma += v));
}

function passaNaVisao(n: NegocioKanban, tipo: string, f: FiltrosDeNegocio, agora: Date, prazo?: number | null): boolean {
  switch (f.visao) {
    case "meus":
      return !!f.meuId && n.owner?.id === f.meuId;
    case "atencao":
      return pedeAtencao(n, tipo, agora, prazo);
    case "parados":
      return estaParado(n, tipo, agora, prazo);
    case "fechando":
      return tipo === "open" && !!n.expectedClosingAt && diaDaPrevisao(n.expectedClosingAt).slice(0, 7) === mesSP(agora);
    default:
      return true;
  }
}

function passa(n: NegocioKanban, tipo: string, f: FiltrosDeNegocio, agora: Date, prazo?: number | null): boolean {
  if (!passaNaVisao(n, tipo, f, agora, prazo)) return false;
  if (f.busca) {
    const alvo = normalizar(f.busca);
    const onde = [n.name, n.company?.name ?? "", ...n.contacts.map((c) => c.name)].map(normalizar);
    if (!onde.some((t) => t.includes(alvo))) return false;
  }
  if (f.dono) {
    if (f.dono === "__sem" ? n.owner !== null : n.owner?.id !== f.dono) return false;
  }
  if (f.soParados && !estaParado(n, tipo, agora, prazo)) return false;
  return true;
}

export function filtrarEtapas(etapas: EtapaKanban[], f: FiltrosDeNegocio, agora: Date): EtapaKanban[] {
  if (!f.busca?.trim() && !f.dono && !f.soParados && (!f.visao || f.visao === "todos")) return etapas;
  return etapas.map((e) => {
    const deals = e.deals.filter((n) => passa(n, e.type, f, agora, e.rottingDays));
    return {
      ...e,
      deals,
      totalCents: deals.reduce((s, d) => s + d.amountCents, 0),
      weightedCents: deals.reduce((s, d) => s + Math.round((d.amountCents * d.probability) / 100), 0),
    };
  });
}

export interface ResumoDoFunil {
  abertoCents: number;
  abertos: number;
  ponderadoCents: number;
  ganhoNoMesCents: number;
  ganhosNoMes: number;
  parados: number;
}

export function resumoDoFunil(etapas: EtapaKanban[], agora: Date): ResumoDoFunil {
  const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
  const r: ResumoDoFunil = { abertoCents: 0, abertos: 0, ponderadoCents: 0, ganhoNoMesCents: 0, ganhosNoMes: 0, parados: 0 };
  for (const e of etapas) {
    for (const n of e.deals) {
      if (e.type === "open") {
        r.abertoCents += n.amountCents;
        r.abertos += 1;
        r.ponderadoCents += Math.round((n.amountCents * n.probability) / 100);
        if (estaParado(n, e.type, agora, e.rottingDays)) r.parados += 1;
      } else if (e.type === "won" && n.closedAt && new Date(n.closedAt).getTime() >= inicioDoMes) {
        r.ganhoNoMesCents += n.amountCents;
        r.ganhosNoMes += 1;
      }
    }
  }
  return r;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export function dinheiro(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Valor compacto para indicadores e cabeçalhos de coluna: "R$ 1,5 mil". */
export function valorCurto(cents: number): string {
  const reais = cents / 100;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (Math.abs(reais) >= 1_000_000) return `R$ ${fmt(reais / 1_000_000)} mi`;
  if (Math.abs(reais) >= 1_000) return `R$ ${fmt(reais / 1_000)} mil`;
  return `R$ ${fmt(reais)}`;
}

// ---- quadro paginado por coluna ----

/**
 * Tempo na etapa por extenso: "agora", "1 minuto", "31 minutos", "3 horas",
 * "2 dias". Arredonda para baixo (31 min e 59 s = "31 minutos").
 */
export function tempoNaEtapa(stageSince: string, agora: Date): string {
  const ms = Math.max(0, agora.getTime() - new Date(stageSince).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return min === 1 ? "1 minuto" : `${min} minutos`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas === 1 ? "1 hora" : `${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/** "Carregar mais": junta os novos no fim, sem repetir quem já está na coluna. */
export function juntarCartoes(atuais: NegocioKanban[], novos: NegocioKanban[]): NegocioKanban[] {
  const vistos = new Set(atuais.map((d) => d.id));
  return [...atuais, ...novos.filter((d) => !vistos.has(d.id) && vistos.add(d.id))];
}

/**
 * Move um cartão de coluna na tela antes da resposta do servidor: tira de
 * uma, põe no topo da outra (com stageSince = agora) e acerta contagem,
 * total e ponderado das duas (o ponderado usa a chance da etapa de destino,
 * que é o que o servidor grava ao mover).
 */
export function moverCartao(etapas: EtapaKanban[], dealId: string, paraEtapaId: string, agora: Date): EtapaKanban[] {
  const origem = etapas.find((e) => e.deals.some((d) => d.id === dealId));
  const destino = etapas.find((e) => e.id === paraEtapaId);
  if (!origem || !destino || origem.id === destino.id) return etapas;
  const deal = origem.deals.find((d) => d.id === dealId)!;
  const pesoAntes = Math.round((deal.amountCents * deal.probability) / 100);
  const movido: NegocioKanban = { ...deal, probability: destino.probability, stageSince: agora.toISOString() };
  const pesoDepois = Math.round((movido.amountCents * movido.probability) / 100);
  return etapas.map((e) => {
    if (e.id === origem.id) {
      return {
        ...e,
        deals: e.deals.filter((d) => d.id !== dealId),
        count: e.count !== undefined ? Math.max(0, e.count - 1) : undefined,
        totalCents: e.totalCents - deal.amountCents,
        weightedCents: e.weightedCents - pesoAntes,
      };
    }
    if (e.id === destino.id) {
      return {
        ...e,
        deals: [movido, ...e.deals],
        count: e.count !== undefined ? e.count + 1 : undefined,
        totalCents: e.totalCents + deal.amountCents,
        weightedCents: e.weightedCents + pesoDepois,
      };
    }
    return e;
  });
}
