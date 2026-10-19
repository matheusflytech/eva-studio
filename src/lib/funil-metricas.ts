// Contas do funil. Puras (sem banco): src/lib/server/analytics.ts busca as
// linhas e chama daqui; a tela de ajuda usa as mesmas definições.

export interface EtapaF {
  id: string;
  nome: string;
  posicao: number;
  tipo: "open" | "won" | "lost" | string;
}
export interface NegocioF {
  id: string;
  etapaId: string;
  criadoEm: Date;
  fechadoEm: Date | null;
  naEtapaDesde: Date;
  valorCentavos: number;
  motivoPerda: string;
  nome?: string;
}
export interface EventoF {
  dealId: string;
  de: string | null;
  para: string;
  em: Date;
}

const DIA = 86_400_000;
const dias = (ms: number) => Math.round(ms / DIA);

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function porId(etapas: EtapaF[]) {
  return new Map(etapas.map((e) => [e.id, e]));
}

function eventosPorNegocio(eventos: EventoF[]) {
  const m = new Map<string, EventoF[]>();
  for (const e of eventos) m.set(e.dealId, [...(m.get(e.dealId) ?? []), e]);
  for (const l of m.values()) l.sort((a, b) => a.em.getTime() - b.em.getTime());
  return m;
}

export interface LinhaDeConversao {
  etapaId: string;
  nome: string;
  quantidade: number;
  taxaDaAnterior: number;
  taxaDoInicio: number;
}

export function conversaoPorEtapa(etapas: EtapaF[], negocios: NegocioF[], eventos: EventoF[]): LinhaDeConversao[] {
  const abertas = etapas.filter((e) => e.tipo === "open").sort((a, b) => a.posicao - b.posicao);
  const ganho = etapas.find((e) => e.tipo === "won");
  const mapa = porId(etapas);
  const hist = eventosPorNegocio(eventos);

  // Índice (nas etapas abertas) mais longe que cada negócio chegou; -1 = nenhuma.
  const alcance = negocios.map((n) => {
    const passou = [...(hist.get(n.id) ?? []).map((e) => e.para), n.etapaId];
    let max = -1;
    let ganhou = false;
    for (const id of passou) {
      const e = mapa.get(id);
      if (!e) continue;
      if (e.tipo === "won") ganhou = true;
      const i = abertas.findIndex((a) => a.id === id);
      if (i > max) max = i;
    }
    if (ganhou) max = abertas.length - 1;
    return { max, ganhou };
  });

  const linhas: LinhaDeConversao[] = abertas.map((e, i) => ({
    etapaId: e.id,
    nome: e.nome,
    quantidade: alcance.filter((a) => a.max >= i).length,
    taxaDaAnterior: 0,
    taxaDoInicio: 0,
  }));
  if (ganho) {
    linhas.push({ etapaId: ganho.id, nome: ganho.nome, quantidade: alcance.filter((a) => a.ganhou).length, taxaDaAnterior: 0, taxaDoInicio: 0 });
  }
  const inicio = linhas[0]?.quantidade ?? 0;
  linhas.forEach((l, i) => {
    const anterior = i === 0 ? l.quantidade : linhas[i - 1].quantidade;
    l.taxaDaAnterior = anterior > 0 ? l.quantidade / anterior : 0;
    l.taxaDoInicio = inicio > 0 ? l.quantidade / inicio : 0;
  });
  return linhas;
}

export interface TempoNaEtapa {
  etapaId: string;
  nome: string;
  medianaDias: number | null;
  amostras: number;
  emAndamento: number;
}

export function tempoPorEtapa(etapas: EtapaF[], eventos: EventoF[], agora: Date): TempoNaEtapa[] {
  const abertas = etapas.filter((e) => e.tipo === "open").sort((a, b) => a.posicao - b.posicao);
  const duracoes = new Map<string, number[]>(abertas.map((e) => [e.id, []]));
  const andamento = new Map<string, number>();
  for (const lista of eventosPorNegocio(eventos).values()) {
    lista.forEach((e, i) => {
      const bucket = duracoes.get(e.para);
      if (!bucket) return;
      const saida = lista[i + 1]?.em ?? agora;
      if (!lista[i + 1]) andamento.set(e.para, (andamento.get(e.para) ?? 0) + 1);
      bucket.push((saida.getTime() - e.em.getTime()) / DIA);
    });
  }
  return abertas.map((e) => {
    const v = duracoes.get(e.id) ?? [];
    const m = mediana(v);
    return { etapaId: e.id, nome: e.nome, medianaDias: m === null ? null : Math.round(m * 10) / 10, amostras: v.length, emAndamento: andamento.get(e.id) ?? 0 };
  });
}

export function negociosParados(etapas: EtapaF[], negocios: NegocioF[], agora: Date, limiteDias = 7) {
  const mapa = porId(etapas);
  return negocios
    .filter((n) => !n.fechadoEm && mapa.get(n.etapaId)?.tipo === "open")
    .map((n) => ({ id: n.id, nome: n.nome ?? "", etapa: mapa.get(n.etapaId)?.nome ?? "", diasParado: dias(agora.getTime() - n.naEtapaDesde.getTime()), valorCentavos: n.valorCentavos }))
    .filter((n) => n.diasParado > limiteDias)
    .sort((a, b) => b.diasParado - a.diasParado);
}

export function motivosDePerda(negocios: NegocioF[], etapas: EtapaF[]) {
  const mapa = porId(etapas);
  const grupos = new Map<string, { label: string; value: number }>();
  for (const n of negocios) {
    if (mapa.get(n.etapaId)?.tipo !== "lost") continue;
    const bruto = n.motivoPerda.trim();
    const chave = bruto.toLowerCase() || "__sem";
    const g = grupos.get(chave) ?? { label: bruto || "Sem motivo", value: 0 };
    g.value += 1;
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => b.value - a.value);
}

export function taxaDeGanho(negocios: NegocioF[], etapas: EtapaF[]): number | null {
  const mapa = porId(etapas);
  const ganhos = negocios.filter((n) => mapa.get(n.etapaId)?.tipo === "won").length;
  const perdidos = negocios.filter((n) => mapa.get(n.etapaId)?.tipo === "lost").length;
  return ganhos + perdidos === 0 ? null : ganhos / (ganhos + perdidos);
}

export function cicloDeVenda(negocios: NegocioF[], etapas: EtapaF[]): number | null {
  const mapa = porId(etapas);
  const v = negocios
    .filter((n) => mapa.get(n.etapaId)?.tipo === "won" && n.fechadoEm)
    .map((n) => (n.fechadoEm!.getTime() - n.criadoEm.getTime()) / DIA);
  const m = mediana(v);
  return m === null ? null : Math.round(m);
}
