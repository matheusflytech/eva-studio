import { describe, expect, it } from "vitest";
import { LAYOUT_PADRAO, erroDoLayout, normalizarLayout } from "./cartao-layout";

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
