import { describe, it, expect } from "vitest";
import {
  apiDoContrato,
  contratoDoCaminho,
  destinoDoCaminhoAntigo,
  rotaDoContrato,
  tirarContrato,
  trocarContrato,
} from "./rotas";
import { comCabecalhoDoContrato, precisaDoContrato } from "./fetch-do-app";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ORIGEM = "https://app.eva";

describe("rotas do contrato", () => {
  it("põe o contrato na frente só de telas do app", () => {
    expect(rotaDoContrato(A, "/negocios/9?aba=x")).toBe(`/${A}/negocios/9?aba=x`);
    expect(rotaDoContrato(A, "/conversas?c=1")).toBe(`/${A}/conversas?c=1`);
    expect(rotaDoContrato(A, "/api/deals")).toBe("/api/deals");
    expect(rotaDoContrato(A, "/login")).toBe("/login");
    expect(rotaDoContrato(A, "https://x.com/negocios")).toBe("https://x.com/negocios");
    expect(rotaDoContrato(A, `/${A}/negocios`)).toBe(`/${A}/negocios`);
    expect(rotaDoContrato(null, "/negocios")).toBe("/negocios");
  });

  it("lê e tira o contrato do caminho", () => {
    expect(contratoDoCaminho(`/${A}/negocios/1`)).toBe(A);
    expect(contratoDoCaminho("/negocios")).toBeNull();
    expect(contratoDoCaminho("/admin")).toBeNull();
    expect(tirarContrato(`/${A}/negocios/1`)).toBe("/negocios/1");
    expect(tirarContrato(`/${A}`)).toBe("/");
    expect(tirarContrato("/admin")).toBe("/admin");
  });

  it("trocar de contrato mantém a seção, não o registro", () => {
    expect(trocarContrato(`/${A}/negocios/123`, B)).toBe(`/${B}/negocios`);
    expect(trocarContrato(`/${A}/configuracoes`, B)).toBe(`/${B}/configuracoes`);
    expect(trocarContrato("/admin", B)).toBe(`/${B}/inicio`);
  });

  it("link aberto pelo navegador leva o contrato na query", () => {
    expect(apiDoContrato(A, "/api/deals/exportar?formato=csv")).toBe(`/api/deals/exportar?formato=csv&contrato=${A}`);
    expect(apiDoContrato(A, "/api/x")).toBe(`/api/x?contrato=${A}`);
  });
});

describe("redirecionamento dos caminhos antigos", () => {
  it("vai para o último contrato usado, preservando caminho e query", () => {
    expect(destinoDoCaminhoAntigo("/negocios/42", "?aba=itens", A)).toBe(`/${A}/negocios/42?aba=itens`);
    expect(destinoDoCaminhoAntigo("/conversas", "?c=9", A)).toBe(`/${A}/conversas?c=9`);
  });

  it("sem cookie (ou cookie estranho) pergunta ao servidor em /ir", () => {
    expect(destinoDoCaminhoAntigo("/negocios/configurar", "?aba=funis", null)).toBe(
      `/ir?para=${encodeURIComponent("/negocios/configurar?aba=funis")}`
    );
    expect(destinoDoCaminhoAntigo("/inicio", "", "../etc")).toBe(`/ir?para=${encodeURIComponent("/inicio")}`);
  });

  it("não mexe no que não é tela antiga", () => {
    expect(destinoDoCaminhoAntigo(`/${A}/negocios`, "", A)).toBeNull();
    expect(destinoDoCaminhoAntigo("/login", "", A)).toBeNull();
    expect(destinoDoCaminhoAntigo("/api/deals", "", A)).toBeNull();
    expect(destinoDoCaminhoAntigo("/admin", "", A)).toBeNull();
  });
});

describe("cabeçalho do contrato no fetch", () => {
  it("cada aba manda o contrato da própria URL: duas abas não se misturam", () => {
    const [, a] = comCabecalhoDoContrato("/api/deals", undefined, `/${A}/negocios`, ORIGEM);
    const [, b] = comCabecalhoDoContrato("/api/deals", undefined, `/${B}/negocios`, ORIGEM);
    expect(new Headers(a?.headers).get("x-eva-contrato")).toBe(A);
    expect(new Headers(b?.headers).get("x-eva-contrato")).toBe(B);
  });

  it("preserva os cabeçalhos que a chamada já tinha", () => {
    const [, o] = comCabecalhoDoContrato(
      "/api/deals",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      `/${A}/negocios`,
      ORIGEM
    );
    const h = new Headers(o?.headers);
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("x-eva-contrato")).toBe(A);
    expect(o?.method).toBe("POST");
  });

  it("não manda nada fora de contrato, para outro site ou para a API pública", () => {
    expect(comCabecalhoDoContrato("/api/me", undefined, "/admin", ORIGEM)[1]).toBeUndefined();
    expect(precisaDoContrato("https://outro.com/api/deals", ORIGEM)).toBe(false);
    expect(precisaDoContrato("/api/v1/contacts", ORIGEM)).toBe(false);
    expect(precisaDoContrato("/api/webhooks/meta", ORIGEM)).toBe(false);
    expect(precisaDoContrato(`${ORIGEM}/api/deals`, ORIGEM)).toBe(true);
    expect(precisaDoContrato("/negocios", ORIGEM)).toBe(false);
  });
});
