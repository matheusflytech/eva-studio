import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  customField: { findMany: vi.fn() },
  deal: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  LIMITE_DE_LINHAS,
  agregar,
  chaveTemporal,
  chavesDeGrupo,
  faixasAutomaticas,
  listarNegociosDaConsulta,
  montarWhere,
  passaNaCondicao,
  passaNosFiltros,
  preencherBuracos,
  rodarConsulta,
  rotuloTemporal,
  whereDosFiltros,
  type Linha,
} from "./consulta";
import { CONSULTA_PADRAO, sanearConsulta, type Consulta, type FiltroDeConsulta, type FiltrosDeConsulta } from "@/lib/consulta";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";

const AGORA = new Date("2026-10-19T15:00:00Z"); // 12h em São Paulo
const D = (iso: string) => new Date(iso);

const def = (key: string, type: DefinicaoDeCampo["type"], options: { value: string; label: string }[] = []): DefinicaoDeCampo => ({
  id: key, entity: "deal", pipelineId: null, key, label: key[0].toUpperCase() + key.slice(1), type, options,
  required: false, helpText: "", showOnCard: false, position: 0,
});

const DEFS_LISTA = [
  def("segmento", "select", [{ value: "varejo", label: "Varejo" }, { value: "saude", label: "Saúde" }]),
  def("interesses", "multiselect", [{ value: "telhado", label: "Telhado" }, { value: "solo", label: "Solo" }, { value: "carport", label: "Carport" }]),
  def("consumo", "number"),
  def("orcamento", "currency"),
  def("visita", "date"),
  def("financia", "checkbox"),
  def("cidade", "text"),
];
const DEFS = new Map(DEFS_LISTA.map((d) => [d.key, d]));

let seq = 0;
const linha = (p: Partial<Linha> = {}): Linha => ({
  id: `d${++seq}`,
  name: "Negócio",
  pipelineId: "p1",
  stageId: "s1",
  ownerId: "u1",
  companyId: null,
  amountCents: 100_000,
  probability: 50,
  lostReason: "",
  expectedClosingAt: null,
  closedAt: null,
  createdAt: D("2026-10-10T12:00:00Z"),
  stageSince: D("2026-10-09T15:00:00Z"),
  customFields: {},
  stage: { id: "s1", name: "Lead", position: 0, type: "open" },
  owner: { id: "u1", name: "Ana" },
  pipeline: { id: "p1", name: "Vendas" },
  company: null,
  contacts: [],
  ...p,
});

const passa = (l: Linha, f: FiltroDeConsulta) => passaNaCondicao(l, f, DEFS, AGORA);

describe("passaNaCondicao — texto", () => {
  const l = linha({ name: "Usina Solar Campinas", lostReason: "" });
  it("é / não é / contém / não contém, sem caixa", () => {
    expect(passa(l, { campo: "nome", op: "eq", valor: "usina solar campinas" })).toBe(true);
    expect(passa(l, { campo: "nome", op: "neq", valor: "outra" })).toBe(true);
    expect(passa(l, { campo: "nome", op: "contem", valor: "SOLAR" })).toBe(true);
    expect(passa(l, { campo: "nome", op: "naoContem", valor: "solar" })).toBe(false);
  });
  it("vazio passa em 'não é' e 'não contém', e responde vazio/preenchido", () => {
    expect(passa(l, { campo: "motivoPerda", op: "neq", valor: "preço" })).toBe(true);
    expect(passa(l, { campo: "motivoPerda", op: "naoContem", valor: "preço" })).toBe(true);
    expect(passa(l, { campo: "motivoPerda", op: "eq", valor: "preço" })).toBe(false);
    expect(passa(l, { campo: "motivoPerda", op: "vazio" })).toBe(true);
    expect(passa(linha({ lostReason: "Preço alto" }), { campo: "motivoPerda", op: "preenchido" })).toBe(true);
  });
  it("campo personalizado de texto", () => {
    expect(passa(linha({ customFields: { cidade: "Campinas" } }), { campo: "cf:cidade", op: "contem", valor: "camp" })).toBe(true);
  });
});

