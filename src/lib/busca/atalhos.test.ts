import { describe, expect, it } from "vitest";
import {
  ATALHOS_DAS_TELAS,
  ATALHOS_GLOBAIS,
  ESPERA_DO_G,
  IR_PARA_COM_G,
  ehMac,
  interpretarTecla,
  rotuloDoAtalho,
  type Tecla,
} from "./atalhos";

const base: Tecla = { key: "", ctrl: false, meta: false, alt: false, repeat: false, emCampo: false, dialogoAberto: false };
const t = (over: Partial<Tecla>): Tecla => ({ ...base, ...over });
const vazio = { gDesde: null };

describe("interpretarTecla", () => {
  it("Ctrl+K e ⌘K abrem a paleta, até dentro de campo e de diálogo", () => {
    for (const tecla of [t({ key: "k", ctrl: true }), t({ key: "K", meta: true }), t({ key: "k", ctrl: true, emCampo: true, dialogoAberto: true })]) {
      const r = interpretarTecla(vazio, tecla, 0);
      expect(r.acao).toEqual({ tipo: "paleta" });
      expect(r.consumir).toBe(true);
    }
    expect(interpretarTecla(vazio, t({ key: "k", ctrl: true, alt: true }), 0).acao).toBeNull();
  });

  it("G depois D/N/C/E/T navega e consome a 2ª tecla (o N da tela de negócios não dispara)", () => {
    const g = interpretarTecla(vazio, t({ key: "g" }), 1000);
    expect(g.acao).toBeNull();
    expect(g.consumir).toBe(true);
    expect(g.estado.gDesde).toBe(1000);
    const esperado: Record<string, string> = { d: "/dashboard", n: "/deals", c: "/contacts", e: "/companies", t: "/tasks" };
    for (const [k, caminho] of Object.entries(esperado)) {
      const r = interpretarTecla(g.estado, t({ key: k.toUpperCase() }), 1500);
      expect(r.acao).toEqual({ tipo: "ir", caminho });
      expect(r.consumir).toBe(true);
      expect(r.estado.gDesde).toBeNull();
    }
  });

  it("G expira: depois da espera, N volta a ser da tela", () => {
    const g = interpretarTecla(vazio, t({ key: "g" }), 0);
    const r = interpretarTecla(g.estado, t({ key: "n" }), ESPERA_DO_G + 1);
    expect(r.acao).toBeNull();
    expect(r.consumir).toBe(false);
  });

  it("G seguido de tecla sem destino cancela sem engolir a tecla", () => {
    const g = interpretarTecla(vazio, t({ key: "g" }), 0);
    const r = interpretarTecla(g.estado, t({ key: "x" }), 10);
    expect(r.acao).toBeNull();
    expect(r.consumir).toBe(false);
    expect(r.estado.gDesde).toBeNull();
  });

  it("N, / e T sozinhos ficam com a tela (não são consumidos)", () => {
    for (const key of ["n", "N", "/", "t", "T"]) {
      const r = interpretarTecla(vazio, t({ key }), 0);
      expect(r.acao).toBeNull();
      expect(r.consumir).toBe(false);
    }
  });

  it("? abre a folha de atalhos; nada de letra solta digitando ou com diálogo aberto", () => {
    expect(interpretarTecla(vazio, t({ key: "?" }), 0).acao).toEqual({ tipo: "folha" });
    for (const extra of [{ emCampo: true }, { dialogoAberto: true }, { ctrl: true }, { repeat: true }]) {
      expect(interpretarTecla(vazio, t({ key: "?", ...extra }), 0).acao).toBeNull();
      expect(interpretarTecla(vazio, t({ key: "g", ...extra }), 0).estado.gDesde).toBeNull();
    }
  });
});

describe("conflitos", () => {
  it("tecla solta global não colide com tecla solta das telas", () => {
    const globais = ATALHOS_GLOBAIS.filter((a) => a.teclas.length === 1 && !a.teclas.includes("mod")).map((a) => a.teclas[0].toLowerCase());
    const dasTelas = ATALHOS_DAS_TELAS.map((a) => a.teclas[0].toLowerCase());
    expect(globais.filter((k) => dasTelas.includes(k))).toEqual([]);
    // O G (prefixo) também não é de tela nenhuma.
    expect(dasTelas).not.toContain("g");
  });

  it("todo destino do G é uma tela que existe no contrato", () => {
    for (const { caminho } of Object.values(IR_PARA_COM_G)) expect(caminho).toMatch(/^\/(dashboard|deals|contacts|companies|tasks)$/);
  });
});

describe("rótulo por plataforma", () => {
  it("⌘ no Mac, Ctrl no resto", () => {
    expect(rotuloDoAtalho(["mod", "K"], true)).toBe("⌘K");
    expect(rotuloDoAtalho(["mod", "K"], false)).toBe("Ctrl+K");
    expect(rotuloDoAtalho(["G", "N"], false)).toBe("G depois N");
    expect(rotuloDoAtalho(["?"], true)).toBe("?");
  });
  it("detecta Mac/iPhone/iPad", () => {
    expect(ehMac("MacIntel")).toBe(true);
    expect(ehMac("iPhone")).toBe(true);
    expect(ehMac("Win32")).toBe(false);
    expect(ehMac("")).toBe(false);
  });
});
