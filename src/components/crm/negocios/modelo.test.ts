import { describe, it, expect } from "vitest";
import {
  filtrarEtapas,
  resumoDoFunil,
  diasParado,
  iniciais,
  valorCurto,
  sinalDoNegocio,
  precisaAtencao,
  comparativoDeGanho,
  quandoCurto,
  serieDeGanhoDoMes,
  type EtapaKanban,
  type NegocioKanban,
} from "./modelo";

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
  whatsapp: null,
  nextTask: null,
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


describe("quandoCurto (fuso de São Paulo)", () => {
  const ref = new Date("2026-10-20T12:00:00Z"); // 09:00 em SP
  it("hoje e amanhã com hora; outros dias com data", () => {
    expect(quandoCurto("2026-10-20T19:00:00Z", ref)).toBe("hoje 16h");
    expect(quandoCurto("2026-10-21T13:30:00Z", ref)).toBe("amanhã 10h30");
    expect(quandoCurto("2026-10-28T15:00:00Z", ref)).toBe("28 out");
  });
});

describe("sinalDoNegocio", () => {
  const ag = new Date("2026-10-20T12:00:00Z");
  const base = (p: Partial<NegocioKanban>) => neg({ id: "s", stageSince: "2026-10-19T12:00:00Z", ...p });

  it("tarefa atrasada vem antes de tudo", () => {
    const n = base({ nextTask: { type: "ligar", text: "Retornar", dueAt: "2026-10-17T12:00:00Z" }, stageSince: "2026-10-01T12:00:00Z" });
    expect(sinalDoNegocio(n, "open", ag)).toEqual({ tom: "bad", icone: "clock", texto: "Retorno atrasado 3d" });
  });
  it("previsão de fechamento que já passou", () => {
    expect(sinalDoNegocio(base({ expectedClosingAt: "2026-10-18T12:00:00Z" }), "open", ag)).toEqual({ tom: "bad", icone: "cal", texto: "Fechamento passou 18 out" });
  });
  it("parado", () => {
    expect(sinalDoNegocio(base({ stageSince: "2026-10-08T12:00:00Z" }), "open", ag)).toEqual({ tom: "warn", icone: "hour", texto: "Parado 12 dias" });
  });
  it("próxima tarefa no prazo, pelo tipo", () => {
    expect(sinalDoNegocio(base({ nextTask: { type: "ligar", text: "x", dueAt: "2026-10-20T19:00:00Z" } }), "open", ag)).toEqual({ tom: "neu", icone: "phone", texto: "Ligar hoje 16h" });
    expect(sinalDoNegocio(base({ nextTask: { type: "reuniao", text: "x", dueAt: "2026-10-21T13:00:00Z" } }), "open", ag)).toEqual({ tom: "ok", icone: "cal", texto: "Reunião amanhã 10h" });
    expect(sinalDoNegocio(base({ nextTask: { type: "outro", text: "Enviar proposta revisada", dueAt: null } }), "open", ag)).toEqual({ tom: "neu", icone: "task", texto: "Enviar proposta revisada" });
  });
  it("só previsão futura", () => {
    expect(sinalDoNegocio(base({ expectedClosingAt: "2026-10-28T12:00:00Z" }), "open", ag)).toEqual({ tom: "neu", icone: "cal", texto: "Fecha 28 out" });
  });
  it("ganho mostra a data; perdido e sem nada não mostram", () => {
    expect(sinalDoNegocio(base({ closedAt: "2026-10-14T12:00:00Z" }), "won", ag)).toEqual({ tom: "ok", icone: "check", texto: "Ganho 14 out" });
    expect(sinalDoNegocio(base({ closedAt: "2026-10-14T12:00:00Z" }), "lost", ag)).toBeNull();
    expect(sinalDoNegocio(base({}), "open", ag)).toBeNull();
  });
});

describe("visões salvas e atenção", () => {
  it("Meus e Fechando este mês", () => {
    const e = [
      etapa({
        id: "x",
        deals: [
          neg({ id: "m", owner: { id: "eu", name: "Eu" }, expectedClosingAt: "2026-10-30T12:00:00Z" }),
          neg({ id: "o", owner: { id: "ot", name: "Outro" }, expectedClosingAt: "2026-11-05T12:00:00Z" }),
        ],
      }),
    ];
    expect(filtrarEtapas(e, { visao: "meus", meuId: "eu" }, AGORA)[0].deals.map((d) => d.id)).toEqual(["m"]);
    expect(filtrarEtapas(e, { visao: "fechando" }, AGORA)[0].deals.map((d) => d.id)).toEqual(["m"]);
  });
  it("atenção = parados + atrasados, sem contar duas vezes", () => {
    const e = [
      etapa({
        id: "y",
        deals: [
          neg({ id: "1", stageSince: dia("01"), nextTask: { type: "ligar", text: "", dueAt: dia("10") } }),
          neg({ id: "2", expectedClosingAt: dia("15") }),
          neg({ id: "3" }),
        ],
      }),
    ];
    expect(precisaAtencao(e, AGORA)).toBe(2);
    expect(filtrarEtapas(e, { visao: "atencao" }, AGORA)[0].deals.map((d) => d.id)).toEqual(["1", "2"]);
  });
  it("comparativo de ganho com o mês anterior", () => {
    const e = [etapa({ id: "g", type: "won", deals: [neg({ id: "a", amountCents: 300_00, closedAt: dia("05") }), neg({ id: "b", amountCents: 200_00, closedAt: "2026-09-20T12:00:00Z" })] })];
    expect(comparativoDeGanho(e, AGORA)).toEqual({ esteMesCents: 300_00, mesAnteriorCents: 200_00, variacao: 0.5 });
  });
});

describe("serieDeGanhoDoMes", () => {
  it("acumulado por dia do mês até hoje", () => {
    const e = [etapa({ id: "g", type: "won", deals: [neg({ id: "a", amountCents: 100, closedAt: dia("02") }), neg({ id: "b", amountCents: 50, closedAt: dia("04") }), neg({ id: "c", amountCents: 999, closedAt: "2026-09-30T12:00:00Z" })] })];
    const s = serieDeGanhoDoMes(e, new Date("2026-10-05T12:00:00Z"));
    expect(s).toEqual([0, 100, 100, 150, 150]);
  });
});