describe("passaNaCondicao — listas", () => {
  it("é qualquer de / não é nenhum de, inclusive 'sem responsável'", () => {
    const semDono = linha({ ownerId: null, owner: null });
    expect(passa(linha(), { campo: "responsavel", op: "qualquer", valores: ["u1", "u2"] })).toBe(true);
    expect(passa(linha(), { campo: "responsavel", op: "nenhum", valores: ["u1"] })).toBe(false);
    expect(passa(semDono, { campo: "responsavel", op: "qualquer", valores: ["__nenhum"] })).toBe(true);
    expect(passa(semDono, { campo: "responsavel", op: "nenhum", valores: ["u1"] })).toBe(true);
    expect(passa(semDono, { campo: "responsavel", op: "nenhum", valores: ["__nenhum"] })).toBe(false);
    expect(passa(semDono, { campo: "responsavel", op: "vazio" })).toBe(true);
  });
  it("funil, etapa, situação da etapa e empresa", () => {
    const l = linha({ companyId: "c1", stage: { id: "s9", name: "Ganho", position: 3, type: "won" }, stageId: "s9", pipelineId: "p2" });
    expect(passa(l, { campo: "funil", op: "qualquer", valores: ["p2"] })).toBe(true);
    expect(passa(l, { campo: "etapa", op: "nenhum", valores: ["s9"] })).toBe(false);
    expect(passa(l, { campo: "tipoEtapa", op: "qualquer", valores: ["won", "lost"] })).toBe(true);
    expect(passa(l, { campo: "empresa", op: "preenchido" })).toBe(true);
  });
  it("etiqueta e canal de ALGUM contato do negócio", () => {
    const l = linha({
      contacts: [
        { contact: { tags: [{ tagId: "vip" }], channels: [{ channel: "instagram" }] } },
        { contact: { tags: [{ tagId: "frio" }], channels: [] } },
      ],
    });
    expect(passa(l, { campo: "etiqueta", op: "qualquer", valores: ["frio"] })).toBe(true);
    expect(passa(l, { campo: "etiqueta", op: "nenhum", valores: ["vip"] })).toBe(false);
    expect(passa(l, { campo: "canal", op: "qualquer", valores: ["whatsapp_qr"] })).toBe(false);
    expect(passa(linha(), { campo: "canal", op: "vazio" })).toBe(true);
  });
  it("select personalizado, inclusive filtro antigo com 'é'", () => {
    const l = linha({ customFields: { segmento: "saude" } });
    expect(passa(l, { campo: "cf:segmento", op: "qualquer", valores: ["varejo", "saude"] })).toBe(true);
    expect(passa(l, { campo: "cf:segmento", op: "eq", valor: "saude" })).toBe(true);
    expect(passa(l, { campo: "cf:segmento", op: "neq", valor: "saude" })).toBe(false);
    expect(passa(linha(), { campo: "cf:segmento", op: "nenhum", valores: ["saude"] })).toBe(true);
  });
  it("multiselect: contém qualquer, contém todos, não contém", () => {
    const l = linha({ customFields: { interesses: ["telhado", "solo"] } });
    expect(passa(l, { campo: "cf:interesses", op: "qualquer", valores: ["solo", "carport"] })).toBe(true);
    expect(passa(l, { campo: "cf:interesses", op: "todos", valores: ["telhado", "solo"] })).toBe(true);
    expect(passa(l, { campo: "cf:interesses", op: "todos", valores: ["telhado", "carport"] })).toBe(false);
    expect(passa(l, { campo: "cf:interesses", op: "nenhum", valores: ["carport"] })).toBe(true);
    expect(passa(l, { campo: "cf:interesses", op: "nenhum", valores: ["solo"] })).toBe(false);
  });
});

