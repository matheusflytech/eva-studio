import { describe, it, expect } from "vitest";
import { interpolar, lerContatos, primeiroNome, telefonesPossiveis } from "./personalizar";

describe("primeiroNome", () => {
  it("pega a primeira palavra e arruma maiúsculas", () => {
    expect(primeiroNome("MARIA DA SILVA")).toBe("Maria");
    expect(primeiroNome("  joão ")).toBe("João");
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome("5511999990001")).toBe("");
  });
});

describe("interpolar", () => {
  it("com nome", () => {
    expect(interpolar("Olá, {firstname},\nTudo bem?", { firstname: "Maria" })).toBe("Olá, Maria,\nTudo bem?");
  });
  it("sem nome some junto com a vírgula/espaço de antes", () => {
    expect(interpolar("Olá, {firstname},\nTudo bem?", {})).toBe("Olá,\nTudo bem?");
    expect(interpolar("Oi {nome}!", { nome: "" })).toBe("Oi!");
  });
});

describe("telefonesPossiveis", () => {
  it("com e sem 55 e nono dígito", () => {
    const t = telefonesPossiveis("5511999990001@s.whatsapp.net");
    expect(t).toEqual(expect.arrayContaining(["5511999990001", "551199990001", "11999990001", "1199990001"]));
  });
});

describe("lerContatos", () => {
  it("número e nome na mesma linha, em qualquer ordem", () => {
    expect(lerContatos("5511999998888 Maria\nJoão Pedro; +55 (11) 99999-7777\n5511999996666")).toEqual([
      { numero: "5511999998888", nome: "Maria" },
      { numero: "+55 (11) 99999-7777", nome: "João Pedro" },
      { numero: "5511999996666", nome: "" },
    ]);
  });
  it("só números com vírgula viram vários; grupo passa igual", () => {
    expect(lerContatos("5511999990001, 5511999990002\n120363@g.us")).toEqual([
      { numero: "5511999990001", nome: "" },
      { numero: "5511999990002", nome: "" },
      { numero: "120363@g.us", nome: "" },
    ]);
  });
});
