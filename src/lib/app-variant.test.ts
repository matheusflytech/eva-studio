import { describe, expect, it } from "vitest";
import { destinoNoAmbienteUnico, redirecionarSecao, varianteDe } from "./app-variant";

describe("app de disparos", () => {
  it("só 'disparos' liga o modo; o resto é o Eva", () => {
    expect(varianteDe("disparos")).toBe("disparos");
    expect(varianteDe(undefined)).toBe("eva");
    expect(varianteDe("outra")).toBe("eva");
  });

  it("no Eva nenhuma seção é desviada", () => {
    expect(redirecionarSecao("eva", "8d8d3a8c", "deals")).toBeNull();
  });

  it("no app de disparos as seções dele ficam e as outras voltam ao início", () => {
    for (const s of ["home", "broadcasts", "conversations", "contacts", "agent-studio", "settings"]) {
      expect(redirecionarSecao("disparos", "8d8d3a8c", s)).toBeNull();
    }
    expect(redirecionarSecao("disparos", "8d8d3a8c", "deals")).toBe("/8d8d3a8c/home");
    expect(redirecionarSecao("disparos", "8d8d3a8c", "tasks")).toBe("/8d8d3a8c/home");
  });
});

describe("ambiente único do app de disparos", () => {
  const org = "abcdef12-0000-4000-8000-000000000000";
  it("raiz, escolha de contrato e /go vão direto para o painel", () => {
    expect(destinoNoAmbienteUnico(org, "/")).toBe("/abcdef12/home");
    expect(destinoNoAmbienteUnico(org, "/contracts")).toBe("/abcdef12/home");
    expect(destinoNoAmbienteUnico(org, "/go")).toBe("/abcdef12/home");
  });
  it("outro contrato vira o do app, mantendo a tela", () => {
    expect(destinoNoAmbienteUnico(org, "/8d8d3a8c/broadcasts")).toBe("/abcdef12/broadcasts");
  });
  it("o contrato do app (curto ou completo) e rotas fora de contrato ficam", () => {
    expect(destinoNoAmbienteUnico(org, "/abcdef12/home")).toBeNull();
    expect(destinoNoAmbienteUnico(org, `/${org}/home`)).toBeNull();
    expect(destinoNoAmbienteUnico(org, "/login")).toBeNull();
    expect(destinoNoAmbienteUnico(org, "/api/me")).toBeNull();
  });
  it("sem org configurada (Eva) nada muda", () => {
    expect(destinoNoAmbienteUnico(null, "/contracts")).toBeNull();
  });
});