describe("passaNaCondicao — número", () => {
  const l = linha({ amountCents: 500_050, probability: 40, customFields: { consumo: 480, orcamento: 2_850_000 } });
  it("=, ≠, >, ≥, <, ≤ e entre no valor (em reais, formato brasileiro)", () => {
    expect(passa(l, { campo: "valor", op: "eq", valor: "5.000,50" })).toBe(true);
    expect(passa(l, { campo: "valor", op: "neq", valor: "5000,50" })).toBe(false);
    expect(passa(l, { campo: "valor", op: "gt", valor: "5000" })).toBe(true);
    expect(passa(l, { campo: "valor", op: "gte", valor: "5000,5" })).toBe(true);
    expect(passa(l, { campo: "valor", op: "lt", valor: "5000,5" })).toBe(false);
    expect(passa(l, { campo: "valor", op: "lte", valor: "5000,5" })).toBe(true);
    expect(passa(l, { campo: "valor", op: "entre", valor: "6000", ate: "1000" })).toBe(true);
    expect(passa(l, { campo: "probabilidade", op: "entre", valor: "50", ate: "100" })).toBe(false);
  });
  it("campos personalizados de número e de moeda", () => {
    expect(passa(l, { campo: "cf:consumo", op: "gte", valor: "480" })).toBe(true);
    expect(passa(l, { campo: "cf:orcamento", op: "gt", valor: "28.000" })).toBe(true);
    expect(passa(linha(), { campo: "cf:consumo", op: "vazio" })).toBe(true);
    expect(passa(linha(), { campo: "cf:consumo", op: "gt", valor: "1" })).toBe(false);
    expect(passa(linha(), { campo: "cf:consumo", op: "neq", valor: "1" })).toBe(true);
  });
  it("dias na etapa atual, contado até agora", () => {
    // stageSince 09/10 15h → 10 dias completos em 19/10 15h.
    expect(passa(linha(), { campo: "diasNaEtapa", op: "gte", valor: "10" })).toBe(true);
    expect(passa(linha(), { campo: "diasNaEtapa", op: "gt", valor: "10" })).toBe(false);
  });
});

describe("passaNaCondicao — data (dia de São Paulo)", () => {
  // 01h UTC do dia 11 = 22h do dia 10 em São Paulo.
  const l = linha({ createdAt: D("2026-10-11T01:00:00Z"), closedAt: null, expectedClosingAt: D("2026-10-24T12:00:00Z"), customFields: { visita: "2026-10-05" } });
  it("em, antes, depois, entre", () => {
    expect(passa(l, { campo: "criadoEm", op: "em", valor: "2026-10-10" })).toBe(true);
    expect(passa(l, { campo: "criadoEm", op: "antes", valor: "2026-10-10" })).toBe(false);
    expect(passa(l, { campo: "criadoEm", op: "antes", valor: "2026-10-11" })).toBe(true);
    expect(passa(l, { campo: "criadoEm", op: "depois", valor: "2026-10-09" })).toBe(true);
    expect(passa(l, { campo: "criadoEm", op: "entre", valor: "2026-10-10", ate: "2026-10-10" })).toBe(true);
    expect(passa(l, { campo: "cf:visita", op: "entre", valor: "2026-10-01", ate: "2026-10-04" })).toBe(false);
  });
  it("nos últimos / próximos N dias, contando hoje", () => {
    expect(passa(l, { campo: "criadoEm", op: "ultimos", valor: "10" })).toBe(true); // 10..19
    expect(passa(l, { campo: "criadoEm", op: "ultimos", valor: "9" })).toBe(false); // 11..19
    expect(passa(l, { campo: "previsao", op: "proximos", valor: "6" })).toBe(true); // 19..24
    expect(passa(l, { campo: "previsao", op: "proximos", valor: "5" })).toBe(false);
  });
  it("preenchido / vazio, e data vazia não passa em comparação", () => {
    expect(passa(l, { campo: "fechadoEm", op: "vazio" })).toBe(true);
    expect(passa(l, { campo: "fechadoEm", op: "depois", valor: "2000-01-01" })).toBe(false);
    expect(passa(l, { campo: "previsao", op: "preenchido" })).toBe(true);
  });
  it("filtro antigo 'maior que' numa data personalizada vira 'depois de'", () => {
    expect(passa(l, { campo: "cf:visita", op: "gt", valor: "2026-10-04" })).toBe(true);
    expect(passa(l, { campo: "cf:visita", op: "lt", valor: "2026-10-05" })).toBe(false);
  });
});

