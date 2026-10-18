import { describe, it, expect } from "vitest";
import {
  validarNome,
  validarEmail,
  normalizarTelefoneBR,
  validateCapture,
  isSkip,
  variavelDaCaptura,
  MENSAGEM_DE_ERRO,
} from "./capture-validation";

describe("validarNome", () => {
  it("aceita e limpa espaços", () => expect(validarNome("  Ana   Maria ")).toBe("Ana Maria"));
  it("recusa curto, só número, e-mail e longo", () => {
    expect(validarNome("A")).toBeNull();
    expect(validarNome("12345")).toBeNull();
    expect(validarNome("ana@x.com")).toBeNull();
    expect(validarNome("a".repeat(81))).toBeNull();
  });
});

describe("validarEmail", () => {
  it("aceita e põe em minúsculo", () => expect(validarEmail(" Ana@Empresa.COM.br ")).toBe("ana@empresa.com.br"));
  it("recusa formatos errados", () => {
    expect(validarEmail("ana@")).toBeNull();
    expect(validarEmail("ana empresa.com")).toBeNull();
    expect(validarEmail("ana@empresa")).toBeNull();
  });
});

describe("normalizarTelefoneBR", () => {
  it("celular com e sem formatação", () => {
    expect(normalizarTelefoneBR("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizarTelefoneBR("11987654321")).toBe("+5511987654321");
    expect(normalizarTelefoneBR("+55 11 98765 4321")).toBe("+5511987654321");
    expect(normalizarTelefoneBR("5511987654321")).toBe("+5511987654321");
  });
  it("fixo de 10 dígitos", () => expect(normalizarTelefoneBR("47 3333-4444")).toBe("+554733334444"));
  it("zero de interurbano na frente", () => {
    expect(normalizarTelefoneBR("011 98765-4321")).toBe("+5511987654321");
    expect(normalizarTelefoneBR("047 3333-4444")).toBe("+554733334444");
  });
  it("internacional com +", () => expect(normalizarTelefoneBR("+1 415 555 2671")).toBe("+14155552671"));
  it("recusa curto, DDD inválido e celular sem 9", () => {
    expect(normalizarTelefoneBR("98765-4321")).toBeNull();
    expect(normalizarTelefoneBR("(10) 98765-4321")).toBeNull(); // DDD não termina em 0
    expect(normalizarTelefoneBR("11887654321")).toBeNull();
    expect(normalizarTelefoneBR("abc")).toBeNull();
  });
});

describe("validateCapture", () => {
  it("texto livre aceita qualquer coisa não vazia", () => {
    expect(validateCapture("text", " oi ")).toEqual({ ok: true, value: "oi" });
    expect(validateCapture("text", "  ").ok).toBe(false);
  });
  it("delegação por tipo", () => {
    expect(validateCapture("email", "x@y.com")).toEqual({ ok: true, value: "x@y.com" });
    expect(validateCapture("phone", "11 98765-4321")).toEqual({ ok: true, value: "+5511987654321" });
    expect(validateCapture("name", "1").ok).toBe(false);
  });
  it("campo personalizado usa a regra do campo", () => {
    const def = { type: "number" as const, label: "Consumo", options: [] };
    expect(validateCapture("custom", "1.500", def)).toEqual({ ok: true, value: 1500 });
    expect(validateCapture("custom", "muito", def).ok).toBe(false);
    expect(validateCapture("custom", "qualquer").ok).toBe(false); // sem definição
  });
});

describe("isSkip / variavelDaCaptura / mensagens", () => {
  it("palavras de pular sem acento e caixa", () => {
    expect(isSkip("Pular")).toBe(true);
    expect(isSkip("prefiro nao")).toBe(true);
    expect(isSkip("Não quero")).toBe(true);
    expect(isSkip("pular essa")).toBe(false);
    expect(isSkip(undefined)).toBe(false);
  });
  it("variável onde a resposta é guardada", () => {
    expect(variavelDaCaptura({ captureField: "name" })).toBe("nome");
    expect(variavelDaCaptura({ captureField: "email" })).toBe("email");
    expect(variavelDaCaptura({ captureField: "phone" })).toBe("telefone");
    expect(variavelDaCaptura({ captureField: "custom", captureCustomKey: "consumo" })).toBe("consumo");
    expect(variavelDaCaptura({ variableName: "opcao" })).toBe("opcao");
  });
  it("tem mensagem de erro para cada tipo", () => {
    for (const k of ["text", "name", "email", "phone", "custom"] as const) expect(MENSAGEM_DE_ERRO[k]).toBeTruthy();
  });
});
