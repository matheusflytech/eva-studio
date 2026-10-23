import { describe, expect, it } from "vitest";
import { ACOES_DO_CARTAO, LAYOUT_PADRAO, SECOES_DO_PAINEL, erroDoLayout, normalizarLayout, resolverLayout } from "./cartao-layout";

describe("normalizarLayout", () => {
  it("sem layout salvo usa o padrão mais os campos marcados no cartão", () => {
    const l = normalizarLayout(null, ["consumo"], ["consumo"]);
    expect(l.campos).toContain("cf:consumo");
    expect(l.previa).toContain("cf:consumo");
    expect(l.densidade).toBe("confortavel");
  });
  it("descarta campo desconhecido, repetido e personalizado que sumiu", () => {
    const l = normalizarLayout({ campos: ["valor", "valor", "xyz", "cf:apagado", "cf:ok"], previa: [], densidade: "compacto" }, ["ok"]);
    expect(l.campos).toEqual(["valor", "cf:ok"]);
    expect(l.previa).toEqual([]);
    expect(l.densidade).toBe("compacto");
  });
  it("lista ausente cai no padrão", () => {
    expect(normalizarLayout({ densidade: "compacto" }).campos).toEqual(LAYOUT_PADRAO.campos);
  });
});

describe("erroDoLayout", () => {
  it("aceita layout válido e recusa os inválidos", () => {
    expect(erroDoLayout({ campos: ["valor"], previa: ["cf:a"], densidade: "compacto" }, ["a"])).toBeNull();
    expect(erroDoLayout({ campos: ["valor"], previa: ["cf:b"], densidade: "compacto" }, ["a"])).toMatch(/desconhecido/);
    expect(erroDoLayout({ campos: Array(9).fill("valor"), previa: [], densidade: "compacto" }, [])).toMatch(/máximo/);
    expect(erroDoLayout({ campos: [], previa: [], densidade: "x" }, [])).toMatch(/Densidade/);
    expect(erroDoLayout("x", [])).toMatch(/inválido/);
  });
  it("produtos é um campo padrão do cartão e da prévia", () => {
    expect(erroDoLayout({ campos: ["valor", "produtos"], previa: ["produtos"], densidade: "confortavel" }, [])).toBeNull();
    expect(normalizarLayout({ campos: ["produtos"], previa: [], densidade: "compacto" }).campos).toEqual(["produtos"]);
  });
  it("o padrão não muda: quadro de quem não escolheu nada fica igual", () => {
    expect(LAYOUT_PADRAO.campos).not.toContain("produtos");
  });
});

describe("v4: ações do rodapé, seções do painel e padrão novo", () => {
  it("padrão novo segue os exemplos: contato em cima, valor, previsão e responsável; painel com detalhes, contato e atividade", () => {
    expect(LAYOUT_PADRAO.campos).toEqual(["contato", "valor", "previsao", "responsavel"]);
    expect(LAYOUT_PADRAO.previa).toEqual(["empresa", "valor", "etapa", "previsao", "responsavel", "ultimaInteracao", "criadoEm"]);
    expect(LAYOUT_PADRAO.acoes).toEqual([...ACOES_DO_CARTAO]);
    expect(LAYOUT_PADRAO.secoes).toEqual(["detalhes", "contato", "atividade"]);
  });

  it("layout salvo antes do v4 (sem ações e seções) continua valendo e ganha as do padrão", () => {
    const l = normalizarLayout({ campos: ["empresa", "valor"], previa: ["valor"], densidade: "compacto" });
    expect(l.campos).toEqual(["empresa", "valor"]);
    expect(l.acoes).toEqual(LAYOUT_PADRAO.acoes);
    expect(l.secoes).toEqual(LAYOUT_PADRAO.secoes);
  });

  it("ações e seções: tira desconhecida e repetida; painel nunca fica sem seção", () => {
    const l = normalizarLayout({ campos: [], previa: [], densidade: "compacto", acoes: ["ligar", "ligar", "fax"], secoes: [] });
    expect(l.acoes).toEqual(["ligar"]);
    expect(l.secoes).toEqual(["detalhes"]);
    expect(normalizarLayout({ campos: [], previa: [], densidade: "compacto", secoes: ["produtos", "x", "detalhes"] }).secoes).toEqual(["produtos", "detalhes"]);
    expect([...SECOES_DO_PAINEL]).toEqual(["detalhes", "contato", "atividade", "tarefas", "produtos"]);
  });

  it("validação aceita ações e seções válidas e recusa as inválidas", () => {
    const base = { campos: ["valor"], previa: ["etapa", "ultimaInteracao"], densidade: "confortavel" };
    expect(erroDoLayout({ ...base, acoes: ["whatsapp", "nota"], secoes: ["detalhes"] }, [])).toBeNull();
    expect(erroDoLayout(base, [])).toBeNull();
    expect(erroDoLayout({ ...base, acoes: ["fax"] }, [])).toMatch(/Ação desconhecida/);
    expect(erroDoLayout({ ...base, secoes: ["mapa"] }, [])).toMatch(/Seção desconhecida/);
  });

  it("a escolha da pessoa vale mais que a do funil", () => {
    const funil = normalizarLayout({ campos: ["valor"], previa: [], densidade: "compacto" });
    const pessoa = normalizarLayout({ campos: ["contato"], previa: [], densidade: "confortavel" });
    expect(resolverLayout(pessoa, funil)).toBe(pessoa);
    expect(resolverLayout(null, funil)).toBe(funil);
  });
});