describe("passaNaCondicao — sim/não e campo apagado", () => {
  it("checkbox nunca marcado conta como 'não'", () => {
    expect(passa(linha({ customFields: { financia: true } }), { campo: "cf:financia", op: "eq", valor: "true" })).toBe(true);
    expect(passa(linha(), { campo: "cf:financia", op: "eq", valor: "false" })).toBe(true);
    expect(passa(linha(), { campo: "cf:financia", op: "eq", valor: "true" })).toBe(false);
  });
  it("condição de campo que não existe mais é ignorada", () => {
    expect(passa(linha(), { campo: "cf:apagado", op: "eq", valor: "x" })).toBe(true);
  });
});

describe("passaNosFiltros — E/OU em grupos", () => {
  const caro = linha({ amountCents: 1_000_000, customFields: { segmento: "varejo" } });
  const barato = linha({ amountCents: 10_000, customFields: { segmento: "saude" } });
  const valor = (op: FiltroDeConsulta["op"], v: string): FiltroDeConsulta => ({ campo: "valor", op, valor: v });
  const seg = (v: string): FiltroDeConsulta => ({ campo: "cf:segmento", op: "qualquer", valores: [v] });

  it("grupo E: todas; grupo OU: qualquer", () => {
    const e: FiltrosDeConsulta = { logica: "e", grupos: [{ logica: "e", condicoes: [valor("gte", "5000"), seg("saude")] }] };
    const ou: FiltrosDeConsulta = { logica: "e", grupos: [{ logica: "ou", condicoes: [valor("gte", "5000"), seg("saude")] }] };
    expect([caro, barato].map((l) => passaNosFiltros(l, e, DEFS, AGORA))).toEqual([false, false]);
    expect([caro, barato].map((l) => passaNosFiltros(l, ou, DEFS, AGORA))).toEqual([true, true]);
  });

  it("entre grupos: (A e B) ou (C)", () => {
    const f: FiltrosDeConsulta = {
      logica: "ou",
      grupos: [
        { logica: "e", condicoes: [valor("gte", "5000"), seg("varejo")] },
        { logica: "e", condicoes: [valor("lt", "50")] },
      ],
    };
    expect(passaNosFiltros(caro, f, DEFS, AGORA)).toBe(true);
    expect(passaNosFiltros(barato, f, DEFS, AGORA)).toBe(false);
    expect(passaNosFiltros(linha({ amountCents: 1_000 }), f, DEFS, AGORA)).toBe(true);
  });

  it("sem grupos, passa tudo", () => {
    expect(passaNosFiltros(barato, { logica: "e", grupos: [] }, DEFS, AGORA)).toBe(true);
  });
});

