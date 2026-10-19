// Tipos e regras puras da tela de Negócios (kanban e lista). Sem React nem
// rede: filtro, indicadores e formatação ficam testados à parte.

export interface NegocioKanban {
  id: string;
  name: string;
  amountCents: number;
  probability: number;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  contacts: { id: string; name: string }[];
  openTasks: number;
  expectedClosingAt: string | null;
  closedAt: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  stageSince: string;
}

export interface EtapaKanban {
  id: string;
  name: string;
  type: string;
  color: string;
  probability: number;
  totalCents: number;
  weightedCents: number;
  deals: NegocioKanban[];
}

export interface FiltrosDeNegocio {
  busca?: string;
  /** id do responsável; "__sem" = sem responsável. */
  dono?: string;
  soParados?: boolean;
}

/** Aberto há mais disso na mesma etapa = parado. Mesmo número do dashboard. */
export const DIAS_PARADO = 7;
const DIA = 86_400_000;

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function diasParado(n: Pick<NegocioKanban, "stageSince">, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(n.stageSince).getTime()) / DIA);
}

export function estaParado(n: NegocioKanban, tipoDaEtapa: string, agora: Date): boolean {
  return tipoDaEtapa === "open" && !n.closedAt && diasParado(n, agora) > DIAS_PARADO;
}

function passa(n: NegocioKanban, tipo: string, f: FiltrosDeNegocio, agora: Date): boolean {
  if (f.busca) {
    const alvo = normalizar(f.busca);
    const onde = [n.name, n.company?.name ?? "", ...n.contacts.map((c) => c.name)].map(normalizar);
    if (!onde.some((t) => t.includes(alvo))) return false;
  }
  if (f.dono) {
    if (f.dono === "__sem" ? n.owner !== null : n.owner?.id !== f.dono) return false;
  }
  if (f.soParados && !estaParado(n, tipo, agora)) return false;
  return true;
}

export function filtrarEtapas(etapas: EtapaKanban[], f: FiltrosDeNegocio, agora: Date): EtapaKanban[] {
  if (!f.busca?.trim() && !f.dono && !f.soParados) return etapas;
  return etapas.map((e) => {
    const deals = e.deals.filter((n) => passa(n, e.type, f, agora));
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
        if (estaParado(n, e.type, agora)) r.parados += 1;
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
