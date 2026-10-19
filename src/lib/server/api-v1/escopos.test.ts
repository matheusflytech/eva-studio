import { describe, it, expect } from "vitest";
import { escopoPermite, normalizarEscopos } from "./escopos";

describe("escopos da chave", () => {
  it("chave antiga (sem escopo) e * podem tudo", () => {
    expect(escopoPermite([], "deals", "write")).toBe(true);
    expect(escopoPermite(["*"], "flows", "write")).toBe(true);
  });

  it("recurso:* lê e escreve só no recurso; read não escreve", () => {
    expect(escopoPermite(["contacts:*"], "contacts", "write")).toBe(true);
    expect(escopoPermite(["contacts:*"], "deals", "read")).toBe(false);
    expect(escopoPermite(["contacts:read"], "contacts", "write")).toBe(false);
    expect(escopoPermite(["contacts:write"], "contacts", "read")).toBe(false);
  });

  it("normaliza e recusa escopo desconhecido", () => {
    expect(normalizarEscopos(undefined)).toEqual(["*"]);
    expect(normalizarEscopos(["deals:read", "contacts:write", "deals:read"])).toEqual(["contacts:write", "deals:read"]);
    expect(normalizarEscopos(["contacts:read", "*"])).toEqual(["*"]);
    expect(normalizarEscopos(["contatos:read"])).toBeNull();
    expect(normalizarEscopos(["deals:delete"])).toBeNull();
    expect(normalizarEscopos("deals:read")).toBeNull();
  });
});