describe("whereDosFiltros — pré-seleção no banco", () => {
  it("coluna fixa vai pro banco; campo personalizado fica pra memória", () => {
    const w = whereDosFiltros(
      { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "valor", op: "gte", valor: "5000" }, { campo: "cf:segmento", op: "qualquer", valores: ["x"] }] }] },
      AGORA
    );
    expect(w).toEqual({ amountCents: { gte: 500000 } });
  });

  it("num OU, uma condição que o banco não avalia torna o grupo todo 'verdadeiro'", () => {
    const w = whereDosFiltros(
      { logica: "e", grupos: [{ logica: "ou", condicoes: [{ campo: "valor", op: "gte", valor: "5000" }, { campo: "diasNaEtapa", op: "gt", valor: "3" }] }] },
      AGORA
    );
    expect(w).toBeNull();
  });

  it("OU entre grupos fixos vira OR; 'sem responsável' vira ownerId nulo", () => {
    const w = whereDosFiltros(
      {
        logica: "ou",
        grupos: [
          { logica: "e", condicoes: [{ campo: "responsavel", op: "qualquer", valores: ["u1", "__nenhum"] }] },
          { logica: "e", condicoes: [{ campo: "etiqueta", op: "qualquer", valores: ["vip"] }] },
        ],
      },
      AGORA
    );
    expect(w).toEqual({
      OR: [
        { OR: [{ ownerId: { in: ["u1"] } }, { ownerId: null }] },
        { contacts: { some: { contact: { tags: { some: { tagId: { in: ["vip"] } } } } } } },
      ],
    });
  });

  it("'não é nenhum de' num campo anulável não corta quem está sem valor", () => {
    expect(whereDosFiltros({ logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "empresa", op: "nenhum", valores: ["c1"] }] }] }, AGORA)).toEqual({
      OR: [{ companyId: null }, { companyId: { notIn: ["c1"] } }],
    });
  });

  it("datas viram limites do dia de São Paulo", () => {
    expect(whereDosFiltros({ logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "fechadoEm", op: "entre", valor: "2026-10-01", ate: "2026-10-31" }] }] }, AGORA)).toEqual({
      closedAt: { gte: new Date("2026-10-01T03:00:00Z"), lt: new Date("2026-11-01T03:00:00Z") },
    });
  });

  it("valor com centavos quebrados arredonda o limite pra fora", () => {
    expect(whereDosFiltros({ logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "valor", op: "lt", valor: "10,005" }] }] }, AGORA)).toEqual({
      amountCents: { lte: 1001 },
    });
  });
});

describe("montarWhere — funis, período e filtros globais", () => {
  const base: Consulta = { ...CONSULTA_PADRAO, agrupar: "", status: "todos" };

  it("vários funis do cartão e os do painel somam com E; organização sempre fixa", () => {
    const w = montarWhere("org1", { ...base, funilIds: ["p1", "p2"] }, { globais: { dias: 30, funis: ["p2"], donos: ["u9"] }, agora: AGORA }, null);
    expect(w).toEqual({
      orgId: "org1",
      archivedAt: null,
      AND: [{ pipelineId: { in: ["p1", "p2"] } }, { pipelineId: { in: ["p2"] } }, { ownerId: { in: ["u9"] } }],
    });
  });

  it("data base escolhe a coluna do período (previsão)", () => {
    const w = montarWhere("o", { ...base, dataBase: "previsao" }, { agora: AGORA }, { de: "2026-11-01", ate: "2026-11-30" });
    expect(w.AND).toEqual([{ expectedClosingAt: { gte: new Date("2026-11-01T03:00:00Z"), lt: new Date("2026-12-01T03:00:00Z") } }]);
  });

  it("sem data base: ganhos contam pelo fechamento, como antes", () => {
    const w = montarWhere("o", { ...base, status: "ganhos" }, { agora: AGORA }, { de: "2026-10-01", ate: "2026-10-01" });
    expect(w.AND).toEqual([{ stage: { type: "won" } }, { closedAt: { gte: new Date("2026-10-01T03:00:00Z"), lt: new Date("2026-10-02T03:00:00Z") } }]);
  });
});

