import { describe, expect, it } from "vitest";
import { dividirLista, numerosDoArquivo, textoComOpcoes } from "./lista";

describe("numerosDoArquivo", () => {
  it("usa a coluna de telefone do cabeçalho", () => {
    const csv = "nome;Telefone;email\nAna;(11) 99999-0001;a@x.com\nBeto;+55 11 99999-0002;b@x.com\n";
    expect(numerosDoArquivo(csv)).toEqual(["11999990001", "5511999990002"]);
  });
  it("sem cabeçalho pega o número da linha e tira repetidos", () => {
    expect(numerosDoArquivo("5511999990001\n5511999990001\n11 99999-0003\nlixo\n")).toEqual(["5511999990001", "11999990003"]);
  });
  it("CSV com vírgula e BOM", () => {
    expect(numerosDoArquivo("﻿name,phone\nAna,5511999990001")).toEqual(["5511999990001"]);
  });
});

describe("textoComOpcoes", () => {
  it("anexa as opções numeradas", () => {
    expect(textoComOpcoes("Oi!", ["Quero", " ", "Não quero"])).toBe("Oi!\n\nResponda com o número:\n1. Quero\n2. Não quero");
  });
  it("sem opções fica igual", () => {
    expect(textoComOpcoes("Oi!", [])).toBe("Oi!");
  });
});

describe("dividirLista", () => {
  it("divide em partes parecidas, sem perder ninguém", () => {
    const partes = dividirLista(Array.from({ length: 10 }, (_, i) => i), 3);
    expect(partes.map((p) => p.length)).toEqual([4, 4, 2]);
    expect(partes.flat()).toHaveLength(10);
  });
  it("lista menor que as partes não cria parte vazia", () => {
    expect(dividirLista([1, 2], 5)).toEqual([[1], [2]]);
  });
});
