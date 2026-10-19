import { describe, it, expect } from "vitest";
import { LAYOUT_PADRAO } from "@/lib/cartao-layout";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { blocosDoCartao, camposDisponiveis, textoDoCampo, tituloDoCartao } from "./cartao";
import type { NegocioKanban } from "./modelo";

const agora = new Date("2026-10-19T15:00:00Z");

const negocio = (extra: Partial<NegocioKanban> = {}): NegocioKanban => ({
  id: "d1",
  name: "Implantação anual",
  amountCents: 1_850_000,
  probability: 60,
  company: { id: "c1", name: "Padaria Bom Pão" },
  owner: { id: "u1", name: "Ana Souza" },
  contacts: [{ id: "k1", name: "Marina Costa", phone: "+55 11 98765-4321", email: "marina@bompao.com" }],
  openTasks: 0,
  expectedClosingAt: "2026-10-28T12:00:00.000Z",
  closedAt: null,
  customFields: { segmento: "varejo", consumo: 480 },
  createdAt: "2026-10-01T13:00:00.000Z",
  stageSince: "2026-10-16T13:00:00.000Z",
  whatsapp: { conversationId: "cv1", naoLida: true },
  nextTask: null,
  ...extra,
});

const def = (key: string, extra: Partial<DefinicaoDeCampo> = {}): DefinicaoDeCampo => ({
  id: `f-${key}`,
  entity: "deal",
  pipelineId: null,
  key,
  label: key,
  type: "text",
  options: [],
  required: false,
  helpText: "",
  showOnCard: false,
  position: 0,
  ...extra,
});

const defs = [
  def("segmento", { label: "Segmento", type: "select", options: [{ value: "varejo", label: "Varejo" }] as DefinicaoDeCampo["options"] }),
  def("consumo", { label: "Consumo", type: "number" }),
];
const ctx = { tipoDaEtapa: "open", agora, defs };

describe("tituloDoCartao", () => {
  it("com empresa: título é a empresa e o nome do negócio vira subtítulo", () => {
    expect(tituloDoCartao(negocio(), ["empresa", "nome"])).toEqual({ titulo: "Padaria Bom Pão", subtitulo: "Implantação anual" });
  });
  it("sem empresa no layout: título é o nome do negócio, sem repetir no subtítulo", () => {
    expect(tituloDoCartao(negocio(), ["nome", "valor"])).toEqual({ titulo: "Implantação anual", subtitulo: "" });
  });
  it("sem empresa cadastrada cai no contato", () => {
    expect(tituloDoCartao(negocio({ company: null }), ["empresa"]).titulo).toBe("Marina Costa");
  });
});

describe("blocosDoCartao", () => {
  it("respeita a ordem e agrupa métricas e etiquetas vizinhas", () => {
    const b = blocosDoCartao(["empresa", "cf:segmento", "valor", "probabilidade", "cf:consumo", "proximoPasso", "responsavel"], "confortavel");
    expect(b).toEqual([
      { tipo: "etiquetas", campos: ["cf:segmento"] },
      { tipo: "metricas", campos: ["valor", "probabilidade"] },
      { tipo: "etiquetas", campos: ["cf:consumo"] },
      { tipo: "linha", campo: "proximoPasso" },
      { tipo: "metricas", campos: ["responsavel"] },
    ]);
  });
  it("cabeçalho (empresa, nome, whatsapp) fica fora do corpo", () => {
    expect(blocosDoCartao(["empresa", "nome", "whatsapp"], "confortavel")).toEqual([]);
  });
  it("compacto: personalizado é uma linha cada", () => {
    expect(blocosDoCartao(["cf:segmento", "cf:consumo"], "compacto")).toEqual([
      { tipo: "linha", campo: "cf:segmento" },
      { tipo: "linha", campo: "cf:consumo" },
    ]);
  });
  it("layout padrão gera o cartão de sempre: métricas e próximo passo", () => {
    expect(blocosDoCartao(LAYOUT_PADRAO.campos, "confortavel")).toEqual([
      { tipo: "metricas", campos: ["valor", "probabilidade", "responsavel"] },
      { tipo: "linha", campo: "proximoPasso" },
    ]);
  });
});

describe("textoDoCampo", () => {
  it("formata padrão e personalizados", () => {
    const d = negocio();
    expect(textoDoCampo("valor", d, ctx)).toMatch(/R\$\s?18\.500/);
    expect(textoDoCampo("probabilidade", d, ctx)).toBe("60%");
    expect(textoDoCampo("previsao", d, ctx)).toBe("28/10/2026");
    expect(textoDoCampo("previsao", d, ctx, "curto")).toBe("Fecha 28 out");
    expect(textoDoCampo("naEtapaHa", d, ctx)).toBe("3 dias");
    expect(textoDoCampo("naEtapaHa", d, ctx, "curto")).toBe("3d na etapa");
    expect(textoDoCampo("criadoEm", d, ctx)).toBe("01/10/2026");
    expect(textoDoCampo("telefone", d, ctx)).toBe("+55 11 98765-4321");
    expect(textoDoCampo("email", d, ctx)).toBe("marina@bompao.com");
    expect(textoDoCampo("whatsapp", d, ctx)).toBe("Mensagem não lida");
    expect(textoDoCampo("cf:segmento", d, ctx)).toBe("Varejo");
    expect(textoDoCampo("cf:consumo", d, ctx)).toBe("480");
  });
  it("vazio quando não há valor ou o campo sumiu", () => {
    const d = negocio({ amountCents: 0, expectedClosingAt: null, contacts: [], owner: null });
    for (const c of ["valor", "previsao", "telefone", "email", "contato", "responsavel", "cf:nao-existe"] as const) {
      expect(textoDoCampo(c, d, ctx)).toBe("");
    }
  });
  it("produtos: resumo curto, vazio sem itens (e em quadro antigo sem o campo)", () => {
    expect(textoDoCampo("produtos", negocio({ produtos: ["Plano Pro", "Implantação", "Treinamento"] }), ctx)).toBe(
      "3 produtos · Plano Pro +2"
    );
    expect(textoDoCampo("produtos", negocio({ produtos: [] }), ctx)).toBe("");
    expect(textoDoCampo("produtos", negocio(), ctx)).toBe("");
  });
  it("próximo passo usa o sinal do cartão", () => {
    const d = negocio({ nextTask: { type: "ligar", text: "", dueAt: "2026-10-20T13:00:00.000Z" } });
    expect(textoDoCampo("proximoPasso", d, ctx)).toBe("Ligar amanhã 10h");
  });
});

describe("camposDisponiveis", () => {
  it("padrão e depois personalizados com prefixo cf:", () => {
    const c = camposDisponiveis(defs);
    expect(c[0]).toBe("empresa");
    expect(c.slice(-2)).toEqual(["cf:segmento", "cf:consumo"]);
  });
});