describe("agrupamentos no tempo (São Paulo)", () => {
  it("semana começa na segunda; trimestre e mês", () => {
    expect(chaveTemporal("2026-10-19", "semana")).toBe("2026-10-19"); // segunda
    expect(chaveTemporal("2026-10-25", "semana")).toBe("2026-10-19"); // domingo
    expect(chaveTemporal("2026-11-30", "trimestre")).toBe("2026-T4");
    expect(chaveTemporal("2026-03-31", "trimestre")).toBe("2026-T1");
    expect(rotuloTemporal("2026-T4", "trimestre")).toBe("4º tri/2026");
    expect(rotuloTemporal("2026-10", "mes")).toBe("10/2026");
  });

  it("negócio das 23h de domingo em SP cai naquela semana, não na seguinte", () => {
    // 2026-10-26T02:00Z = domingo 25/10 23h em São Paulo.
    const l = linha({ createdAt: D("2026-10-26T02:00:00Z") });
    const c: Consulta = { ...CONSULTA_PADRAO, agrupar: "semana" };
    expect(chavesDeGrupo(l, c, DEFS)[0].chave).toBe("2026-10-19");
  });

  it("preenche os baldes vazios", () => {
    expect(preencherBuracos("2026-10-14", "2026-10-28", "semana")).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(preencherBuracos("2026-02-10", "2026-08-01", "trimestre")).toEqual(["2026-T1", "2026-T2", "2026-T3"]);
    expect(preencherBuracos("2026-10-30", "2026-11-02", "dia")).toHaveLength(4);
  });
});

describe("agrupamentos novos", () => {
  const c = (agrupar: string): Consulta => ({ ...CONSULTA_PADRAO, agrupar });
  it("faixas de valor", () => {
    expect(chavesDeGrupo(linha({ amountCents: 100_000 }), c("faixaValor"), DEFS)[0].label).toBe("Até R$ 1 mil");
    expect(chavesDeGrupo(linha({ amountCents: 300_000 }), c("faixaValor"), DEFS)[0].label).toBe("R$ 1 mil a 5 mil");
    expect(chavesDeGrupo(linha({ amountCents: 15_000_000 }), c("faixaValor"), DEFS)[0].label).toBe("Acima de R$ 100 mil");
  });
  it("campo de moeda usa as mesmas faixas; campo de número, faixas automáticas", () => {
    expect(chavesDeGrupo(linha({ customFields: { orcamento: 2_850_000 } }), c("cf:orcamento"), DEFS)[0].label).toBe("R$ 20 mil a 100 mil");
    const faixas = faixasAutomaticas([120, 480, 900]);
    expect(faixas).toEqual({ inicio: 0, passo: 200 });
    expect(chavesDeGrupo(linha({ customFields: { consumo: 480 } }), c("cf:consumo"), DEFS, faixas)[0].label).toBe("400 a 600");
  });
  it("funil, situação, empresa, motivo de perda e canal (um grupo por canal)", () => {
    const l = linha({
      company: { id: "c1", name: "ACME" },
      lostReason: "Preço",
      stage: { id: "s9", name: "Perdido", position: 4, type: "lost" },
      contacts: [{ contact: { channels: [{ channel: "instagram" }, { channel: "whatsapp_qr" }] } }],
    });
    expect(chavesDeGrupo(l, c("funil"), DEFS)[0].label).toBe("Vendas");
    expect(chavesDeGrupo(l, c("tipoEtapa"), DEFS)[0].label).toBe("Perdida");
    expect(chavesDeGrupo(l, c("empresa"), DEFS)[0].label).toBe("ACME");
    expect(chavesDeGrupo(linha(), c("empresa"), DEFS)[0].label).toBe("Sem empresa");
    expect(chavesDeGrupo(l, c("motivoPerda"), DEFS)[0].label).toBe("Preço");
    expect(chavesDeGrupo(l, c("canal"), DEFS).map((k) => k.label)).toEqual(["Instagram", "WhatsApp"]);
  });
});

