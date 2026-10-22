import { describe, it, expect } from "vitest";
import {
  conversaoPorEtapa,
  tempoPorEtapa,
  negociosParados,
  motivosDePerda,
  taxaDeGanho,
  cicloDeVenda,
  type EtapaF,
  type NegocioF,
  type EventoF,
} from "./funil-metricas";

const D = (s: string) => new Date(`2026-10-${s}T12:00:00Z`);
const etapas: EtapaF[] = [
  { id: "lead", nome: "Lead", posicao: 0, tipo: "open" },
  { id: "prop", nome: "Proposta", posicao: 1, tipo: "open" },
  { id: "neg", nome: "Negociação", posicao: 2, tipo: "open" },
  { id: "ganho", nome: "Ganho", posicao: 3, tipo: "won" },
  { id: "perdido", nome: "Perdido", posicao: 4, tipo: "lost" },
];
const neg = (p: Partial<NegocioF> & { id: string }): NegocioF => ({
  etapaId: "lead",
  criadoEm: D("01"),
  fechadoEm: null,
  naEtapaDesde: D("01"),
  valorCentavos: 0,
  motivoPerda: "",
  ...p,
});
const ev = (dealId: string, para: string, dia: string, de: string | null = null): EventoF => ({ dealId, de, para, em: D(dia) });

describe("conversaoPorEtapa", () => {
  it("conta quem chegou em cada etapa, inclusive quem pulou etapa e quem ganhou", () => {
    const negocios = [
      neg({ id: "a", etapaId: "lead" }),
      neg({ id: "b", etapaId: "prop" }),
      neg({ id: "c", etapaId: "neg" }), // pulou Proposta
      neg({ id: "d", etapaId: "ganho", fechadoEm: D("09") }),
    ];
    const eventos = [
      ev("a", "lead", "01"),
      ev("b", "lead", "01"), ev("b", "prop", "03", "lead"),
      ev("c", "lead", "01"), ev("c", "neg", "04", "lead"),
      ev("d", "lead", "01"), ev("d", "prop", "02", "lead"), ev("d", "ganho", "09", "prop"),
    ];
    const r = conversaoPorEtapa(etapas, negocios, eventos);
    expect(r.map((x) => [x.nome, x.quantidade])).toEqual([
      ["Lead", 4], ["Proposta", 3], ["Negociação", 2], ["Ganho", 1],
    ]);
    expect(r[1].taxaDaAnterior).toBeCloseTo(0.75);
    expect(r[3].taxaDoInicio).toBeCloseTo(0.25);
  });

  it("perdido conta só até onde chegou antes de perder", () => {
    const negocios = [neg({ id: "x", etapaId: "perdido", fechadoEm: D("05"), motivoPerda: "preço" })];
    const eventos = [ev("x", "lead", "01"), ev("x", "prop", "02", "lead"), ev("x", "perdido", "05", "prop")];
    const r = conversaoPorEtapa(etapas, negocios, eventos);
    expect(r.map((x) => x.quantidade)).toEqual([1, 1, 0, 0]);
  });

  it("negócio sem nenhum evento usa a etapa atual", () => {
    const r = conversaoPorEtapa(etapas, [neg({ id: "z", etapaId: "prop" })], []);
    expect(r.map((x) => x.quantidade)).toEqual([1, 1, 0, 0]);
  });

  it("sem negócios: tudo zero, sem dividir por zero", () => {
    const r = conversaoPorEtapa(etapas, [], []);
    expect(r.every((x) => x.quantidade === 0 && x.taxaDaAnterior === 0 && x.taxaDoInicio === 0)).toBe(true);
  });
});

describe("tempoPorEtapa", () => {
  it("mediana em dias por etapa, contando quem ainda está nela até agora", () => {
    const eventos = [
      ev("a", "lead", "01"), ev("a", "prop", "03", "lead"), // 2 dias em Lead
      ev("b", "lead", "01"), ev("b", "prop", "05", "lead"), // 4 dias em Lead
      ev("c", "lead", "01"), // ainda em Lead
    ];
    const r = tempoPorEtapa(etapas, eventos, D("07"));
    const lead = r.find((x) => x.etapaId === "lead")!;
    expect(lead.medianaDias).toBe(4); // 2, 4, 6 → 4
    expect(lead.amostras).toBe(3);
    expect(lead.emAndamento).toBe(1);
  });

  it("etapas de fechamento ficam de fora", () => {
    const r = tempoPorEtapa(etapas, [ev("d", "ganho", "02")], D("07"));
    expect(r.some((x) => x.etapaId === "ganho")).toBe(false);
  });
});

describe("negociosParados / motivos / taxa / ciclo", () => {
  it("parados: abertos sem mudar de etapa há mais de N dias, mais antigos primeiro", () => {
    const r = negociosParados(
      etapas,
      [
        neg({ id: "velho", naEtapaDesde: D("01") }),
        neg({ id: "novo", naEtapaDesde: D("10") }),
        neg({ id: "fechado", etapaId: "ganho", fechadoEm: D("02"), naEtapaDesde: D("02") }),
      ],
      D("15"),
      7
    );
    expect(r.map((x) => [x.id, x.diasParado])).toEqual([["velho", 14]]);
  });

  it("parados pelo prazo da etapa e pela última atividade", () => {
    const comPrazo = etapas.map((e) => (e.tipo === "open" ? { ...e, diasParado: 3 } : e));
    const r = negociosParados(
      comPrazo,
      [
        neg({ id: "quieto", naEtapaDesde: D("10") }),
        neg({ id: "falou", naEtapaDesde: D("01"), ultimaAtividade: D("14") }),
      ],
      D("15")
    );
    expect(r.map((x) => [x.id, x.diasParado])).toEqual([["quieto", 5]]);
    // Prazo nulo: a etapa nunca deixa negócio parado.
    const nunca = etapas.map((e) => (e.tipo === "open" ? { ...e, diasParado: null } : e));
    expect(negociosParados(nunca, [neg({ id: "x", naEtapaDesde: D("01") })], D("15"))).toEqual([]);
  });

  it("motivos de perda agrupados, vazio vira 'Sem motivo'", () => {
    const r = motivosDePerda([
      neg({ id: "1", etapaId: "perdido", fechadoEm: D("02"), motivoPerda: "Preço" }),
      neg({ id: "2", etapaId: "perdido", fechadoEm: D("02"), motivoPerda: "preço " }),
      neg({ id: "3", etapaId: "perdido", fechadoEm: D("02"), motivoPerda: "" }),
    ], etapas);
    expect(r).toEqual([{ label: "Preço", value: 2 }, { label: "Sem motivo", value: 1 }]);
  });

  it("taxa de ganho e ciclo de venda", () => {
    const negocios = [
      neg({ id: "g1", etapaId: "ganho", criadoEm: D("01"), fechadoEm: D("05") }),
      neg({ id: "g2", etapaId: "ganho", criadoEm: D("01"), fechadoEm: D("11") }),
      neg({ id: "p1", etapaId: "perdido", criadoEm: D("01"), fechadoEm: D("03") }),
    ];
    expect(taxaDeGanho(negocios, etapas)).toBeCloseTo(2 / 3);
    expect(cicloDeVenda(negocios, etapas)).toBe(7); // 4 e 10 → mediana 7
    expect(taxaDeGanho([], etapas)).toBeNull();
    expect(cicloDeVenda([], etapas)).toBeNull();
  });
});
