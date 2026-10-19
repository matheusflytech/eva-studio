import { describe, it, expect } from "vitest";
import { filtrarEtapas, resumoDoFunil, diasParado, iniciais, valorCurto, type EtapaKanban, type NegocioKanban } from "./modelo";

const AGORA = new Date("2026-10-20T12:00:00Z");
const dia = (d: string) => new Date(`2026-10-${d}T12:00:00Z`).toISOString();

const neg = (p: Partial<NegocioKanban> & { id: string }): NegocioKanban => ({
  name: `Negócio ${p.id}`,
  amountCents: 0,
  probability: 10,
  company: null,
  owner: null,
  contacts: [],
  openTasks: 0,
  expectedClosingAt: null,
  closedAt: null,
  customFields: {},
  createdAt: dia("01"),
  stageSince: dia("19"),
  ...p,
});

const etapa = (p: Partial<EtapaKanban> & { id: string; deals: NegocioKanban[] }): EtapaKanban => ({
  name: p.id,
  type: "open",
  color: "",
  probability: 10,
  totalCents: p.deals.reduce((s, d) => s + d.amountCents, 0),
  weightedCents: p.deals.reduce((s, d) => s + Math.round((d.amountCents * d.probability) / 100), 0),
  ...p,
});

const etapas: EtapaKanban[] = [
  etapa({
    id: "novo",
    deals: [
      neg({ id: "a", name: "Implantação Acme", amountCents: 100_000, company: { id: "c1", name: "Acme Ltda" }, owner: { id: "u1", name: "Ana Souza" } }),
      neg({ id: "b", name: "Renovação", amountCents: 50_000, stageSince: dia("01"), contacts: [{ id: "p1", name: "Bruno Lima" }] }),
    ],
  }),
  etapa({ id: "prop", probability: 60, deals: [neg({ id: "c", amountCents: 200_000, probability: 60, owner: { id: "u2", name: "Caio" } })] }),
  etapa({ id: "ganho", type: "won", deals: [neg({ id: "d", amountCents: 300_000, probability: 100, closedAt: dia("15") }), neg({ id: "e", amountCents: 70_000, closedAt: "2026-09-10T12:00:00Z" })] }),
  etapa({ id: "perdido", type: "lost", deals: [neg({ id: "f", amountCents: 10_000, closedAt: dia("05") })] }),
];

describe("filtrarEtapas", () => {
  it("busca por nome, empresa e contato, sem acento nem caixa", () => {
    expect(filtrarEtapas(etapas, { busca: "ACME" }, AGORA)[0].deals.map((d) => d.id)).toEqual(["a"]);
    expect(filtrarEtapas(etapas, { busca: "renovacao" }, AGORA)[0].deals.map((d) => d.id)).toEqual(["b"]);
    expect(filtrarEtapas(etapas, { busca: "bruno" }, AGORA)[0].deals.map((d) => d.id)).toEqual(["b"]);
  });

  it("filtra por responsável e por 'sem responsável'", () => {
    expect(filtrarEtapas(etapas, { dono: "u2" }, AGORA).flatMap((e) => e.deals.map((d) => d.id))).toEqual(["c"]);
    expect(filtrarEtapas(etapas, { dono: "__sem" }, AGORA)[0].deals.map((d) => d.id)).toEqual(["b"]);
  });

  it("só parados: abertos sem mudar de etapa há mais de 7 dias", () => {
    expect(filtrarEtapas(etapas, { soParados: true }, AGORA).flatMap((e) => e.deals.map((d) => d.id))).toEqual(["b"]);
  });

  it("recalcula total e ponderado da coluna depois do filtro", () => {
    const novo = filtrarEtapas(etapas, { busca: "acme" }, AGORA)[0];
    expect(novo.totalCents).toBe(100_000);
    expect(novo.weightedCents).toBe(10_000);
  });

  it("sem filtro devolve tudo igual", () => {
    expect(filtrarEtapas(etapas, {}, AGORA)).toEqual(etapas);
  });
});

describe("resumoDoFunil", () => {
  it("em aberto, ponderado, ganho no mês e parados", () => {
    expect(resumoDoFunil(etapas, AGORA)).toEqual({
      abertoCents: 350_000,
      abertos: 3,
      ponderadoCents: 135_000,
      ganhoNoMesCents: 300_000,
      ganhosNoMes: 1,
      parados: 1,
    });
  });
});

describe("helpers", () => {
  it("diasParado", () => {
    expect(diasParado(neg({ id: "x", stageSince: dia("13") }), AGORA)).toBe(7);
  });
  it("iniciais", () => {
    expect(iniciais("Ana Maria Souza")).toBe("AS");
    expect(iniciais("caio")).toBe("C");
    expect(iniciais("")).toBe("?");
  });
  it("valorCurto", () => {
    expect(valorCurto(150_000)).toBe("R$ 1,5 mil");
    expect(valorCurto(250_000_000)).toBe("R$ 2,5 mi");
    expect(valorCurto(9_900)).toBe("R$ 99");
  });
});