describe("medidas", () => {
  const ls = [10, 20, 30, 100].map((r) => linha({ amountCents: r * 100 }));
  const m = (medida: Consulta["medida"]) => agregar(ls, { ...CONSULTA_PADRAO, medida, campo: "valor" }, DEFS);
  it("mediana, mínimo, máximo", () => {
    expect(m("mediana")).toBe(25);
    expect(agregar(ls.slice(0, 3), { ...CONSULTA_PADRAO, medida: "mediana", campo: "valor" }, DEFS)).toBe(20);
    expect(m("minimo")).toBe(10);
    expect(m("maximo")).toBe(100);
    expect(agregar([], { ...CONSULTA_PADRAO, medida: "maximo", campo: "valor" }, DEFS)).toBeNull();
  });
  it("taxa de ganho = ganhos ÷ (ganhos + perdidos); sem fechados, null", () => {
    const ganho = linha({ stage: { id: "g", name: "Ganho", position: 3, type: "won" } });
    const perdido = linha({ stage: { id: "x", name: "Perdido", position: 4, type: "lost" } });
    const c = { ...CONSULTA_PADRAO, medida: "taxaGanho" as const };
    expect(agregar([ganho, ganho, ganho, perdido, linha()], c, DEFS)).toBe(0.75);
    expect(agregar([linha()], c, DEFS)).toBeNull();
  });
});

describe("rodarConsulta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.customField.findMany.mockResolvedValue(DEFS_LISTA.map((d) => ({ ...d, options: d.options })));
  });

  it("consulta só a organização pedida e reaplica os filtros em memória", async () => {
    db.deal.findMany.mockResolvedValue([
      linha({ customFields: { segmento: "varejo" } }),
      linha({ customFields: { segmento: "saude" } }),
    ]);
    const c = sanearConsulta({
      medida: "contagem",
      agrupar: "",
      status: "todos",
      filtros: { logica: "e", grupos: [{ logica: "e", condicoes: [{ campo: "cf:segmento", op: "qualquer", valores: ["saude"] }] }] },
    })!;
    const r = await rodarConsulta("org1", c, { agora: AGORA });
    expect(r).toMatchObject({ tipo: "numero", valor: 1, negocios: 1, truncado: false });
    expect(db.customField.findMany.mock.calls[0][0].where).toEqual({ orgId: "org1", entity: "deal" });
    expect(db.deal.findMany.mock.calls[0][0].where).toMatchObject({ orgId: "org1", archivedAt: null });
    expect(db.deal.findMany.mock.calls[0][0].take).toBe(LIMITE_DE_LINHAS + 1);
  });

  it("avisa quando bate o limite de linhas", async () => {
    db.deal.findMany.mockResolvedValue(Array.from({ length: LIMITE_DE_LINHAS + 1 }, () => linha()));
    const r = await rodarConsulta("o", { ...CONSULTA_PADRAO, agrupar: "" }, { agora: AGORA });
    expect(r).toMatchObject({ tipo: "numero", valor: LIMITE_DE_LINHAS, truncado: true });
  });

  it("comparar: mesmo cálculo no período anterior de mesmo tamanho, com variação", async () => {
    db.deal.findMany
      .mockResolvedValueOnce([linha({ amountCents: 300_00 }), linha({ amountCents: 300_00 })])
      .mockResolvedValueOnce([linha({ amountCents: 400_00 })]);
    const c: Consulta = { ...CONSULTA_PADRAO, medida: "soma", campo: "valor", agrupar: "", status: "todos", periodo: "painel", comparar: true };
    const r = await rodarConsulta("o", c, { agora: AGORA, globais: { dias: 30, de: "2026-10-01", ate: "2026-10-10", funis: [], donos: [] } });
    expect(r).toMatchObject({ tipo: "numero", valor: 600, anterior: 400, variacao: 0.5, janelaAnterior: { de: "2026-09-21", ate: "2026-09-30" } });
    const [atual, anterior] = db.deal.findMany.mock.calls.map((x) => x[0].where.AND);
    expect(atual).toEqual([{ createdAt: { gte: new Date("2026-10-01T03:00:00Z"), lt: new Date("2026-10-11T03:00:00Z") } }]);
    expect(anterior).toEqual([{ createdAt: { gte: new Date("2026-09-21T03:00:00Z"), lt: new Date("2026-10-01T03:00:00Z") } }]);
  });

  it("comparar com todo o histórico não tem período anterior", async () => {
    db.deal.findMany.mockResolvedValue([linha()]);
    const r = await rodarConsulta("o", { ...CONSULTA_PADRAO, agrupar: "", comparar: true }, { agora: AGORA });
    expect(db.deal.findMany).toHaveBeenCalledTimes(1);
    expect(r).not.toHaveProperty("anterior");
  });

  it("agrupar por mês preenche a janela do painel com zeros", async () => {
    db.deal.findMany.mockResolvedValue([linha({ createdAt: D("2026-09-15T12:00:00Z") })]);
    const c: Consulta = { ...CONSULTA_PADRAO, agrupar: "mes", status: "todos", periodo: { de: "2026-08-01", ate: "2026-10-31" } };
    const r = await rodarConsulta("o", c, { agora: AGORA });
    expect(r).toMatchObject({ tipo: "pontos", pontos: [{ label: "08/2026", value: 0 }, { label: "09/2026", value: 1 }, { label: "10/2026", value: 0 }] });
  });

  it("vários funis por etapa: o rótulo diz de qual funil é a etapa", async () => {
    db.deal.findMany.mockResolvedValue([linha(), linha({ pipelineId: "p2", pipeline: { id: "p2", name: "Pós-venda" }, stageId: "s2", stage: { id: "s2", name: "Lead", position: 0, type: "open" } })]);
    const r = await rodarConsulta("o", { ...CONSULTA_PADRAO, funilIds: ["p1", "p2"] }, { agora: AGORA });
    expect(r.tipo === "pontos" && r.pontos.map((p) => p.label)).toEqual(["Lead · Vendas", "Lead · Pós-venda"]);
    expect(db.deal.findMany.mock.calls[0][0].where.AND).toContainEqual({ pipelineId: { in: ["p1", "p2"] } });
  });

  it("taxa de ganho por responsável sai em porcento", async () => {
    db.deal.findMany.mockResolvedValue([
      linha({ stage: { id: "g", name: "Ganho", position: 3, type: "won" } }),
      linha({ stage: { id: "x", name: "Perdido", position: 4, type: "lost" } }),
    ]);
    const r = await rodarConsulta("o", { ...CONSULTA_PADRAO, medida: "taxaGanho", agrupar: "responsavel", status: "todos" }, { agora: AGORA });
    expect(r).toMatchObject({ tipo: "pontos", formato: "porcento", pontos: [{ label: "Ana", value: 0.5 }] });
  });

  it("busca contatos só quando precisa (etiqueta, canal)", async () => {
    db.deal.findMany.mockResolvedValue([]);
    await rodarConsulta("o", { ...CONSULTA_PADRAO }, { agora: AGORA });
    expect(db.deal.findMany.mock.calls[0][0].include.contacts).toBeUndefined();
    await rodarConsulta("o", { ...CONSULTA_PADRAO, agrupar: "canal" }, { agora: AGORA });
    expect(db.deal.findMany.mock.calls[1][0].include.contacts).toBeDefined();
  });

  it("tabela usa a data base escolhida e avisa truncado", async () => {
    db.deal.findMany.mockResolvedValue([
      linha({ name: "A", expectedClosingAt: D("2026-11-01T12:00:00Z") }),
      linha({ name: "B", expectedClosingAt: D("2026-12-01T12:00:00Z") }),
    ]);
    const r = await listarNegociosDaConsulta("o", { ...CONSULTA_PADRAO, agrupar: "", dataBase: "previsao" }, { agora: AGORA });
    expect(r).toMatchObject({ tipo: "tabela", truncado: false, negocios: 2 });
    expect(r.tipo === "tabela" && r.linhas.map((l) => [l.titulo, l.quando])).toEqual([
      ["B", "2026-12-01T12:00:00.000Z"],
      ["A", "2026-11-01T12:00:00.000Z"],
    ]);
  });
});
